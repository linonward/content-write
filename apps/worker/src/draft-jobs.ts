import { randomUUID } from "node:crypto";
import { recordRevision } from "@content-write/db/article-revisions";
import {
  type ArticleSource,
  readArticleSources,
  sourcesIntact,
} from "@content-write/db/article-sources";
import { type Executor, getDb } from "@content-write/db/client";
import {
  aiJobs,
  aiRuns,
  articleDrafts,
  articles,
} from "@content-write/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import type { RunMeta } from "./ai/generate";
import { type Draft, type DraftContext, validateDraft } from "./draft";
import type { Claimed } from "./jobs";
import { mockRun, runUsage } from "./runs";

function toDraftSources(sources: ArticleSource[]): DraftContext["sources"] {
  return sources.map((source) => ({
    id: source.materialId,
    version: source.materialVersion,
    title: source.title ?? "",
    summary: source.summary ?? "",
    evidence: source.evidence,
  }));
}

async function readArticle(db: Executor, job: Claimed, lock: boolean) {
  const query = db
    .select({
      workingTitle: articles.workingTitle,
      audience: articles.audience,
      thesis: articles.thesis,
      version: articles.version,
      sourceCount: articles.sourceCount,
      outline: articles.outline,
      body: articles.body,
      // Editing or re-confirming the outline after the job was queued moves this past the job's creation.
      outlineConfirmedForJob: sql<boolean>`COALESCE(${articles.outlineConfirmedAt} <= (SELECT ${aiJobs.createdAt} FROM ${aiJobs} WHERE ${aiJobs.id} = ${job.id}), false)`,
    })
    .from(articles)
    .where(
      and(
        eq(articles.id, job.article_id ?? ""),
        eq(articles.userId, job.user_id),
      ),
    );
  const [article] = await (lock
    ? query.for("update", { of: articles })
    : query);
  return article;
}

/** The draft still applies while the outline confirmed before queueing and every source remain. */
function basisCurrent(
  job: Claimed,
  article: Awaited<ReturnType<typeof readArticle>>,
  sources: ArticleSource[],
) {
  return (
    article?.outline != null &&
    article.outlineConfirmedForJob &&
    sources.length === job.source_count &&
    sourcesIntact(sources, article.sourceCount)
  );
}

export async function loadDraftContext(
  job: Claimed,
): Promise<DraftContext | null> {
  if (!job.article_id || !job.article_version) return null;
  const db = getDb();
  const article = await readArticle(db, job, false);
  const sources = await readArticleSources(db, job.article_id, job.user_id);
  if (!article?.outline || !basisCurrent(job, article, sources)) return null;
  return {
    brief: {
      workingTitle: article.workingTitle,
      audience: article.audience,
      thesis: article.thesis,
    },
    outline: article.outline,
    sources: toDraftSources(sources),
  };
}

/**
 * Saves the draft with the job's success. It becomes the body only when the
 * article is still at the job's base version and has no body; otherwise it
 * waits as a candidate so newer text is never overwritten.
 */
export async function completeDraftJob(
  job: Claimed,
  output: Draft,
  durationMs: number,
  meta: RunMeta = mockRun,
) {
  const articleId = job.article_id;
  const baseVersion = job.article_version;
  if (!articleId || !baseVersion) throw new Error("Draft job without article");
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
    const article = await readArticle(tx, job, true);
    const sources = await readArticleSources(tx, articleId, job.user_id, {
      lock: true,
    });
    if (!article || !basisCurrent(job, article, sources)) {
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
    const checked = validateDraft(output, toDraftSources(sources));
    if (!checked.success) throw new Error("Invalid draft output");
    const applied = article.version === baseVersion && article.body === null;
    const draftId = randomUUID();
    await tx.insert(articleDrafts).values({
      id: draftId,
      articleId,
      userId: job.user_id,
      jobId: job.id,
      baseVersion,
      ...checked.data,
      status: applied ? "applied" : "candidate",
      mode: meta.mode,
    });
    if (applied) {
      const [updated] = await tx
        .update(articles)
        .set({
          title: checked.data.title,
          body: checked.data.markdown,
          currentDraftId: draftId,
          version: sql`${articles.version} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(articles.id, articleId))
        .returning({ version: articles.version });
      await recordRevision(tx, {
        articleId,
        userId: job.user_id,
        version: updated.version,
        title: checked.data.title,
        body: checked.data.markdown,
        source: "draft",
      });
    }
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
    return applied ? ("applied" as const) : ("candidate" as const);
  });
}
