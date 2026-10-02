import { randomUUID } from "node:crypto";
import type { Executor } from "@content-write/db/client";
import { aiJobs, memories } from "@content-write/db/schema";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

export async function list(db: Executor, userId: string) {
  return db
    .select({
      id: memories.id,
      content: memories.content,
      status: memories.status,
      origin: memories.origin,
      evidence: memories.evidence,
      mode: memories.mode,
      jobId: memories.jobId,
      version: memories.version,
      createdAt: memories.createdAt,
      updatedAt: memories.updatedAt,
    })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.createdAt), desc(memories.id));
}
export async function countMemories(db: Executor, userId: string) {
  const [row] = await db
    .select({ count: count() })
    .from(memories)
    .where(eq(memories.userId, userId));
  return row.count;
}
export async function insertManual(
  db: Executor,
  userId: string,
  content: string,
) {
  const [row] = await db
    .insert(memories)
    .values({
      id: randomUUID(),
      userId,
      content,
      status: "confirmed",
      origin: "manual",
    })
    .returning({ id: memories.id });
  return row.id;
}
export async function find(db: Executor, userId: string, id: string) {
  const [row] = await db
    .select({
      status: memories.status,
      content: memories.content,
      version: memories.version,
    })
    .from(memories)
    .where(and(eq(memories.userId, userId), eq(memories.id, id)))
    .for("update");
  return row;
}
export async function update(
  db: Executor,
  userId: string,
  id: string,
  change: { content: string } | { status: "confirmed" | "disabled" },
) {
  await db
    .update(memories)
    .set({
      ...change,
      version: sql`${memories.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(memories.userId, userId), eq(memories.id, id)));
}
export async function remove(db: Executor, userId: string, id: string) {
  const [row] = await db
    .delete(memories)
    .where(and(eq(memories.userId, userId), eq(memories.id, id)))
    .returning({ id: memories.id });
  return row;
}
export async function latestExtraction(db: Executor, userId: string) {
  const [row] = await db
    .select({
      id: aiJobs.id,
      status: aiJobs.status,
      errorCode: aiJobs.errorCode,
      updatedAt: aiJobs.updatedAt,
    })
    .from(aiJobs)
    .where(and(eq(aiJobs.userId, userId), eq(aiJobs.kind, "memory_extraction")))
    .orderBy(desc(aiJobs.createdAt), desc(aiJobs.id))
    .limit(1);
  return row;
}
export async function hasActiveExtraction(db: Executor, userId: string) {
  const [row] = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.userId, userId),
        eq(aiJobs.kind, "memory_extraction"),
        inArray(aiJobs.status, ["queued", "running"]),
      ),
    )
    .limit(1);
  return Boolean(row);
}
