import { createHash, randomUUID } from "node:crypto";
import type { Executor } from "@content-write/db/client";
import { aiDailyUsage, aiJobs } from "@content-write/db/schema";
import { and, count, eq, inArray, lte, sql } from "drizzle-orm";
import { positiveIntEnv } from "../../config";

export type JobKind =
  | "material_analysis"
  | "idea_generation"
  | "outline_generation"
  | "draft_generation"
  | "reference_breakdown"
  | "edit_suggestion";

export type NewJob = {
  kind: JobKind;
  userId: string;
  idempotencyKey: string;
  inputHash: string;
  sourceCount?: number;
  materialId?: string;
  materialVersion?: number;
  articleId?: string;
  articleVersion?: number;
  referenceArticleId?: string;
  referenceVersion?: number;
};

const shanghaiToday = sql<string>`(now() AT TIME ZONE 'Asia/Shanghai')::date`;
const activeStatuses = ["queued", "running"];

export function hashInput(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

// Serializes a user's enqueue decisions so limits and idempotency see a stable view.
// Drizzle has no advisory-lock builder, hence the raw statement.
export async function lockUserQueue(db: Executor, userId: string) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
}

export async function findIdempotentJob(
  db: Executor,
  userId: string,
  key: string,
  inputHash: string,
) {
  const [prior] = await db
    .select({ id: aiJobs.id, inputHash: aiJobs.inputHash })
    .from(aiJobs)
    .where(and(eq(aiJobs.userId, userId), eq(aiJobs.idempotencyKey, key)));
  if (!prior) return null;
  return prior.inputHash === inputHash
    ? { status: "existing" as const, jobId: prior.id }
    : { status: "conflict" as const };
}

/**
 * Applies the daily and concurrency limits, records the logical generation in
 * the daily ledger and inserts the job. Call inside the transaction that holds
 * lockUserQueue; callers commit for every returned status.
 */
export async function enqueueJob(db: Executor, job: NewJob) {
  await db
    .update(aiJobs)
    .set({
      status: "failed",
      errorCode: "DEADLINE_EXCEEDED",
      claimToken: null,
      leaseUntil: null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(aiJobs.userId, job.userId),
        inArray(aiJobs.status, activeStatuses),
        lte(aiJobs.deadlineAt, sql`now()`),
      ),
    );
  const [usage] = await db
    .select({ daily: aiDailyUsage.count })
    .from(aiDailyUsage)
    .where(
      and(
        eq(aiDailyUsage.userId, job.userId),
        eq(aiDailyUsage.day, shanghaiToday),
      ),
    );
  const [active] = await db
    .select({ count: count() })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.userId, job.userId),
        inArray(aiJobs.status, activeStatuses),
      ),
    );
  if ((usage?.daily ?? 0) >= positiveIntEnv("AI_DAILY_JOB_LIMIT", 20))
    return { status: "quota" as const };
  if ((active?.count ?? 0) >= positiveIntEnv("AI_USER_CONCURRENCY", 2))
    return { status: "concurrency" as const };
  await db
    .insert(aiDailyUsage)
    .values({ userId: job.userId, day: shanghaiToday, count: 1 })
    .onConflictDoUpdate({
      target: [aiDailyUsage.userId, aiDailyUsage.day],
      set: { count: sql`${aiDailyUsage.count} + 1` },
    });
  const jobId = randomUUID();
  await db.insert(aiJobs).values({
    id: jobId,
    userId: job.userId,
    kind: job.kind,
    status: "queued",
    idempotencyKey: job.idempotencyKey,
    inputHash: job.inputHash,
    sourceCount: job.sourceCount ?? 1,
    materialId: job.materialId ?? null,
    materialVersion: job.materialVersion ?? null,
    articleId: job.articleId ?? null,
    articleVersion: job.articleVersion ?? null,
    referenceArticleId: job.referenceArticleId ?? null,
    referenceVersion: job.referenceVersion ?? null,
    deadlineAt: sql`now() + interval '5 minutes'`,
  });
  return { status: "created" as const, jobId };
}
