import { randomUUID } from "node:crypto";
import type { Executor } from "@content-write/db/client";
import { aiJobs, articles, editSuggestions } from "@content-write/db/schema";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

export async function findArticleBody(
  db: Executor,
  userId: string,
  articleId: string,
) {
  const [row] = await db
    .select({ version: articles.version, body: articles.body })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)));
  return row;
}

export async function hasActiveEditJob(db: Executor, articleId: string) {
  const [job] = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.articleId, articleId),
        eq(aiJobs.kind, "edit_suggestion"),
        inArray(aiJobs.status, ["queued", "running"]),
        gt(aiJobs.deadlineAt, sql`now()`),
      ),
    )
    .limit(1);
  return Boolean(job);
}

export async function findLatestEditJob(
  db: Executor,
  userId: string,
  articleId: string,
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
        eq(aiJobs.articleId, articleId),
        eq(aiJobs.userId, userId),
        eq(aiJobs.kind, "edit_suggestion"),
      ),
    )
    .orderBy(desc(aiJobs.createdAt), desc(aiJobs.id))
    .limit(1);
  return job;
}

export async function insertSuggestion(
  db: Executor,
  values: Omit<typeof editSuggestions.$inferInsert, "id" | "status">,
) {
  await db
    .insert(editSuggestions)
    .values({ id: randomUUID(), status: "pending", ...values });
}

const suggestionFields = {
  id: editSuggestions.id,
  scope: editSuggestions.scope,
  baseVersion: editSuggestions.baseVersion,
  start: editSuggestions.selectionStart,
  end: editSuggestions.selectionEnd,
  selectionText: editSuggestions.selectionText,
  instruction: editSuggestions.instruction,
  replacement: editSuggestions.replacement,
  explanation: editSuggestions.explanation,
  evidenceGaps: editSuggestions.evidenceGaps,
  mode: editSuggestions.mode,
  createdAt: editSuggestions.createdAt,
};

/** Suggestions waiting for the author, newest first. */
export function listReadySuggestions(
  db: Executor,
  userId: string,
  articleId: string,
) {
  return db
    .select(suggestionFields)
    .from(editSuggestions)
    .where(
      and(
        eq(editSuggestions.articleId, articleId),
        eq(editSuggestions.userId, userId),
        eq(editSuggestions.status, "ready"),
      ),
    )
    .orderBy(desc(editSuggestions.createdAt), desc(editSuggestions.id))
    .limit(10);
}

export async function lockSuggestion(
  db: Executor,
  userId: string,
  articleId: string,
  suggestionId: string,
) {
  const [row] = await db
    .select({
      ...suggestionFields,
      status: editSuggestions.status,
      appliedVersion: editSuggestions.appliedVersion,
    })
    .from(editSuggestions)
    .where(
      and(
        eq(editSuggestions.id, suggestionId),
        eq(editSuggestions.articleId, articleId),
        eq(editSuggestions.userId, userId),
      ),
    )
    .for("update");
  return row;
}

export async function closeSuggestion(
  db: Executor,
  suggestionId: string,
  change:
    | { status: "applied"; appliedVersion: number }
    | { status: "rejected" },
) {
  await db
    .update(editSuggestions)
    .set({ ...change, updatedAt: sql`now()` })
    .where(eq(editSuggestions.id, suggestionId));
}
