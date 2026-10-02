import { randomUUID } from "node:crypto";
import { getDb } from "@content-write/db/client";
import { MEMORY_LIMIT, memoryKey } from "@content-write/db/memories";
import { aiJobs, aiRuns, memories } from "@content-write/db/schema";
import { lockUserQueue } from "@content-write/db/user-lock";
import { readWritingSamples } from "@content-write/db/writing-samples";
import { and, eq, gt, sql } from "drizzle-orm";
import type { RunMeta } from "./ai/generate";
import type { Claimed } from "./jobs";
import { evidenceCurrent, type MemoryExtraction } from "./memories";
import { mockRun, runUsage } from "./runs";

/** Saves verifiable, new candidates within the author's remaining memory allowance. */
export async function completeMemoryJob(
  job: Claimed,
  output: MemoryExtraction,
  durationMs: number,
  meta: RunMeta = mockRun,
) {
  return getDb().transaction(async (tx) => {
    // Same lock as manual adds, so the count limit holds under concurrency.
    await lockUserQueue(tx, job.user_id);
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
    const samples = await readWritingSamples(
      tx,
      job.user_id,
      job.writing_samples ?? [],
    );
    if (!samples.length) {
      await tx
        .update(aiJobs)
        .set({
          status: "stale",
          errorCode: "SAMPLES_CHANGED",
          claimToken: null,
          leaseUntil: null,
          updatedAt: sql`now()`,
        })
        .where(eq(aiJobs.id, job.id));
      return "stale" as const;
    }
    const existing = await tx
      .select({ content: memories.content })
      .from(memories)
      .where(eq(memories.userId, job.user_id));
    const seen = new Set(existing.map((row) => memoryKey(row.content)));
    const fresh = output.memories.flatMap((memory) => {
      // Samples disabled or changed since the model call no longer back a candidate.
      const evidence = memory.evidence.filter((item) =>
        evidenceCurrent(samples, item),
      );
      const key = memoryKey(memory.content);
      if (!evidence.length || seen.has(key)) return [];
      seen.add(key);
      return [{ content: memory.content, evidence }];
    });
    const room = Math.max(0, MEMORY_LIMIT - existing.length);
    const saved = fresh.slice(0, room);
    if (saved.length)
      await tx.insert(memories).values(
        saved.map((memory) => ({
          id: randomUUID(),
          userId: job.user_id,
          content: memory.content,
          status: "candidate" as const,
          origin: "extracted" as const,
          evidence: memory.evidence,
          mode: meta.mode,
          jobId: job.id,
        })),
      );
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
