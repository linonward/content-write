import { randomUUID } from "node:crypto";
import { type Executor, getDb } from "@content-write/db/client";
import {
  aiJobs,
  articleDrafts,
  articleSources,
  articles,
  ideaSources,
  ideas,
  materialAnalyses,
  materialRevisions,
  materials,
} from "@content-write/db/schema";
import { and, asc, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";

export type Outline = NonNullable<(typeof articles.$inferSelect)["outline"]>;
type PinnedSource = { materialId: string; materialVersion: number };

export async function lockIdea(db: Executor, userId: string, ideaId: string) {
  const [idea] = await db
    .select({
      title: ideas.title,
      audience: ideas.audience,
      thesis: ideas.thesis,
    })
    .from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.userId, userId)))
    .for("update");
  return idea;
}

/** Idea sources whose material is still at the idea's revision and analyzed; locks those materials. */
export function lockCurrentIdeaSources(
  db: Executor,
  userId: string,
  ideaId: string,
): Promise<PinnedSource[]> {
  return db
    .select({
      materialId: ideaSources.materialId,
      materialVersion: ideaSources.materialVersion,
    })
    .from(ideaSources)
    .innerJoin(
      materials,
      and(
        eq(materials.id, ideaSources.materialId),
        eq(materials.userId, userId),
        eq(materials.currentVersion, ideaSources.materialVersion),
      ),
    )
    .innerJoin(
      materialAnalyses,
      and(
        eq(materialAnalyses.materialId, ideaSources.materialId),
        eq(materialAnalyses.materialVersion, ideaSources.materialVersion),
      ),
    )
    .where(eq(ideaSources.ideaId, ideaId))
    .orderBy(asc(ideaSources.materialId))
    .for("update", { of: materials });
}

export async function countIdeaSources(db: Executor, ideaId: string) {
  const [row] = await db
    .select({ count: count() })
    .from(ideaSources)
    .where(eq(ideaSources.ideaId, ideaId));
  return row?.count ?? 0;
}

/** Returns the new id, or undefined when the user already has an article for this idea. */
export async function insertArticle(
  db: Executor,
  values: Omit<typeof articles.$inferInsert, "id">,
) {
  const [row] = await db
    .insert(articles)
    .values({ id: randomUUID(), ...values })
    .onConflictDoNothing({ target: [articles.userId, articles.ideaId] })
    .returning({ id: articles.id });
  return row?.id;
}

export async function insertArticleSources(
  db: Executor,
  articleId: string,
  sources: PinnedSource[],
) {
  await db
    .insert(articleSources)
    .values(
      sources.map((source) => ({ id: randomUUID(), articleId, ...source })),
    );
}

export async function findArticleIdByIdea(
  db: Executor,
  userId: string,
  ideaId: string,
) {
  const [row] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.userId, userId), eq(articles.ideaId, ideaId)));
  return row?.id;
}

