import { Hono } from "hono";
import { z } from "zod";
import { type AuthedEnv, apiError, requireUser } from "../../http";
import { ExportError, exportArticle, previewArticle } from "./service";

const formatSchema = z.enum(["markdown", "html"]);

function exportFailure(error: unknown) {
  if (!(error instanceof ExportError)) throw error;
  switch (error.reason) {
    case "article_missing":
      return apiError("ARTICLE_NOT_FOUND", "文章不存在。", 404);
    case "body_missing":
      return apiError(
        "ARTICLE_BODY_REQUIRED",
        "文章还没有正文，生成或写好正文后再预览和导出。",
        422,
      );
  }
}

/** RFC 6266 attachment with an ASCII fallback and the UTF-8 title (RFC 5987). */
function attachment(fileName: string, version: number) {
  const extension = fileName.slice(fileName.lastIndexOf("."));
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="article-v${version}${extension}"; filename*=UTF-8''${encoded}`;
}

export const articleExportRoutes = new Hono<AuthedEnv>();
articleExportRoutes.use("/articles/:id/preview", requireUser);
articleExportRoutes.use("/articles/:id/export", requireUser);

articleExportRoutes.get("/articles/:id/preview", async (context) => {
  try {
    const preview = await previewArticle(
      context.get("userId"),
      context.req.param("id"),
    );
    context.header("cache-control", "no-store");
    return context.json(preview);
  } catch (error) {
    return exportFailure(error);
  }
});

articleExportRoutes.get("/articles/:id/export", async (context) => {
  const format = formatSchema.safeParse(context.req.query("format"));
  if (!format.success)
    return apiError(
      "INVALID_EXPORT_FORMAT",
      "导出格式只支持 markdown 或 html。",
      422,
    );
  try {
    const file = await exportArticle(
      context.get("userId"),
      context.req.param("id"),
      format.data,
    );
    // context.body keeps the CORS headers set by the middleware.
    return context.body(file.content, 200, {
      "content-type": file.contentType,
      "content-disposition": attachment(file.fileName, file.version),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      // If the file is opened from the API origin it still cannot run or fetch anything.
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
  } catch (error) {
    return exportFailure(error);
  }
});
