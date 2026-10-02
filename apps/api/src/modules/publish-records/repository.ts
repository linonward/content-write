import { randomUUID } from "node:crypto";
import type { Executor } from "@content-write/db/client";
import { articles, publishRecords } from "@content-write/db/schema";
import { and, desc, eq } from "drizzle-orm";

export async function findArticleState(
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

const recordFields = {
  id: publishRecords.id,
  url: publishRecords.url,
  publishedAt: publishRecords.publishedAt,
  articleVersion: publishRecords.articleVersion,
  createdAt: publishRecords.createdAt,
};

/** Latest publication first. */
export function listRecords(db: Executor, userId: string, articleId: string) {
  return db
    .select(recordFields)
    .from(publishRecords)
    .where(
      and(
        eq(publishRecords.articleId, articleId),
        eq(publishRecords.userId, userId),
      ),
    )
    .orderBy(desc(publishRecords.publishedAt), desc(publishRecords.createdAt))
    .limit(100);
}

/** Returns the new record, or undefined when the article already has this link. */
export async function insertRecord(
  db: Executor,
  values: Omit<typeof publishRecords.$inferInsert, "id" | "createdAt">,
) {
  const [row] = await db
    .insert(publishRecords)
    .values({ id: randomUUID(), ...values })
    .onConflictDoNothing({
      target: [publishRecords.articleId, publishRecords.url],
    })
    .returning(recordFields);
  return row;
}

/** Returns whether a record of this user's article was deleted. */
export async function deleteRecord(
  db: Executor,
  userId: string,
  articleId: string,
  recordId: string,
) {
  const rows = await db
    .delete(publishRecords)
    .where(
      and(
        eq(publishRecords.id, recordId),
        eq(publishRecords.articleId, articleId),
        eq(publishRecords.userId, userId),
      ),
    )
    .returning({ id: publishRecords.id });
  return rows.length > 0;
}
