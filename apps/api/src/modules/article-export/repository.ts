import type { Executor } from "@content-write/db/client";
import { articles } from "@content-write/db/schema";
import { and, eq } from "drizzle-orm";

/** The author's current article text. Reads only `articles`: reference articles never reach preview or export. */
export async function findArticleText(
  db: Executor,
  userId: string,
  articleId: string,
) {
  const [row] = await db
    .select({
      id: articles.id,
      version: articles.version,
      title: articles.title,
      body: articles.body,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)));
  return row;
}
