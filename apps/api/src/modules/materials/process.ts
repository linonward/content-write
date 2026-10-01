import { fromClient, getPool } from "@content-write/db/client";
import { aiAvailable } from "../../config";
import {
  enqueueJob,
  findIdempotentJob,
  hashInput,
  lockUserQueue,
} from "../ai-jobs/queue";

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

export async function startAnalysis(
  userId: string,
  materialId: string,
  key: string,
  expectedVersion?: number,
): Promise<StartResult> {
  if (!aiAvailable()) return { status: "unavailable" };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // T027b/c move this module to getDb().transaction(); until then share the pg transaction.
    const db = fromClient(client);
    await lockUserQueue(db, userId);
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
    const inputHash = hashInput({ materialId, version, mode: "mock" });
    const prior = await findIdempotentJob(db, userId, key, inputHash);
    if (prior) {
      await client.query("COMMIT");
      return prior;
    }
    const done = await client.query(
      "SELECT 1 FROM material_analyses WHERE material_id = $1 AND material_version = $2",
      [materialId, version],
    );
    if (done.rowCount) {
      await client.query("COMMIT");
      return { status: "already_done" };
    }
    const result = await enqueueJob(db, {
      kind: "material_analysis",
      userId,
      idempotencyKey: key,
      inputHash,
      materialId,
      materialVersion: version,
    });
    await client.query("COMMIT");
    return result;
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
       LEFT JOIN LATERAL (SELECT id, status FROM ai_jobs WHERE kind = 'material_analysis' AND material_id = m.id AND material_version = m.current_version ORDER BY created_at DESC, id DESC LIMIT 1) j ON true
      WHERE m.id = $1 AND m.user_id = $2`,
    [materialId, userId],
  );
  return result.rows[0] ?? null;
}
