import { randomUUID } from "node:crypto";
import { type Executor, getDb } from "@content-write/db/client";
import {
  aiJobs,
  aiRuns,
  type BreakdownResult,
  breakdowns,
  referenceArticles,
} from "@content-write/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import type { RunMeta } from "./ai/generate";
import { validateBreakdown } from "./breakdown";
import type { Claimed } from "./jobs";
import { mockRun, runUsage } from "./runs";

async function readReference(db: Executor, job: Claimed, lock: boolean) {
  if (!job.reference_article_id) return undefined;
  const query = db
    .select({
      title: referenceArticles.title,
      content: referenceArticles.content,
      currentVersion: referenceArticles.currentVersion,
    })
    .from(referenceArticles)
    .where(
      and(
        eq(referenceArticles.id, job.reference_article_id),
        eq(referenceArticles.userId, job.user_id),
      ),
    );
  const [reference] = await (lock ? query.for("update") : query);
  // A deleted or edited reference must not be sent to the model or receive a result.
  return reference?.currentVersion === job.reference_version
    ? reference
    : undefined;
}

/** The reference the job was queued for, or null when it changed or was deleted. */
export async function loadBreakdownReference(job: Claimed) {
  const reference = await readReference(getDb(), job, false);
  return reference?.content.trim()
    ? { title: reference.title, content: reference.content }
    : null;
}

export async function completeBreakdownJob(
  job: Claimed,
  output: BreakdownResult,
  durationMs: number,
  meta: RunMeta = mockRun,
) {
  return getDb().transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: aiJobs.id })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.id, job.id),
          eq(aiJobs.claimToken, job.claim_token),
          eq(aiJobs.status, "running"),
          gt(aiJobs.leaseUntil, sql`now()`),
          gt(aiJobs.deadlineAt, sql`now()`),
        ),
      )
      .for("update");
    if (!owned) return "lost" as const;
    const reference = await readReference(tx, job, true);
    if (!reference || job.reference_version === null) {
      await tx
        .update(aiJobs)
        .set({
          status: "stale",
          errorCode: "REFERENCE_VERSION_CHANGED",
          claimToken: null,
          leaseUntil: null,
          updatedAt: sql`now()`,
        })
        .where(eq(aiJobs.id, job.id));
      return "stale" as const;
    }
    const checked = validateBreakdown(reference.content, output);
    if (!checked.success) throw new Error("Invalid breakdown output");
    await tx
      .insert(breakdowns)
      .values({
        id: randomUUID(),
        referenceArticleId: job.reference_article_id as string,
        userId: job.user_id,
        referenceVersion: job.reference_version,
        result: checked.data,
        mode: meta.mode,
      })
      .onConflictDoNothing();
    await tx
      .update(aiJobs)
      .set({
        status: "succeeded",
        errorCode: null,
        claimToken: null,
        leaseUntil: null,
        updatedAt: sql`now()`,
      })
      .where(eq(aiJobs.id, job.id));
    await tx.insert(aiRuns).values({
      id: randomUUID(),
      jobId: job.id,
      userId: job.user_id,
      ...runUsage(meta),
      durationMs: Math.max(0, Math.round(durationMs)),
    });
    return "succeeded" as const;
  });
}
