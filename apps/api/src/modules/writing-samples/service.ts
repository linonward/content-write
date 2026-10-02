import { getDb } from "@content-write/db/client";
import { SAMPLE_LIMIT } from "@content-write/db/writing-samples";
import { lockUserQueue } from "../ai-jobs/queue";
import * as repo from "./repository";
export class SampleError extends Error {
  constructor(readonly reason: "missing" | "version_conflict" | "limit") {
    super(reason);
    this.name = "SampleError";
  }
}
export function listSamples(userId: string) {
  return repo.list(getDb(), userId);
}
export function addSample(
  userId: string,
  input: { title: string; content: string },
) {
  return getDb().transaction(async (tx) => {
    // Serialize sample creation and enqueue selection for the same user.
    await lockUserQueue(tx, userId);
    if ((await repo.countSamples(tx, userId)) >= SAMPLE_LIMIT)
      throw new SampleError("limit");
    return repo.insert(tx, userId, input);
  });
}
export function toggleSample(
  userId: string,
  id: string,
  expectedVersion: number,
  enabled: boolean,
) {
  return getDb().transaction(async (tx) => {
    await lockUserQueue(tx, userId);
    const row = await repo.find(tx, userId, id);
    if (!row) throw new SampleError("missing");
    if (row.version !== expectedVersion)
      throw new SampleError("version_conflict");
    return row.enabled === enabled
      ? row
      : repo.setEnabled(tx, userId, id, enabled);
  });
}
export function deleteSample(userId: string, id: string) {
  return getDb().transaction(async (tx) => {
    await lockUserQueue(tx, userId);
    if (!(await repo.remove(tx, userId, id))) throw new SampleError("missing");
  });
}
