import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { getPool } from "@content-write/db/client";
import { createMockAnalysis, validateAnalysis } from "./analysis";
import { completeIdeaJob, loadIdeaSources } from "./idea-jobs";
import { createMockIdeas } from "./ideas";

export type Claimed = {
  id: string;
  user_id: string;
  material_id: string;
  material_version: number;
  source_count: number;
  kind: string;
  claim_token: string;
  attempts: number;
};

export async function claimJob(): Promise<Claimed | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE ai_jobs SET status = 'failed', error_code = 'DEADLINE_EXCEEDED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE status IN ('queued','running') AND deadline_at <= now()",
    );
    await client.query(
      "UPDATE ai_jobs SET status = 'failed', error_code = 'ATTEMPTS_EXHAUSTED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE status = 'running' AND attempts >= 3 AND lease_until < now()",
    );
    const result = await client.query<Claimed>(
      `WITH next_job AS (
         SELECT id FROM ai_jobs
          WHERE kind IN ('material_analysis', 'idea_generation') AND deadline_at > now()
            AND attempts < 3 AND (status = 'queued' OR (status = 'running' AND lease_until < now()))
          ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE ai_jobs j SET status = 'running', claim_token = $1, lease_until = now() + interval '30 seconds',
         attempts = attempts + 1, updated_at = now()
       FROM next_job WHERE j.id = next_job.id
       RETURNING j.id, j.user_id, j.material_id, j.material_version, j.source_count, j.kind, j.claim_token, j.attempts`,
      [randomUUID()],
    );
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function renewLease(job: Claimed) {
  const result = await getPool().query(
    "UPDATE ai_jobs SET lease_until = now() + interval '30 seconds', updated_at = now() WHERE id = $1 AND claim_token = $2 AND status = 'running' AND lease_until > now() AND deadline_at > now()",
    [job.id, job.claim_token],
  );
  return result.rowCount === 1;
}

export async function completeJob(
  job: Claimed,
  result: unknown,
  durationMs: number,
) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query(
      "SELECT id FROM ai_jobs WHERE id = $1 AND claim_token = $2 AND status = 'running' AND lease_until > now() AND deadline_at > now() FOR UPDATE",
      [job.id, job.claim_token],
    );
    if (!owned.rowCount) {
      await client.query("ROLLBACK");
      return "lost" as const;
    }
    const material = await client.query<{
      content: string;
      current_version: number;
    }>(
      "SELECT content, current_version FROM materials WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [job.material_id, job.user_id],
    );
    if (
      !material.rows[0] ||
      material.rows[0].current_version !== job.material_version
    ) {
      await client.query(
        "UPDATE ai_jobs SET status = 'stale', error_code = 'MATERIAL_VERSION_CHANGED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE id = $1",
        [job.id],
      );
      await client.query("COMMIT");
      return "stale" as const;
    }
    const parsed = validateAnalysis(material.rows[0].content, result);
    if (!parsed.success) throw new Error("Invalid material analysis output");
    await client.query(
      `INSERT INTO material_analyses (id, material_id, user_id, material_version, result, mode)
       VALUES ($1,$2,$3,$4,$5::jsonb,'mock') ON CONFLICT (material_id, material_version) DO NOTHING`,
      [
        randomUUID(),
        job.material_id,
        job.user_id,
        job.material_version,
        JSON.stringify(parsed.data),
      ],
    );
    await client.query(
      "UPDATE ai_jobs SET status = 'succeeded', error_code = NULL, claim_token = NULL, lease_until = NULL, updated_at = now() WHERE id = $1",
      [job.id],
    );
    await client.query(
      "INSERT INTO ai_runs (id, job_id, user_id, mode, duration_ms) VALUES ($1,$2,$3,'mock',$4)",
      [randomUUID(), job.id, job.user_id, Math.max(0, Math.round(durationMs))],
    );
    await client.query("COMMIT");
    return "succeeded" as const;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function failJob(job: Claimed, code: string) {
  await getPool().query(
    `UPDATE ai_jobs SET status = CASE WHEN attempts < 3 AND deadline_at > now() THEN 'queued' ELSE 'failed' END,
      error_code = $3, claim_token = NULL, lease_until = NULL, updated_at = now()
     WHERE id = $1 AND claim_token = $2 AND status = 'running'`,
    [job.id, job.claim_token, code],
  );
}

export async function staleJob(job: Claimed) {
  await getPool().query(
    "UPDATE ai_jobs SET status = 'stale', error_code = 'MATERIAL_VERSION_CHANGED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE id = $1 AND claim_token = $2 AND status = 'running'",
    [job.id, job.claim_token],
  );
}

export async function processOneJob() {
  const job = await claimJob();
  if (!job) return false;
  const started = performance.now();
  const renewal = setInterval(() => {
    void renewLease(job).catch(() => undefined);
  }, 10_000);
  try {
    if (job.kind === "idea_generation") {
      const sources = await loadIdeaSources(job);
      if (!sources || sources.length !== job.source_count) {
        await staleJob(job);
        return true;
      }
      if (process.env.AI_MODE !== "mock") {
        await failJob(job, "AI_NOT_CONFIGURED");
        return true;
      }
      await completeIdeaJob(
        job,
        createMockIdeas(sources),
        performance.now() - started,
      );
      return true;
    }
    const material = await getPool().query<{
      content: string;
      current_version: number;
    }>(
      "SELECT content, current_version FROM materials WHERE id = $1 AND user_id = $2",
      [job.material_id, job.user_id],
    );
    if (
      !material.rows[0] ||
      material.rows[0].current_version !== job.material_version
    ) {
      await staleJob(job);
      return true;
    }
    if (process.env.AI_MODE !== "mock") {
      await failJob(job, "AI_NOT_CONFIGURED");
      return true;
    }
    const analysis = createMockAnalysis(material.rows[0].content);
    await completeJob(job, analysis, performance.now() - started);
  } catch {
    await failJob(
      job,
      job.kind === "idea_generation"
        ? "IDEA_GENERATION_FAILED"
        : "ANALYSIS_FAILED",
    );
  } finally {
    clearInterval(renewal);
  }
  return true;
}
