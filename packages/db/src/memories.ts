import { and, desc, eq, inArray } from "drizzle-orm";
import type { Executor } from "./client";
import { memories } from "./schema";
export type MemoryRef = { id: string; version: number };
export type ConfirmedMemory = MemoryRef & { content: string };
export const MEMORY_LIMIT = 50;
export const MEMORY_CHARS = 200;
export const CONTEXT_MEMORY_LIMIT = 20;
export const EXTRACTED_CANDIDATE_LIMIT = 8;

/** Same text regardless of spacing, so re-extraction does not repeat a memory. */
export const memoryKey = (content: string) =>
  content.replace(/\s+/g, "").toLowerCase();

/** Only confirmed memories may enter a prompt; jobs persist ids and versions. */
export async function selectMemories(
  db: Executor,
  userId: string,
): Promise<MemoryRef[]> {
  return db
    .select({ id: memories.id, version: memories.version })
    .from(memories)
    .where(and(eq(memories.userId, userId), eq(memories.status, "confirmed")))
    .orderBy(desc(memories.createdAt), desc(memories.id))
    .limit(CONTEXT_MEMORY_LIMIT);
}

/** Recheck ownership, confirmed state and version immediately before model input. */
export async function readMemories(
  db: Executor,
  userId: string,
  refs: MemoryRef[],
): Promise<ConfirmedMemory[]> {
  const bounded = refs.slice(0, CONTEXT_MEMORY_LIMIT);
  if (!bounded.length) return [];
  const rows = await db
    .select({
      id: memories.id,
      version: memories.version,
      content: memories.content,
    })
    .from(memories)
    .where(
      and(
        eq(memories.userId, userId),
        eq(memories.status, "confirmed"),
        inArray(
          memories.id,
          bounded.map((ref) => ref.id),
        ),
      ),
    );
  return bounded.flatMap((ref) => {
    const row = rows.find(
      (row) => row.id === ref.id && row.version === ref.version,
    );
    return row ? [row] : [];
  });
}
