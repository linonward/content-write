import { and, asc, eq, sql } from "drizzle-orm";
import type { Executor } from "./client";
import {
  articleSources,
  materialAnalyses,
  materialRevisions,
  materials,
} from "./schema";

export type ArticleSource = {
  materialId: string;
  materialVersion: number;
  title: string | null;
  summary: string | null;
  evidenceIds: string[];
};

/**
 * Reads an article's pinned source revisions with their analyses. With `lock`,
 * the owning material rows are locked in material id order so concurrent
 * deletes wait and lock order stays deadlock-free.
 */
export async function readArticleSources(
  db: Executor,
  articleId: string,
  userId: string,
  options: { lock?: boolean } = {},
): Promise<ArticleSource[]> {
  const query = db
    .select({
      materialId: articleSources.materialId,
      materialVersion: articleSources.materialVersion,
      title: materialRevisions.title,
      summary: sql<string | null>`${materialAnalyses.result} ->> 'summary'`,
      evidenceSpans: sql<
        { id: string }[] | null
      >`${materialAnalyses.result} -> 'evidenceSpans'`,
    })
    .from(articleSources)
    .innerJoin(
      materials,
      and(
        eq(materials.id, articleSources.materialId),
        eq(materials.userId, userId),
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
    .where(eq(articleSources.articleId, articleId))
    .orderBy(asc(articleSources.materialId));
  const rows = await (options.lock
    ? query.for("update", { of: materials })
    : query);
  return rows.map(({ evidenceSpans, ...row }) => ({
    ...row,
    evidenceIds: (evidenceSpans ?? []).map((span) => span.id),
  }));
}

/**
 * An article can be outlined only while every source it was created from still
 * exists with its pinned revision and analysis.
 */
export function sourcesIntact(sources: ArticleSource[], expectedCount: number) {
  return (
    sources.length > 0 &&
    sources.length === expectedCount &&
    sources.every((source) => source.title && source.summary)
  );
}

/**
 * Every cited evidence id must be `materialId:spanId` of a span in the article's
 * sources, and a section may cite each span once.
 */
export function citesOnlySourceEvidence(
  sections: { evidenceIds: string[] }[],
  sources: { id: string; evidenceIds: string[] }[],
) {
  const available = new Set(
    sources.flatMap((source) =>
      source.evidenceIds.map((span) => `${source.id}:${span}`),
    ),
  );
  return sections.every(
    (section) =>
      new Set(section.evidenceIds).size === section.evidenceIds.length &&
      section.evidenceIds.every((evidenceId) => available.has(evidenceId)),
  );
}
