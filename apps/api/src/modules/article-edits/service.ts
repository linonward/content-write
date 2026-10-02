import { recordRevision } from "@content-write/db/article-revisions";
import { getDb } from "@content-write/db/client";
import {
  MAX_BODY_CHARS,
  replaceSelection,
  selectionCurrent,
} from "@content-write/db/edit-suggestions";
import { aiAvailable, aiMode } from "../../config";
import {
  enqueueJob,
  findIdempotentJob,
  hashInput,
  lockUserQueue,
} from "../ai-jobs/queue";
import { lockArticle, updateArticle } from "../articles/repository";
import * as repo from "./repository";

export type EditErrorReason =
  | "article_missing"
  | "body_missing"
  | "version_conflict"
  | "selection_mismatch"
  | "invalid_scope"
  | "idempotency_conflict"
  | "job_active"
  | "suggestion_missing"
  | "suggestion_not_ready"
  | "suggestion_closed"
  | "suggestion_stale"
  | "body_too_large"
  | "quota"
  | "concurrency"
  | "ai_unavailable";

export class EditError extends Error {
  constructor(readonly reason: EditErrorReason) {
    super(reason);
    this.name = "EditError";
  }
}

export type EditRequest = {
  expectedVersion: number;
  scope: "selection" | "full";
  start: number;
  end: number;
  selectionText: string;
  instruction: string;
};

/**
 * Records the selection against the current body and queues one suggestion
 * job. The server's own text at the offsets is what gets edited; a client
 * whose editor disagrees with it is refused instead of guessed.
 */
export async function startEdit(
  userId: string,
  articleId: string,
  input: EditRequest,
  key: string,
) {
  if (!aiAvailable()) throw new EditError("ai_unavailable");
  const result = await getDb().transaction(async (tx) => {
    await lockUserQueue(tx, userId);
    const article = await lockArticle(tx, userId, articleId);
    if (!article) throw new EditError("article_missing");
    const inputHash = hashInput({
      kind: "edit_suggestion",
      articleId,
      ...input,
      mode: aiMode(),
    });
    // Idempotency comes before the version check so a retried request returns its job.
    const prior = await findIdempotentJob(tx, userId, key, inputHash);
    if (prior) return prior;
    if (article.version !== input.expectedVersion)
      throw new EditError("version_conflict");
    if (article.body === null) throw new EditError("body_missing");
    if (article.body.slice(input.start, input.end) !== input.selectionText)
      throw new EditError("selection_mismatch");
    if (
      input.scope === "full" &&
      (input.start !== 0 || input.end !== article.body.length)
    )
      throw new EditError("invalid_scope");
    if (await repo.hasActiveEditJob(tx, articleId))
      throw new EditError("job_active");
    const queued = await enqueueJob(tx, {
      kind: "edit_suggestion",
      userId,
      idempotencyKey: key,
      inputHash,
      articleId,
      articleVersion: article.version,
    });
    if (queued.status === "created")
      await repo.insertSuggestion(tx, {
        articleId,
        userId,
        jobId: queued.jobId,
        baseVersion: article.version,
        scope: input.scope,
        selectionStart: input.start,
        selectionEnd: input.end,
        selectionText: input.selectionText,
        instruction: input.instruction,
      });
    return queued;
  });
  if (result.status === "conflict") throw new EditError("idempotency_conflict");
  if (result.status === "quota") throw new EditError("quota");
  if (result.status === "concurrency") throw new EditError("concurrency");
  return result.jobId;
}

/** Ready suggestions with a `stale` flag: the body moved on since they were requested. */
export async function listSuggestions(userId: string, articleId: string) {
  const db = getDb();
  const [article, suggestions, latestJob] = await Promise.all([
    repo.findArticleBody(db, userId, articleId),
    repo.listReadySuggestions(db, userId, articleId),
    repo.findLatestEditJob(db, userId, articleId),
  ]);
  if (!article) throw new EditError("article_missing");
  return {
    suggestions: suggestions.map((suggestion) => ({
      ...suggestion,
      stale: !selectionCurrent(article, suggestion),
    })),
    latestJob: latestJob ?? null,
    generationAvailable: aiAvailable(),
    aiMode: aiMode(),
  };
}

/**
 * Replaces the recorded selection with the suggestion as a new version. A
 * repeated apply returns the version the first one produced.
 */
export async function applySuggestion(
  userId: string,
  articleId: string,
  suggestionId: string,
  expectedVersion: number,
) {
  return getDb().transaction(async (tx) => {
    // Article first, then suggestion: the worker locks in the same order.
    const article = await lockArticle(tx, userId, articleId);
    if (!article) throw new EditError("suggestion_missing");
    const suggestion = await repo.lockSuggestion(
      tx,
      userId,
      articleId,
      suggestionId,
    );
    if (!suggestion) throw new EditError("suggestion_missing");
    if (suggestion.status === "applied" && suggestion.appliedVersion)
      return suggestion.appliedVersion;
    if (suggestion.status === "rejected")
      throw new EditError("suggestion_closed");
    if (suggestion.status !== "ready" || suggestion.replacement === null)
      throw new EditError("suggestion_not_ready");
    if (!selectionCurrent(article, suggestion) || article.body === null)
      throw new EditError("suggestion_stale");
    if (article.version !== expectedVersion)
      throw new EditError("version_conflict");
    if (!article.title) throw new EditError("body_missing");
    const body = replaceSelection(
      article.body,
      suggestion,
      suggestion.replacement,
    );
    if (body.length > MAX_BODY_CHARS) throw new EditError("body_too_large");
    const version = await updateArticle(tx, articleId, { body });
    await recordRevision(tx, {
      articleId,
      userId,
      version,
      title: article.title,
      body,
      source: "ai_edit",
    });
    await repo.closeSuggestion(tx, suggestionId, {
      status: "applied",
      appliedVersion: version,
    });
    return version;
  });
}

/** Rejecting leaves the article untouched; rejecting twice is a no-op. */
export async function rejectSuggestion(
  userId: string,
  articleId: string,
  suggestionId: string,
) {
  await getDb().transaction(async (tx) => {
    const suggestion = await repo.lockSuggestion(
      tx,
      userId,
      articleId,
      suggestionId,
    );
    if (!suggestion) throw new EditError("suggestion_missing");
    if (suggestion.status === "rejected") return;
    if (suggestion.status === "applied")
      throw new EditError("suggestion_closed");
    if (suggestion.status !== "ready")
      throw new EditError("suggestion_not_ready");
    await repo.closeSuggestion(tx, suggestionId, { status: "rejected" });
  });
}
