import { Hono } from "hono";
import { z } from "zod";
import {
  type AuthedEnv,
  apiError,
  idempotencyKey,
  invalidIdempotencyKey,
  readJson,
  requireUser,
} from "../../http";
import {
  confirmOutline,
  createArticle,
  getArticle,
  listArticles,
  saveOutline,
  startOutlineGeneration,
  updateBrief,
} from "./repository";

const text = (max: number) => z.string().trim().min(1).max(max);
const briefSchema = z.strictObject({
  expectedVersion: z.int().positive(),
  workingTitle: text(200),
  audience: text(200),
  thesis: text(500),
});
const outlineSchema = z.strictObject({
  workingTitle: text(200),
  audience: text(200),
  thesis: text(500),
  sections: z
    .array(
      z.strictObject({
        heading: text(200),
        purpose: text(500),
        keyPoints: z.array(text(500)).min(1).max(8),
        evidenceIds: z.array(text(200)).max(12),
        missingEvidence: z.array(text(300)).max(8),
      }),
    )
    .min(2)
    .max(10),
});
const outlineInput = z.strictObject({
  expectedVersion: z.int().positive(),
  outline: outlineSchema,
});
const versionInput = z.strictObject({ expectedVersion: z.int().positive() });
const createInput = z.strictObject({ ideaId: z.string().uuid() });
export const articleRoutes = new Hono<AuthedEnv>();

const readBody = (request: Request) => readJson(request, 32_768);
articleRoutes.use("/articles", requireUser);
articleRoutes.use("/articles/*", requireUser);

articleRoutes.get("/articles", async (context) =>
  context.json(await listArticles(context.get("userId"))),
);
articleRoutes.post("/articles", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return apiError("ARTICLE_INPUT_TOO_LARGE", "请求内容过长。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = createInput.safeParse(body.value);
  if (!parsed.success) return apiError("INVALID_IDEA", "请选择有效选题。", 422);
  const result = await createArticle(context.get("userId"), parsed.data.ideaId);
  if (result.status === "missing")
    return apiError("IDEA_NOT_FOUND", "选题不存在。", 404);
  if (result.status === "stale")
    return apiError(
      "IDEA_SOURCES_STALE",
      "选题来源已变化，请重新生成选题。",
      409,
    );
  return context.json(
    { articleId: result.id },
    result.status === "created" ? 201 : 200,
  );
});
articleRoutes.get("/articles/:id", async (context) => {
  const result = await getArticle(
    context.get("userId"),
    context.req.param("id"),
  );
  return result
    ? context.json(result)
    : apiError("ARTICLE_NOT_FOUND", "文章不存在。", 404);
});
articleRoutes.patch("/articles/:id/brief", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return apiError("ARTICLE_INPUT_TOO_LARGE", "请求内容过长。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = briefSchema.safeParse(body.value);
  if (!parsed.success)
    return apiError("INVALID_BRIEF", "请填写标题、目标读者和核心观点。", 422);
  const { expectedVersion, ...brief } = parsed.data;
  const result = await updateBrief(
    context.get("userId"),
    context.req.param("id"),
    expectedVersion,
    brief,
  );
  if (result.status === "missing")
    return apiError("ARTICLE_NOT_FOUND", "文章不存在。", 404);
  if (result.status === "conflict")
    return apiError(
      "ARTICLE_VERSION_CONFLICT",
      "文章已有新版本，请刷新后再修改。",
      409,
    );
  return context.json({ version: result.version });
});
articleRoutes.post("/articles/:id/outline/generate", async (context) => {
  const key = idempotencyKey(context.req.raw);
  if (!key) return invalidIdempotencyKey();
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return apiError("ARTICLE_INPUT_TOO_LARGE", "请求内容过长。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = versionInput.safeParse(body.value);
  if (!parsed.success)
    return apiError("INVALID_ARTICLE_VERSION", "请提供当前文章版本。", 422);
  const result = await startOutlineGeneration(
    context.get("userId"),
    context.req.param("id"),
    parsed.data.expectedVersion,
    key,
  );
  if (result.status === "missing")
    return apiError("ARTICLE_NOT_FOUND", "文章不存在。", 404);
  if (result.status === "sources_missing")
    return apiError("ARTICLE_SOURCES_MISSING", "文章来源已失效。", 422);
  if (result.status === "version_conflict")
    return apiError(
      "ARTICLE_VERSION_CONFLICT",
      "文章已有新版本，请刷新后再生成。",
      409,
    );
  if (result.status === "conflict")
    return apiError("IDEMPOTENCY_CONFLICT", "请求键已用于其他输入。", 409);
  if (result.status === "active")
    return apiError("OUTLINE_JOB_ACTIVE", "这篇文章已有正在生成的大纲。", 409);
  if (result.status === "quota")
    return apiError("AI_DAILY_LIMIT", "今日生成次数已用完。", 429);
  if (result.status === "concurrency")
    return apiError(
      "AI_CONCURRENCY_LIMIT",
      "同时处理的任务已达上限。",
      429,
      true,
    );
  if (result.status === "unavailable")
    return apiError("AI_NOT_CONFIGURED", "当前尚未配置可用模型服务。", 503);
  return context.json(
    { jobId: result.jobId, status: "queued", mode: "mock" },
    202,
  );
});
articleRoutes.put("/articles/:id/outline", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return apiError("ARTICLE_INPUT_TOO_LARGE", "大纲内容过长。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = outlineInput.safeParse(body.value);
  if (!parsed.success)
    return apiError(
      "INVALID_OUTLINE",
      "请填写完整大纲；至少两节，每节包含标题、目的和要点。",
      422,
    );
  const result = await saveOutline(
    context.get("userId"),
    context.req.param("id"),
    parsed.data.expectedVersion,
    parsed.data.outline,
  );
  if (result.status === "missing")
    return apiError("ARTICLE_NOT_FOUND", "文章不存在。", 404);
  if (result.status === "conflict")
    return apiError(
      "ARTICLE_VERSION_CONFLICT",
      "文章已有新版本，请刷新后再保存。",
      409,
    );
  if (result.status === "sources_missing")
    return apiError("ARTICLE_SOURCES_MISSING", "文章来源已失效。", 422);
  if (result.status === "invalid_evidence")
    return apiError("INVALID_EVIDENCE", "大纲引用了无效的来源片段。", 422);
  return context.json({ version: result.version });
});
articleRoutes.post("/articles/:id/outline/confirm", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return apiError("ARTICLE_INPUT_TOO_LARGE", "请求内容过长。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = versionInput.safeParse(body.value);
  if (!parsed.success)
    return apiError("INVALID_ARTICLE_VERSION", "请提供当前文章版本。", 422);
  const result = await confirmOutline(
    context.get("userId"),
    context.req.param("id"),
    parsed.data.expectedVersion,
  );
  if (result.status === "missing")
    return apiError("ARTICLE_NOT_FOUND", "文章不存在。", 404);
  if (result.status === "conflict")
    return apiError(
      "ARTICLE_VERSION_CONFLICT",
      "文章已有新版本，请刷新后再确认。",
      409,
    );
  if (result.status === "sources_missing")
    return apiError("ARTICLE_SOURCES_MISSING", "文章来源已失效。", 422);
  if (result.status === "no_outline")
    return apiError("OUTLINE_REQUIRED", "请先生成或保存大纲。", 422);
  return context.json({ version: result.version, status: "confirmed" });
});
