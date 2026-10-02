import { randomUUID } from "node:crypto";
import { currentProfileVersion } from "@content-write/db/author-profile";
import { fromClient, getPool } from "@content-write/db/client";
import { selectWritingSamples } from "@content-write/db/writing-samples";
import { aiAvailable, aiMode } from "../../config";
import {
  enqueueJob,
  findIdempotentJob,
  hashInput,
  lockUserQueue,
} from "../ai-jobs/queue";

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

export async function startIdeaGeneration(
  userId: string,
  selected: SelectedSource[],
  key: string,
): Promise<StartResult> {
  if (!aiAvailable()) return { status: "unavailable" };
  const sources = [...selected].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // T027b/c move this module to getDb().transaction(); until then share the pg transaction.
    const db = fromClient(client);
    await lockUserQueue(db, userId);
    const profileVersion = await currentProfileVersion(db, userId);
    const writingSamples = await selectWritingSamples(db, userId);
    const inputHash = hashInput({
      kind: "idea_generation",
      sources,
      // Undefined without a profile, keeping hashes of earlier jobs.
      profile: profileVersion ?? undefined,
      writingSamples: writingSamples.length ? writingSamples : undefined,
      mode: aiMode(),
    });
    const prior = await findIdempotentJob(db, userId, key, inputHash);
    if (prior) {
      await client.query("COMMIT");
      return prior;
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
    const result = await enqueueJob(db, {
      kind: "idea_generation",
      userId,
      idempotencyKey: key,
      inputHash,
      sourceCount: sources.length,
      profileVersion,
      writingSamples,
    });
    if (result.status !== "created") {
      await client.query("COMMIT");
      return result;
    }
    for (const source of sources) {
      await client.query(
        "INSERT INTO idea_job_sources (id, job_id, material_id, material_version) VALUES ($1,$2,$3,$4)",
        [randomUUID(), result.jobId, source.id, source.version],
      );
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
