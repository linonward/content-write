import { getDb } from "@content-write/db/client";
import {
  fileBaseName,
  renderHtmlDocument,
  renderMarkdown,
  renderMarkdownDocument,
} from "./render";
import { findArticleText } from "./repository";

export type ExportErrorReason = "article_missing" | "body_missing";

export class ExportError extends Error {
  constructor(readonly reason: ExportErrorReason) {
    super(reason);
    this.name = "ExportError";
  }
}

export type ExportFormat = "markdown" | "html";

/** Current title and body; preview and export both need a body to render. */
async function loadArticle(userId: string, articleId: string) {
  const article = await findArticleText(getDb(), userId, articleId);
  if (!article) throw new ExportError("article_missing");
  if (!article.title || !article.body?.trim())
    throw new ExportError("body_missing");
  return { ...article, title: article.title, body: article.body };
}

export async function previewArticle(userId: string, articleId: string) {
  const article = await loadArticle(userId, articleId);
  return {
    articleId: article.id,
    version: article.version,
    title: article.title,
    html: renderMarkdown(article.body),
    fileName: fileBaseName(article.title),
    updatedAt: article.updatedAt,
    renderedAt: new Date(),
  };
}

export async function exportArticle(
  userId: string,
  articleId: string,
  format: ExportFormat,
) {
  const article = await loadArticle(userId, articleId);
  const base = fileBaseName(article.title);
  return format === "markdown"
    ? {
        fileName: `${base}.md`,
        contentType: "text/markdown; charset=utf-8",
        content: renderMarkdownDocument(article.title, article.body),
        version: article.version,
      }
    : {
        fileName: `${base}.html`,
        contentType: "text/html; charset=utf-8",
        content: renderHtmlDocument(article.title, article.body),
        version: article.version,
      };
}
