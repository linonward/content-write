import { randomUUID } from "node:crypto";
import {
  type ArticleSource,
  readArticleSources,
  sourcesIntact,
} from "@content-write/db/article-sources";
import { type Executor, getDb } from "@content-write/db/client";
import { aiJobs, aiRuns, articles } from "@content-write/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Claimed } from "./jobs";
import {
  type Brief,
  type Outline,
  type OutlineSource,
  validateOutline,
} from "./outline";

function toOutlineSources(sources: ArticleSource[]): OutlineSource[] {
  return sources.map((source) => ({
    id: source.materialId,
    title: source.title ?? "",
    summary: source.summary ?? "",
    evidenceIds: source.evidenceIds,
  }));
}

/** The job still applies only to the article version and source set it was queued for. */
function jobCurrent(
  job: Claimed,
  article: { version: number; sourceCount: number } | undefined,
  sources: ArticleSource[],
) {
  return (
    article !== undefined &&
    article.version === job.article_version &&
    sources.length === job.source_count &&
    sourcesIntact(sources, article.sourceCount)
  );
}

async function readArticle(
  db: Executor,
  job: Claimed,
  articleId: string,
  lock: boolean,
) {
  const query = db
    .select({
      workingTitle: articles.workingTitle,
      audience: articles.audience,
      thesis: articles.thesis,
      version: articles.version,
      sourceCount: articles.sourceCount,
    })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, job.user_id)));
  const [article] = await (lock ? query.for("update") : query);
  return article;
}

export async function loadOutlineContext(
  job: Claimed,
): Promise<{ brief: Brief; sources: OutlineSource[] } | null> {
  if (!job.article_id || !job.article_version) return null;
  const db = getDb();
  const article = await readArticle(db, job, job.article_id, false);
  const sources = await readArticleSources(db, job.article_id, job.user_id);
  if (!article || !jobCurrent(job, article, sources)) return null;
  return {
    brief: {
      workingTitle: article.workingTitle,
      audience: article.audience,
      thesis: article.thesis,
    },
    sources: toOutlineSources(sources),
  };
}

export async function completeOutlineJob(
  job: Claimed,
  output: Outline,
  durationMs: number,
) {
  const articleId = job.article_id;
  if (!articleId) throw new Error("Outline job without an article");
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
    const article = await readArticle(tx, job, articleId, true);
    const sources = await readArticleSources(tx, articleId, job.user_id, {
      lock: true,
    });
    if (!jobCurrent(job, article, sources)) {
      await tx
        .update(aiJobs)
        .set({
          status: "stale",
          errorCode: "ARTICLE_OR_SOURCE_CHANGED",
          claimToken: null,
          leaseUntil: null,
          updatedAt: sql`now()`,
        })
        .where(eq(aiJobs.id, job.id));
      return "stale" as const;
    }
    const checked = validateOutline(output, toOutlineSources(sources));
    if (!checked.success) throw new Error("Invalid outline output");
    await tx
      .update(articles)
      .set({
        outline: checked.data,
        outlineConfirmedAt: null,
        version: sql`${articles.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(articles.id, articleId));
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
      mode: "mock",
      durationMs: Math.max(0, Math.round(durationMs)),
    });
    return "succeeded" as const;
  });
}
