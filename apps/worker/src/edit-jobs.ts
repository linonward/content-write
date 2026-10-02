import { randomUUID } from "node:crypto";
import { readArticleSources } from "@content-write/db/article-sources";
import { type Executor, getDb } from "@content-write/db/client";
import { selectionCurrent } from "@content-write/db/edit-suggestions";
import {
  aiJobs,
  aiRuns,
  articles,
  editSuggestions,
} from "@content-write/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import type { RunMeta } from "./ai/generate";
import {
  CONTEXT_CHARS,
  type Edit,
  type EditContext,
  validateEdit,
} from "./edit";
import type { Claimed } from "./jobs";
import { mockRun, runUsage } from "./runs";

async function readSuggestion(db: Executor, job: Claimed, lock: boolean) {
  const query = db
    .select({
      id: editSuggestions.id,
      status: editSuggestions.status,
      scope: editSuggestions.scope,
      baseVersion: editSuggestions.baseVersion,
      start: editSuggestions.selectionStart,
      end: editSuggestions.selectionEnd,
      selectionText: editSuggestions.selectionText,
      instruction: editSuggestions.instruction,
    })
    .from(editSuggestions)
    .where(
      and(
        eq(editSuggestions.jobId, job.id),
        eq(editSuggestions.userId, job.user_id),
      ),
    );
  const [row] = await (lock ? query.for("update") : query);
  return row;
}

async function readArticle(db: Executor, job: Claimed, lock: boolean) {
  const query = db
    .select({
      version: articles.version,
      body: articles.body,
      workingTitle: articles.workingTitle,
      audience: articles.audience,
      thesis: articles.thesis,
    })
    .from(articles)
    .where(
      and(
        eq(articles.id, job.article_id ?? ""),
        eq(articles.userId, job.user_id),
      ),
    );
  const [row] = await (lock ? query.for("update") : query);
  return row;
}

/**
 * The model input, or null when the body changed since the request: a stale
 * selection is not sent to the model at all.
 */
export async function loadEditContext(
  job: Claimed,
): Promise<EditContext | null> {
  if (!job.article_id) return null;
  const db = getDb();
  const [suggestion, article] = await Promise.all([
    readSuggestion(db, job, false),
    readArticle(db, job, false),
  ]);
  if (
    !suggestion ||
    !article?.body ||
    suggestion.status !== "pending" ||
    !selectionCurrent(article, suggestion)
  )
    return null;
  const sources = await readArticleSources(db, job.article_id, job.user_id);
  const full = suggestion.scope === "full";
  return {
    scope: full ? "full" : "selection",
    instruction: suggestion.instruction,
    selectionText: suggestion.selectionText,
    before: full
      ? ""
      : article.body.slice(
          Math.max(0, suggestion.start - CONTEXT_CHARS),
          suggestion.start,
        ),
    after: full
      ? ""
      : article.body.slice(suggestion.end, suggestion.end + CONTEXT_CHARS),
    brief: {
      workingTitle: article.workingTitle,
      audience: article.audience,
      thesis: article.thesis,
    },
    sources: sources.map((source) => ({
      id: source.materialId,
      title: source.title ?? "",
      evidence: source.evidence,
    })),
  };
}

/**
 * Stores the model output on the suggestion with the job's success. When the
 * body changed during generation the result is dropped and the job is stale,
 * since it could never be applied.
 */
export async function completeEditJob(
  job: Claimed,
  output: Edit,
  durationMs: number,
  meta: RunMeta = mockRun,
) {
  if (!job.article_id) throw new Error("Edit job without article");
  return getDb().transaction(async (tx) => {
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
    // Article before suggestion, the same lock order as apply.
    const article = await readArticle(tx, job, true);
    const suggestion = await readSuggestion(tx, job, true);
    if (suggestion?.status !== "pending")
      throw new Error("Edit job without a pending suggestion");
    if (!article || !selectionCurrent(article, suggestion)) {
      await tx
        .update(aiJobs)
        .set({
          status: "stale",
          errorCode: "ARTICLE_CHANGED",
          claimToken: null,
          leaseUntil: null,
          updatedAt: sql`now()`,
        })
        .where(eq(aiJobs.id, job.id));
      return "stale" as const;
    }
    const checked = validateEdit(output, suggestion.selectionText);
    if (!checked.success) throw new Error("Invalid edit output");
    await tx
      .update(editSuggestions)
      .set({
        ...checked.data,
        status: "ready",
        mode: meta.mode,
        updatedAt: sql`now()`,
      })
      .where(eq(editSuggestions.id, suggestion.id));
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
    return "ready" as const;
  });
}
