import { createHash, randomUUID } from "node:crypto";
import { getPool } from "@content-write/db/client";

type SelectedSource = { id: string; version: number };
type StartResult =
  | { status: "created" | "existing"; jobId: string }
  | {
      status:
        | "missing"
        | "stale"
        | "unprocessed"
        | "conflict"
        | "quota"
        | "concurrency"
        | "unavailable";
    };

function limit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export async function startIdeaGeneration(
  userId: string,
  selected: SelectedSource[],
  key: string,
): Promise<StartResult> {
  if (process.env.AI_MODE !== "mock") return { status: "unavailable" };
  const sources = [...selected].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({ kind: "idea_generation", sources, mode: "mock" }),
      )
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
    const found = await client.query<{
      id: string;
      current_version: number;
      analysis_id: string | null;
    }>(
      `SELECT m.id, m.current_version, a.id AS analysis_id FROM materials m
         LEFT JOIN material_analyses a ON a.material_id = m.id AND a.material_version = m.current_version
        WHERE m.user_id = $1 AND m.id = ANY($2::text[]) ORDER BY m.id FOR UPDATE OF m`,
      [userId, sources.map((source) => source.id)],
    );
    if (found.rows.length !== sources.length) {
      await client.query("ROLLBACK");
      return { status: "missing" };
    }
    const versions = new Map(
      sources.map((source) => [source.id, source.version]),
    );
    if (
      found.rows.some((row) => row.current_version !== versions.get(row.id))
    ) {
      await client.query("ROLLBACK");
      return { status: "stale" };
    }
    if (found.rows.some((row) => !row.analysis_id)) {
      await client.query("ROLLBACK");
      return { status: "unprocessed" };
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
    const jobId = randomUUID();
    await client.query(
      `INSERT INTO ai_jobs (id, user_id, material_id, material_version, source_count, kind, status, idempotency_key, input_hash, deadline_at)
       VALUES ($1,$2,$3,$4,$5,'idea_generation','queued',$6,$7,now() + interval '5 minutes')`,
      [
        jobId,
        userId,
        sources[0].id,
        sources[0].version,
        sources.length,
        key,
        inputHash,
      ],
    );
    for (const source of sources) {
      await client.query(
        "INSERT INTO idea_job_sources (id, job_id, material_id, material_version) VALUES ($1,$2,$3,$4)",
        [randomUUID(), jobId, source.id, source.version],
      );
    }
    await client.query("COMMIT");
    return { status: "created", jobId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
