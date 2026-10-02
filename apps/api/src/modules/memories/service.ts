import { getDb } from "@content-write/db/client";
import { MEMORY_LIMIT } from "@content-write/db/memories";
import { selectWritingSamples } from "@content-write/db/writing-samples";
import { aiAvailable, aiMode } from "../../config";
import {
  enqueueJob,
  findIdempotentJob,
  hashInput,
  lockUserQueue,
} from "../ai-jobs/queue";
import * as repo from "./repository";

export class MemoryError extends Error {
  constructor(
    readonly reason:
      | "missing"
      | "version_conflict"
      | "limit"
      | "samples_required"
      | "job_active"
      | "idempotency_conflict"
      | "quota"
      | "concurrency"
      | "ai_unavailable",
  ) {
    super(reason);
    this.name = "MemoryError";
  }
}
export type MemoryChange =
  | { content: string }
  | { status: "confirmed" | "disabled" };

export async function listMemories(userId: string) {
  const db = getDb();
  const [memories, latestJob] = await Promise.all([
    repo.list(db, userId),
    repo.latestExtraction(db, userId),
  ]);
  return {
    memories,
    latestJob: latestJob ?? null,
    extraction: { available: aiAvailable(), mode: aiMode() },
  };
}

/** A memory the author writes is already their own decision, so it starts confirmed. */
export function addMemory(userId: string, content: string) {
  return getDb().transaction(async (tx) => {
    // Serializes with job enqueue, which selects confirmed memories under the same lock.
    await lockUserQueue(tx, userId);
    if ((await repo.countMemories(tx, userId)) >= MEMORY_LIMIT)
      throw new MemoryError("limit");
    return repo.insertManual(tx, userId, content);
  });
}

/** Confirming, disabling, enabling and rewording each make a new version. */
export function changeMemory(
  userId: string,
  id: string,
  expectedVersion: number,
  change: MemoryChange,
) {
  return getDb().transaction(async (tx) => {
    await lockUserQueue(tx, userId);
    const row = await repo.find(tx, userId, id);
    if (!row) throw new MemoryError("missing");
    if (row.version !== expectedVersion)
      throw new MemoryError("version_conflict");
    const unchanged =
      "content" in change
        ? row.content === change.content
        : row.status === change.status;
    if (!unchanged) await repo.update(tx, userId, id, change);
  });
}

export function deleteMemory(userId: string, id: string) {
  return getDb().transaction(async (tx) => {
    await lockUserQueue(tx, userId);
    if (!(await repo.remove(tx, userId, id))) throw new MemoryError("missing");
  });
}

/** Queues candidate extraction from the samples the author currently has enabled. */
export async function startExtraction(userId: string, key: string) {
  if (!aiAvailable()) throw new MemoryError("ai_unavailable");
  const result = await getDb().transaction(async (tx) => {
    await lockUserQueue(tx, userId);
    const writingSamples = await selectWritingSamples(tx, userId);
    const inputHash = hashInput({
      kind: "memory_extraction",
      writingSamples,
      mode: aiMode(),
    });
    const prior = await findIdempotentJob(tx, userId, key, inputHash);
    if (prior) return prior;
    if (!writingSamples.length) throw new MemoryError("samples_required");
    if ((await repo.countMemories(tx, userId)) >= MEMORY_LIMIT)
      throw new MemoryError("limit");
    if (await repo.hasActiveExtraction(tx, userId))
      throw new MemoryError("job_active");
    return enqueueJob(tx, {
      kind: "memory_extraction",
      userId,
      idempotencyKey: key,
      inputHash,
      sourceCount: writingSamples.length,
      writingSamples,
    });
  });
  if (result.status === "conflict")
    throw new MemoryError("idempotency_conflict");
  if (result.status === "quota") throw new MemoryError("quota");
  if (result.status === "concurrency") throw new MemoryError("concurrency");
  return result.jobId;
}
