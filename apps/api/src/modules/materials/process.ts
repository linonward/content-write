import { createHash, randomUUID } from "node:crypto";
import { getPool } from "@content-write/db/client";

type StartResult =
  | { status: "created" | "existing"; jobId: string }
  | {
      status:
        | "missing"
        | "conflict"
        | "quota"
        | "concurrency"
        | "unavailable"
        | "no_content"
        | "already_done";
    };

function limit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export async function startAnalysis(
  userId: string,
  materialId: string,
  key: string,
  expectedVersion?: number,
): Promise<StartResult> {
  if (process.env.AI_MODE !== "mock") return { status: "unavailable" };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
    const item = await client.query<{
      current_version: number;
      content: string;
    }>(
      "SELECT current_version, content FROM materials WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [materialId, userId],
    );
    if (!item.rows[0]) {
      await client.query("ROLLBACK");
      return { status: "missing" };
    }
    if (
      expectedVersion !== undefined &&
      item.rows[0].current_version !== expectedVersion
    ) {
      await client.query("ROLLBACK");
      return { status: "conflict" };
    }
    if (!item.rows[0].content.trim()) {
      await client.query("ROLLBACK");
      return { status: "no_content" };
    }
    const version = item.rows[0].current_version;
    const inputHash = createHash("sha256")
      .update(JSON.stringify({ materialId, version, mode: "mock" }))
      .digest("hex");
    const prior = await client.query<{ id: string; input_hash: string }>(
      "SELECT id, input_hash FROM ai_jobs WHERE user_id = $1 AND idempotency_key = $2",
      [userId, key],
    );
    if (prior.rows[0]) {
      await client.query("COMMIT");
      return prior.rows[0].input_hash === inputHash
        ? { status: "existing", jobId: prior.rows[0].id }
        : { status: "conflict" };
    }
    const done = await client.query(
      "SELECT 1 FROM material_analyses WHERE material_id = $1 AND material_version = $2",
      [materialId, version],
    );
    if (done.rowCount) {
      await client.query("COMMIT");
      return { status: "already_done" };
    }
    await client.query(
      "UPDATE ai_jobs SET status = 'failed', error_code = 'DEADLINE_EXCEEDED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE user_id = $1 AND status IN ('queued', 'running') AND deadline_at <= now()",
      [userId],
    );
    const usage = await client.query<{ daily: string; active: string }>(
      `SELECT count(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')::text AS daily,
              count(*) FILTER (WHERE status IN ('queued', 'running'))::text AS active
         FROM ai_jobs WHERE user_id = $1`,
      [userId],
    );
    if (Number(usage.rows[0]?.daily) >= limit("AI_DAILY_JOB_LIMIT", 20)) {
      await client.query("COMMIT");
      return { status: "quota" };
    }
    if (Number(usage.rows[0]?.active) >= limit("AI_USER_CONCURRENCY", 2)) {
      await client.query("COMMIT");
      return { status: "concurrency" };
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO ai_jobs (id, user_id, material_id, material_version, kind, status, idempotency_key, input_hash, deadline_at)
       VALUES ($1,$2,$3,$4,'material_analysis','queued',$5,$6,now() + interval '5 minutes')`,
      [id, userId, materialId, version, key, inputHash],
    );
    await client.query("COMMIT");
    return { status: "created", jobId: id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAnalysis(userId: string, materialId: string) {
  const result = await getPool().query<{
    current_version: number;
    has_content: boolean;
    result: unknown;
    mode: string | null;
    material_version: number | null;
    job_id: string | null;
    job_status: string | null;
  }>(
    `SELECT m.current_version, length(trim(m.content)) > 0 AS has_content, a.result, a.mode, a.material_version, j.id AS job_id, j.status AS job_status
       FROM materials m LEFT JOIN material_analyses a ON a.material_id = m.id AND a.material_version = m.current_version
       LEFT JOIN LATERAL (SELECT id, status FROM ai_jobs WHERE material_id = m.id AND material_version = m.current_version ORDER BY created_at DESC LIMIT 1) j ON true
      WHERE m.id = $1 AND m.user_id = $2`,
    [materialId, userId],
  );
  return result.rows[0] ?? null;
}

export async function getJob(userId: string, jobId: string) {
  const result = await getPool().query<{
    id: string;
    material_id: string;
    material_version: number;
    status: string;
    error_code: string | null;
    updated_at: Date;
    result: unknown;
    mode: string | null;
  }>(
    `SELECT j.id, j.material_id, j.material_version, j.status, j.error_code, j.updated_at, a.result, a.mode
       FROM ai_jobs j LEFT JOIN material_analyses a ON j.kind = 'material_analysis' AND a.material_id = j.material_id AND a.material_version = j.material_version
      WHERE j.id = $1 AND j.user_id = $2`,
    [jobId, userId],
  );
  return result.rows[0] ?? null;
}
