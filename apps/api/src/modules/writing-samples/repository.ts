import { randomUUID } from "node:crypto";
import type { Executor } from "@content-write/db/client";
import { writingSamples } from "@content-write/db/schema";
import { and, count, desc, eq, sql } from "drizzle-orm";
export async function list(db: Executor, userId: string) {
  return db
    .select()
    .from(writingSamples)
    .where(eq(writingSamples.userId, userId))
    .orderBy(desc(writingSamples.createdAt), desc(writingSamples.id));
}
export async function countSamples(db: Executor, userId: string) {
  const [row] = await db
    .select({ count: count() })
    .from(writingSamples)
    .where(eq(writingSamples.userId, userId));
  return row.count;
}
export async function insert(
  db: Executor,
  userId: string,
  input: { title: string; content: string },
) {
  const [row] = await db
    .insert(writingSamples)
    .values({ id: randomUUID(), userId, ...input })
    .returning();
  return row;
}
export async function find(db: Executor, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(writingSamples)
    .where(and(eq(writingSamples.userId, userId), eq(writingSamples.id, id)))
    .for("update");
  return row;
}
export async function setEnabled(
  db: Executor,
  userId: string,
  id: string,
  enabled: boolean,
) {
  const [row] = await db
    .update(writingSamples)
    .set({ enabled, version: sql`${writingSamples.version} + 1` })
    .where(and(eq(writingSamples.userId, userId), eq(writingSamples.id, id)))
    .returning();
  return row;
}
export async function remove(db: Executor, userId: string, id: string) {
  const [row] = await db
    .delete(writingSamples)
    .where(and(eq(writingSamples.userId, userId), eq(writingSamples.id, id)))
    .returning({ id: writingSamples.id });
  return row;
}
