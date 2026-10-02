import { Hono } from "hono";
import { z } from "zod";
import { type AuthedEnv, apiError, readJson, requireUser } from "../../http";
import {
  createPublishRecord,
  deletePublishRecord,
  listPublishRecords,
  PublishError,
} from "./service";

// Clock drift between the author's device and the server.
const FUTURE_TOLERANCE_MS = 10 * 60_000;

/** Absolute http(s) link without credentials; the server never fetches it. */
function publicLink(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

const recordInput = z.strictObject({
  expectedVersion: z.int().positive(),
  url: z.string().trim().min(1).max(2_000).refine(publicLink),
  publishedAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .refine((date) => date.getTime() <= Date.now() + FUTURE_TOLERANCE_MS),
});

function publishFailure(error: unknown) {
  if (!(error instanceof PublishError)) throw error;
  switch (error.reason) {
    case "article_missing":
      return apiError("ARTICLE_NOT_FOUND", "文章不存在。", 404);
    case "body_missing":
      return apiError(
        "ARTICLE_BODY_REQUIRED",
        "文章还没有正文，写好正文并发布后再记录。",
        422,
      );
    case "version_conflict":
      return apiError(
        "ARTICLE_VERSION_CONFLICT",
        "文章已有新版本，请刷新后确认要记录的版本。",
        409,
      );
    case "record_exists":
      return apiError("PUBLISH_RECORD_EXISTS", "这个链接已经记录过了。", 409);
    case "record_missing":
      return apiError("PUBLISH_RECORD_NOT_FOUND", "发布记录不存在。", 404);
  }
}

export const publishRecordRoutes = new Hono<AuthedEnv>();
publishRecordRoutes.use("/articles/:id/publish-records", requireUser);
publishRecordRoutes.use("/articles/:id/publish-records/*", requireUser);

publishRecordRoutes.get("/articles/:id/publish-records", async (context) => {
  try {
    return context.json(
      await listPublishRecords(context.get("userId"), context.req.param("id")),
    );
  } catch (error) {
    return publishFailure(error);
  }
});
publishRecordRoutes.post("/articles/:id/publish-records", async (context) => {
  const body = await readJson(context.req.raw, 8_192);
  if (body.status === "large")
    return apiError("PUBLISH_RECORD_TOO_LARGE", "请求内容过长。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = recordInput.safeParse(body.value);
  if (!parsed.success)
    return apiError(
      "INVALID_PUBLISH_RECORD",
      "请填写以 http:// 或 https:// 开头的发布链接，以及不晚于现在的发布时间。",
      422,
    );
  try {
    const record = await createPublishRecord(
      context.get("userId"),
      context.req.param("id"),
      parsed.data,
    );
    return context.json({ record }, 201);
  } catch (error) {
    return publishFailure(error);
  }
});
publishRecordRoutes.delete(
  "/articles/:id/publish-records/:recordId",
  async (context) => {
    try {
      await deletePublishRecord(
        context.get("userId"),
        context.req.param("id"),
        context.req.param("recordId"),
      );
      return context.body(null, 204);
    } catch (error) {
      return publishFailure(error);
    }
  },
);
