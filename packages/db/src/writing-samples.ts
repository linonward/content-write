import { and, desc, eq, inArray } from "drizzle-orm";
import type { Executor } from "./client";
import { writingSamples } from "./schema";
export type SampleRef = { id: string; version: number };
export type StyleSample = SampleRef & { title: string; content: string };
export const SAMPLE_LIMIT = 20;
export const CONTEXT_SAMPLE_LIMIT = 3;
export const SAMPLE_EXCERPT_CHARS = 2000;

/** Only metadata is persisted on jobs: deleting a sample removes its body. */
export async function selectWritingSamples(
  db: Executor,
  userId: string,
): Promise<SampleRef[]> {
  return db
    .select({ id: writingSamples.id, version: writingSamples.version })
    .from(writingSamples)
    .where(
      and(eq(writingSamples.userId, userId), eq(writingSamples.enabled, true)),
    )
    .orderBy(desc(writingSamples.createdAt), desc(writingSamples.id))
    .limit(CONTEXT_SAMPLE_LIMIT);
}

/** Recheck ownership, enabled state and version immediately before model input. */
export async function readWritingSamples(
  db: Executor,
  userId: string,
  refs: SampleRef[],
): Promise<StyleSample[]> {
  const bounded = refs.slice(0, CONTEXT_SAMPLE_LIMIT);
  if (!bounded.length) return [];
  const rows = await db
    .select()
    .from(writingSamples)
    .where(
      and(
        eq(writingSamples.userId, userId),
        eq(writingSamples.enabled, true),
        inArray(
          writingSamples.id,
          bounded.map((ref) => ref.id),
        ),
      ),
    );
  return bounded.flatMap((ref) => {
    const row = rows.find(
      (row) => row.id === ref.id && row.version === ref.version,
    );
    return row
      ? [
          {
            ...ref,
            title: row.title,
            content: row.content.slice(0, SAMPLE_EXCERPT_CHARS),
          },
        ]
      : [];
  });
}
