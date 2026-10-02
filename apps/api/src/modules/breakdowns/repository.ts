import { randomUUID } from "node:crypto";
import type { Executor } from "@content-write/db/client";
import {
  aiJobs,
  breakdowns,
  referenceArticleRevisions,
  referenceArticles,
} from "@content-write/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export type FetchStatus = "fetched" | "failed" | "disabled" | "manual";
export type ReferenceInput = { title: string; content: string };
export type ReferenceCreation = ReferenceInput & {
  sourceUrl?: string;
  fetchStatus?: FetchStatus;
};

const JOB_KIND = "reference_breakdown";

const summaryColumns = {
  id: referenceArticles.id,
  title: referenceArticles.title,
  sourceUrl: referenceArticles.sourceUrl,
  fetchStatus: referenceArticles.fetchStatus,
  currentVersion: referenceArticles.currentVersion,
  contentLength: sql<number>`char_length(${referenceArticles.content})`,
  createdAt: referenceArticles.createdAt,
  updatedAt: referenceArticles.updatedAt,
};

export function listReferences(db: Executor, userId: string) {
  return db
    .select(summaryColumns)
    .from(referenceArticles)
    .where(eq(referenceArticles.userId, userId))
    .orderBy(desc(referenceArticles.updatedAt), desc(referenceArticles.id))
    .limit(101);
}

/** Versions that already have a breakdown, for the given references. */
export function listBrokenDownVersions(db: Executor, ids: string[]) {
  if (!ids.length) return Promise.resolve([]);
  return db
    .select({
      referenceArticleId: breakdowns.referenceArticleId,
      referenceVersion: breakdowns.referenceVersion,
    })
    .from(breakdowns)
    .where(inArray(breakdowns.referenceArticleId, ids));
}

/** Breakdown jobs for the given references, newest first. */
export function listJobs(db: Executor, ids: string[]) {
  if (!ids.length) return Promise.resolve([]);
  return db
    .select({
      id: aiJobs.id,
      referenceArticleId: aiJobs.referenceArticleId,
      referenceVersion: aiJobs.referenceVersion,
      status: aiJobs.status,
      errorCode: aiJobs.errorCode,
    })
    .from(aiJobs)
    .where(
      and(eq(aiJobs.kind, JOB_KIND), inArray(aiJobs.referenceArticleId, ids)),
    )
    .orderBy(desc(aiJobs.createdAt), desc(aiJobs.id));
}

export async function findReference(db: Executor, userId: string, id: string) {
  const [item] = await db
    .select()
    .from(referenceArticles)
    .where(
      and(eq(referenceArticles.id, id), eq(referenceArticles.userId, userId)),
    )
    .limit(1);
  return item;
}

export async function lockReference(db: Executor, userId: string, id: string) {
  const [item] = await db
    .select({
      currentVersion: referenceArticles.currentVersion,
      content: referenceArticles.content,
    })
    .from(referenceArticles)
    .where(
      and(eq(referenceArticles.id, id), eq(referenceArticles.userId, userId)),
    )
    .for("update");
  return item;
}

export async function findBreakdown(
  db: Executor,
  referenceArticleId: string,
  version: number,
) {
  const [item] = await db
    .select({
      id: breakdowns.id,
      referenceVersion: breakdowns.referenceVersion,
      result: breakdowns.result,
      mode: breakdowns.mode,
      createdAt: breakdowns.createdAt,
    })
    .from(breakdowns)
    .where(
      and(
        eq(breakdowns.referenceArticleId, referenceArticleId),
        eq(breakdowns.referenceVersion, version),
      ),
    )
    .limit(1);
  return item;
}

export async function findLatestJob(
  db: Executor,
  referenceArticleId: string,
  version: number,
) {
  const [job] = await db
    .select({
      id: aiJobs.id,
      status: aiJobs.status,
      errorCode: aiJobs.errorCode,
    })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.kind, JOB_KIND),
        eq(aiJobs.referenceArticleId, referenceArticleId),
        eq(aiJobs.referenceVersion, version),
      ),
    )
    .orderBy(desc(aiJobs.createdAt), desc(aiJobs.id))
    .limit(1);
  return job;
}

export async function hasActiveJob(db: Executor, referenceArticleId: string) {
  const [job] = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.kind, JOB_KIND),
        eq(aiJobs.referenceArticleId, referenceArticleId),
        inArray(aiJobs.status, ["queued", "running"]),
      ),
    )
    .limit(1);
  return job !== undefined;
}

export async function insertReference(
  db: Executor,
  userId: string,
  input: ReferenceCreation,
) {
  const [item] = await db
    .insert(referenceArticles)
    .values({ id: randomUUID(), userId, ...input })
    .returning({ id: referenceArticles.id });
  await db.insert(referenceArticleRevisions).values({
    id: randomUUID(),
    referenceArticleId: item.id,
    userId,
    version: 1,
    ...input,
  });
  return item.id;
}

/** Writes a new version when the expected one is current; returns null otherwise. */
export async function updateReference(
  db: Executor,
  userId: string,
  id: string,
  expectedVersion: number,
  input: ReferenceInput,
) {
  const [item] = await db
    .update(referenceArticles)
    .set({
      ...input,
      fetchStatus: sql`case when ${referenceArticles.sourceUrl} is not null then 'manual' else ${referenceArticles.fetchStatus} end`,
      currentVersion: expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(referenceArticles.id, id),
        eq(referenceArticles.userId, userId),
        eq(referenceArticles.currentVersion, expectedVersion),
      ),
    )
    .returning();
  if (!item) return null;
  await db.insert(referenceArticleRevisions).values({
    id: randomUUID(),
    referenceArticleId: id,
    userId,
    version: item.currentVersion,
    sourceUrl: item.sourceUrl,
    fetchStatus: item.fetchStatus,
    ...input,
  });
  return item;
}

/** Revisions, breakdowns and breakdown jobs cascade with the row. */
export async function deleteReference(
  db: Executor,
  userId: string,
  id: string,
) {
  const deleted = await db
    .delete(referenceArticles)
    .where(
      and(eq(referenceArticles.id, id), eq(referenceArticles.userId, userId)),
    )
    .returning({ id: referenceArticles.id });
  return deleted.length === 1;
}
