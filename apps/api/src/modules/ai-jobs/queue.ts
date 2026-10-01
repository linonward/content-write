import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "@content-write/db/client";
import { positiveIntEnv } from "../../config";

export type JobKind =
  | "material_analysis"
  | "idea_generation"
  | "outline_generation";

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
};

export function hashInput(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

// Serializes a user's enqueue decisions so limits and idempotency see a stable view.
export async function lockUserQueue(client: PoolClient, userId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
}

export async function findIdempotentJob(
  client: PoolClient,
  userId: string,
  key: string,
  inputHash: string,
) {
  const prior = await client.query<{ id: string; input_hash: string }>(
    "SELECT id, input_hash FROM ai_jobs WHERE user_id = $1 AND idempotency_key = $2",
    [userId, key],
  );
  if (!prior.rows[0]) return null;
  return prior.rows[0].input_hash === inputHash
    ? { status: "existing" as const, jobId: prior.rows[0].id }
    : { status: "conflict" as const };
}

/**
 * Applies the daily and concurrency limits, records the logical generation in
 * the daily ledger and inserts the job. Call inside the transaction that holds
 * lockUserQueue; callers commit for every returned status.
 */
export async function enqueueJob(client: PoolClient, job: NewJob) {
  await client.query(
    "UPDATE ai_jobs SET status = 'failed', error_code = 'DEADLINE_EXCEEDED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE user_id = $1 AND status IN ('queued', 'running') AND deadline_at <= now()",
    [job.userId],
  );
  const usage = await client.query<{ daily: number; active: string }>(
    `SELECT COALESCE((SELECT count FROM ai_daily_usage
                       WHERE user_id = $1 AND day = (now() AT TIME ZONE 'Asia/Shanghai')::date), 0) AS daily,
            (SELECT count(*)::text FROM ai_jobs WHERE user_id = $1 AND status IN ('queued', 'running')) AS active`,
    [job.userId],
  );
  if (Number(usage.rows[0]?.daily) >= positiveIntEnv("AI_DAILY_JOB_LIMIT", 20))
    return { status: "quota" as const };
  if (Number(usage.rows[0]?.active) >= positiveIntEnv("AI_USER_CONCURRENCY", 2))
    return { status: "concurrency" as const };
  await client.query(
    `INSERT INTO ai_daily_usage (user_id, day, count)
     VALUES ($1, (now() AT TIME ZONE 'Asia/Shanghai')::date, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET count = ai_daily_usage.count + 1`,
    [job.userId],
  );
  const jobId = randomUUID();
  await client.query(
    `INSERT INTO ai_jobs (id, user_id, kind, status, idempotency_key, input_hash, source_count,
                          material_id, material_version, article_id, article_version, deadline_at)
     VALUES ($1,$2,$3,'queued',$4,$5,$6,$7,$8,$9,$10,now() + interval '5 minutes')`,
    [
      jobId,
      job.userId,
      job.kind,
      job.idempotencyKey,
      job.inputHash,
      job.sourceCount ?? 1,
      job.materialId ?? null,
      job.materialVersion ?? null,
      job.articleId ?? null,
      job.articleVersion ?? null,
    ],
  );
  return { status: "created" as const, jobId };
}
