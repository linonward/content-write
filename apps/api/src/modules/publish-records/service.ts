import { getDb } from "@content-write/db/client";
import { lockArticle } from "../articles/repository";
import * as repo from "./repository";

export type PublishErrorReason =
  | "article_missing"
  | "body_missing"
  | "version_conflict"
  | "record_exists"
  | "record_missing";

export class PublishError extends Error {
  constructor(readonly reason: PublishErrorReason) {
    super(reason);
    this.name = "PublishError";
  }
}

export async function listPublishRecords(userId: string, articleId: string) {
  const db = getDb();
  const [article, records] = await Promise.all([
    repo.findArticleState(db, userId, articleId),
    repo.listRecords(db, userId, articleId),
  ]);
  if (!article) throw new PublishError("article_missing");
  return {
    articleVersion: article.version,
    hasBody: Boolean(article.body?.trim()),
    records,
  };
}

/**
 * Records a publication against the version the author is looking at. The
 * version check keeps a record from being tied to text the author never saw.
 */
export async function createPublishRecord(
  userId: string,
  articleId: string,
  input: { expectedVersion: number; url: string; publishedAt: Date },
) {
  return getDb().transaction(async (tx) => {
    const article = await lockArticle(tx, userId, articleId);
    if (!article) throw new PublishError("article_missing");
    if (!article.body?.trim()) throw new PublishError("body_missing");
    if (article.version !== input.expectedVersion)
      throw new PublishError("version_conflict");
    const record = await repo.insertRecord(tx, {
      articleId,
      userId,
      articleVersion: article.version,
      url: input.url,
      publishedAt: input.publishedAt,
    });
    if (!record) throw new PublishError("record_exists");
    return record;
  });
}

export async function deletePublishRecord(
  userId: string,
  articleId: string,
  recordId: string,
) {
  if (!(await repo.deleteRecord(getDb(), userId, articleId, recordId)))
    throw new PublishError("record_missing");
}