export async function listArticles(userId: string) {
  const rows = await getDb()
    .select({
      id: articles.id,
      ideaId: articles.ideaId,
      workingTitle: articles.workingTitle,
      audience: articles.audience,
      thesis: articles.thesis,
      version: articles.version,
      hasOutline: sql<boolean>`${articles.outline} IS NOT NULL`,
      outlineConfirmedAt: articles.outlineConfirmedAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(eq(articles.userId, userId))
    .orderBy(desc(articles.updatedAt), desc(articles.id))
    .limit(100);
  return { articles: rows };
}

export async function findArticle(db: Executor, userId: string, id: string) {
  const [article] = await db
    .select({
      id: articles.id,
      ideaId: articles.ideaId,
      workingTitle: articles.workingTitle,
      audience: articles.audience,
      thesis: articles.thesis,
      sourceCount: articles.sourceCount,
      version: articles.version,
      outline: articles.outline,
      outlineConfirmedAt: articles.outlineConfirmedAt,
      title: articles.title,
      body: articles.body,
      currentDraftId: articles.currentDraftId,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(and(eq(articles.id, id), eq(articles.userId, userId)));
  return article;
}

/** Source revisions shown on the article page, with full evidence spans. */
export function listSourceDetails(db: Executor, userId: string, id: string) {
  return db
    .select({
      materialId: articleSources.materialId,
      materialVersion: articleSources.materialVersion,
      title: materialRevisions.title,
      summary: sql<string | null>`${materialAnalyses.result} ->> 'summary'`,
      evidenceSpans: sql<
        unknown[]
      >`COALESCE(${materialAnalyses.result} -> 'evidenceSpans', '[]'::jsonb)`,
    })
    .from(articleSources)
    .innerJoin(
      articles,
      and(
        eq(articles.id, articleSources.articleId),
        eq(articles.userId, userId),
      ),
    )
    .leftJoin(
      materialRevisions,
      and(
        eq(materialRevisions.materialId, articleSources.materialId),
        eq(materialRevisions.version, articleSources.materialVersion),
      ),
    )
    .leftJoin(
      materialAnalyses,
      and(
        eq(materialAnalyses.materialId, articleSources.materialId),
        eq(materialAnalyses.materialVersion, articleSources.materialVersion),
      ),
    )
    .where(eq(articleSources.articleId, id))
    .orderBy(asc(articleSources.materialId));
}

export async function findLatestJob(
  db: Executor,
  userId: string,
  id: string,
  kind: "outline_generation" | "draft_generation",
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
        eq(aiJobs.articleId, id),
        eq(aiJobs.userId, userId),
        eq(aiJobs.kind, kind),
      ),
    )
    .orderBy(desc(aiJobs.createdAt), desc(aiJobs.id))
    .limit(1);
  return job;
}

export async function lockArticle(db: Executor, userId: string, id: string) {
  const [article] = await db
    .select({
      version: articles.version,
      sourceCount: articles.sourceCount,
      outline: articles.outline,
      outlineConfirmedAt: articles.outlineConfirmedAt,
    })
    .from(articles)
    .where(and(eq(articles.id, id), eq(articles.userId, userId)))
    .for("update");
  return article;
}

/** Applies the changes as a new article version and returns that version. */
export async function updateArticle(
  db: Executor,
  id: string,
  changes: PgUpdateSetSource<typeof articles>,
) {
  const [row] = await db
    .update(articles)
    .set({
      ...changes,
      version: sql`${articles.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(articles.id, id))
    .returning({ version: articles.version });
  return row.version;
}

export async function hasActiveJob(
  db: Executor,
  articleId: string,
  kind: "outline_generation" | "draft_generation",
) {
  const [job] = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.articleId, articleId),
        eq(aiJobs.kind, kind),
        inArray(aiJobs.status, ["queued", "running"]),
        gt(aiJobs.deadlineAt, sql`now()`),
      ),
    )
    .limit(1);
  return Boolean(job);
}

const draftFields = {
  id: articleDrafts.id,
  baseVersion: articleDrafts.baseVersion,
  title: articleDrafts.title,
  markdown: articleDrafts.markdown,
  sourceMap: articleDrafts.sourceMap,
  evidenceGaps: articleDrafts.evidenceGaps,
  status: articleDrafts.status,
  mode: articleDrafts.mode,
  createdAt: articleDrafts.createdAt,
};

export async function findDraft(
  db: Executor,
  userId: string,
  articleId: string,
  draftId: string,
) {
  const [draft] = await db
    .select(draftFields)
    .from(articleDrafts)
    .where(
      and(
        eq(articleDrafts.id, draftId),
        eq(articleDrafts.articleId, articleId),
        eq(articleDrafts.userId, userId),
      ),
    );
  return draft;
}

export async function lockDraft(
  db: Executor,
  userId: string,
  articleId: string,
  draftId: string,
) {
  const [draft] = await db
    .select({
      status: articleDrafts.status,
      title: articleDrafts.title,
      markdown: articleDrafts.markdown,
    })
    .from(articleDrafts)
    .where(
      and(
        eq(articleDrafts.id, draftId),
        eq(articleDrafts.articleId, articleId),
        eq(articleDrafts.userId, userId),
      ),
    )
    .for("update");
  return draft;
}

/** Newest candidates first; older ones stay stored but are not listed. */
export function listCandidateDrafts(
  db: Executor,
  userId: string,
  articleId: string,
) {
  return db
    .select(draftFields)
    .from(articleDrafts)
    .where(
      and(
        eq(articleDrafts.articleId, articleId),
        eq(articleDrafts.userId, userId),
        eq(articleDrafts.status, "candidate"),
      ),
    )
    .orderBy(desc(articleDrafts.createdAt), desc(articleDrafts.id))
    .limit(10);
}

export async function setDraftStatus(
  db: Executor,
  draftId: string,
  status: "applied" | "discarded",
) {
  await db
    .update(articleDrafts)
    .set({ status, updatedAt: sql`now()` })
    .where(eq(articleDrafts.id, draftId));
}
