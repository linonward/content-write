import {
  citesOnlySourceEvidence,
  readArticleSources,
  sourcesIntact,
} from "@content-write/db/article-sources";
import { type Executor, getDb } from "@content-write/db/client";
import { sql } from "drizzle-orm";
import { aiAvailable } from "../../config";
import {
  enqueueJob,
  findIdempotentJob,
  hashInput,
  lockUserQueue,
} from "../ai-jobs/queue";
import type { Outline } from "./repository";
import * as repo from "./repository";

export type ArticleErrorReason =
  | "idea_missing"
  | "idea_sources_stale"
  | "article_missing"
  | "version_conflict"
  | "sources_missing"
  | "invalid_evidence"
  | "outline_required"
  | "idempotency_conflict"
  | "job_active"
  | "quota"
  | "concurrency"
  | "ai_unavailable";

export class ArticleError extends Error {
  constructor(readonly reason: ArticleErrorReason) {
    super(reason);
    this.name = "ArticleError";
  }
}

type Brief = { workingTitle: string; audience: string; thesis: string };

/** Creates the user's article for an idea once; repeats return the existing article. */
export async function createArticle(userId: string, ideaId: string) {
  return getDb().transaction(async (tx) => {
    // Locks keep the idea and its materials from changing until the snapshot is copied.
    const idea = await repo.lockIdea(tx, userId, ideaId);
    if (!idea) throw new ArticleError("idea_missing");
    const sources = await repo.lockCurrentIdeaSources(tx, userId, ideaId);
    if (
      !sources.length ||
      sources.length !== (await repo.countIdeaSources(tx, ideaId))
    )
      throw new ArticleError("idea_sources_stale");
    const created = await repo.insertArticle(tx, {
      userId,
      ideaId,
      workingTitle: idea.title,
      audience: idea.audience,
      thesis: idea.thesis,
      sourceCount: sources.length,
    });
    if (created) {
      await repo.insertArticleSources(tx, created, sources);
      return { id: created, created: true };
    }
    const existing = await repo.findArticleIdByIdea(tx, userId, ideaId);
    if (!existing) throw new Error("Article conflict without an existing row");
    return { id: existing, created: false };
  });
}

export async function getArticle(userId: string, id: string) {
  const db = getDb();
  const [article, sources, latestJob] = await Promise.all([
    repo.findArticle(db, userId, id),
    repo.listSourceDetails(db, userId, id),
    repo.findLatestOutlineJob(db, userId, id),
  ]);
  if (!article) throw new ArticleError("article_missing");
  return {
    article: { ...article, sources },
    latestJob: latestJob ?? null,
    generationAvailable: aiAvailable(),
  };
}

async function lockVersion(
  tx: Executor,
  userId: string,
  id: string,
  expectedVersion: number,
) {
  const article = await repo.lockArticle(tx, userId, id);
  if (!article) throw new ArticleError("article_missing");
  if (article.version !== expectedVersion)
    throw new ArticleError("version_conflict");
  return article;
}

/** Editing the brief discards the outline, which was written for the old brief. */
export async function updateBrief(
  userId: string,
  id: string,
  expectedVersion: number,
  brief: Brief,
) {
  return getDb().transaction(async (tx) => {
    await lockVersion(tx, userId, id, expectedVersion);
    return repo.updateArticle(tx, id, {
      ...brief,
      outline: null,
      outlineConfirmedAt: null,
    });
  });
}

/** Saving an outline revokes any earlier confirmation. */
export async function saveOutline(
  userId: string,
  id: string,
  expectedVersion: number,
  outline: Outline,
) {
  return getDb().transaction(async (tx) => {
    const article = await lockVersion(tx, userId, id, expectedVersion);
    const sources = await readArticleSources(tx, id, userId);
    if (!sourcesIntact(sources, article.sourceCount))
      throw new ArticleError("sources_missing");
    if (
      !citesOnlySourceEvidence(
        outline.sections,
        sources.map((source) => ({
          id: source.materialId,
          evidenceIds: source.evidenceIds,
        })),
      )
    )
      throw new ArticleError("invalid_evidence");
    return repo.updateArticle(tx, id, {
      workingTitle: outline.workingTitle,
      audience: outline.audience,
      thesis: outline.thesis,
      outline,
      outlineConfirmedAt: null,
    });
  });
}

export async function confirmOutline(
  userId: string,
  id: string,
  expectedVersion: number,
) {
  return getDb().transaction(async (tx) => {
    const article = await lockVersion(tx, userId, id, expectedVersion);
    const sources = await readArticleSources(tx, id, userId);
    if (!sourcesIntact(sources, article.sourceCount))
      throw new ArticleError("sources_missing");
    if (!article.outline) throw new ArticleError("outline_required");
    return repo.updateArticle(tx, id, { outlineConfirmedAt: sql`now()` });
  });
}

/** Queues one mock outline job per article version; repeats with the same key return the same job. */
export async function startOutlineGeneration(
  userId: string,
  id: string,
  expectedVersion: number,
  key: string,
) {
  if (!aiAvailable()) throw new ArticleError("ai_unavailable");
  const result = await getDb().transaction(async (tx) => {
    await lockUserQueue(tx, userId);
    const article = await repo.lockArticle(tx, userId, id);
    if (!article) throw new ArticleError("article_missing");
    const sources = await readArticleSources(tx, id, userId, { lock: true });
    if (!sourcesIntact(sources, article.sourceCount))
      throw new ArticleError("sources_missing");
    const inputHash = hashInput({
      kind: "outline_generation",
      id,
      expectedVersion,
      // Field names match jobs queued before T027 so idempotent retries keep matching.
      sources: sources.map((source) => ({
        material_id: source.materialId,
        material_version: source.materialVersion,
      })),
      mode: "mock",
    });
    // Idempotency comes before the version check so a retried request returns its job.
    const prior = await findIdempotentJob(tx, userId, key, inputHash);
    if (prior) return prior;
    if (article.version !== expectedVersion)
      throw new ArticleError("version_conflict");
    if (await repo.hasActiveOutlineJob(tx, id))
      throw new ArticleError("job_active");
    // Queue outcomes are returned, not thrown: limit checks write deadline cleanup that must commit.
    return enqueueJob(tx, {
      kind: "outline_generation",
      userId,
      idempotencyKey: key,
      inputHash,
      sourceCount: sources.length,
      articleId: id,
      articleVersion: expectedVersion,
    });
  });
  if (result.status === "conflict")
    throw new ArticleError("idempotency_conflict");
  if (result.status === "quota") throw new ArticleError("quota");
  if (result.status === "concurrency") throw new ArticleError("concurrency");
  return result.jobId;
}
