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
import { listArticles } from "./repository";
import {
  ArticleError,
  applyDraft,
  confirmOutline,
  createArticle,
  discardDraft,
  getArticle,
  saveBody,
  saveOutline,
  startDraftGeneration,
  startOutlineGeneration,
  updateBrief,
} from "./service";

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
const bodyInput = z.strictObject({
  expectedVersion: z.int().positive(),
  title: text(200),
  // Length is checked separately so an oversized body gets 413, not 422.
  body: z.string(),
});
const MAX_BODY_CHARS = 50_000;
const createInput = z.strictObject({ ideaId: z.string().uuid() });
export const articleRoutes = new Hono<AuthedEnv>();

const readBody = (request: Request) => readJson(request, 32_768);

/** Maps a rejected article action to its response; `action` completes the version-conflict hint. */
function articleFailure(
  error: unknown,
  action?: "修改" | "生成" | "保存" | "确认" | "替换正文",
) {
  if (!(error instanceof ArticleError)) throw error;
  switch (error.reason) {
    case "idea_missing":
      return apiError("IDEA_NOT_FOUND", "选题不存在。", 404);
    case "idea_sources_stale":
      return apiError(
        "IDEA_SOURCES_STALE",
        "选题来源已变化，请重新生成选题。",
        409,
      );
    case "article_missing":
      return apiError("ARTICLE_NOT_FOUND", "文章不存在。", 404);
    case "version_conflict":
      return apiError(
        "ARTICLE_VERSION_CONFLICT",
        `文章已有新版本，请刷新后再${action ?? "操作"}。`,
        409,
      );
    case "sources_missing":
      return apiError("ARTICLE_SOURCES_MISSING", "文章来源已失效。", 422);
    case "invalid_evidence":
      return apiError("INVALID_EVIDENCE", "大纲引用了无效的来源片段。", 422);
    case "outline_required":
      return apiError("OUTLINE_REQUIRED", "请先生成或保存大纲。", 422);
    case "idempotency_conflict":
      return apiError("IDEMPOTENCY_CONFLICT", "请求键已用于其他输入。", 409);
    case "job_active":
      return apiError(
        "OUTLINE_JOB_ACTIVE",
        "这篇文章已有正在生成的大纲。",
        409,
      );
    case "outline_not_confirmed":
      return apiError("OUTLINE_NOT_CONFIRMED", "请先确认大纲再生成初稿。", 422);
    case "draft_job_active":
      return apiError("DRAFT_JOB_ACTIVE", "这篇文章已有正在生成的初稿。", 409);
    case "draft_missing":
      return apiError("DRAFT_NOT_FOUND", "初稿不存在。", 404);
    case "draft_not_candidate":
      return apiError("DRAFT_NOT_CANDIDATE", "这份初稿已应用或已丢弃。", 409);
    case "quota":
      return apiError("AI_DAILY_LIMIT", "今日生成次数已用完。", 429);
    case "concurrency":
      return apiError(
        "AI_CONCURRENCY_LIMIT",
        "同时处理的任务已达上限。",
        429,
        true,
      );
    case "ai_unavailable":
      return apiError("AI_NOT_CONFIGURED", "当前尚未配置可用模型服务。", 503);
  }
}
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
  try {
    const result = await createArticle(
      context.get("userId"),
      parsed.data.ideaId,
    );
    return context.json({ articleId: result.id }, result.created ? 201 : 200);
  } catch (error) {
    return articleFailure(error);
  }
});
articleRoutes.get("/articles/:id", async (context) => {
  try {
    return context.json(
      await getArticle(context.get("userId"), context.req.param("id")),
    );
  } catch (error) {
    return articleFailure(error);
  }
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
  try {
    const version = await updateBrief(
      context.get("userId"),
      context.req.param("id"),
      expectedVersion,
      brief,
    );
    return context.json({ version });
  } catch (error) {
    return articleFailure(error, "修改");
  }
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
  try {
    const jobId = await startOutlineGeneration(
      context.get("userId"),
      context.req.param("id"),
      parsed.data.expectedVersion,
      key,
    );
    return context.json({ jobId, status: "queued", mode: "mock" }, 202);
  } catch (error) {
    return articleFailure(error, "生成");
  }
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
  try {
    const version = await saveOutline(
      context.get("userId"),
      context.req.param("id"),
      parsed.data.expectedVersion,
      parsed.data.outline,
    );
    return context.json({ version });
  } catch (error) {
    return articleFailure(error, "保存");
  }
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
  try {
    const version = await confirmOutline(
      context.get("userId"),
      context.req.param("id"),
      parsed.data.expectedVersion,
    );
    return context.json({ version, status: "confirmed" });
  } catch (error) {
    return articleFailure(error, "确认");
  }
});
articleRoutes.post("/articles/:id/draft/generate", async (context) => {
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
  try {
    const jobId = await startDraftGeneration(
      context.get("userId"),
      context.req.param("id"),
      parsed.data.expectedVersion,
      key,
    );
    return context.json({ jobId, status: "queued", mode: "mock" }, 202);
  } catch (error) {
    return articleFailure(error, "生成");
  }
});
articleRoutes.post("/articles/:id/drafts/:draftId/apply", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return apiError("ARTICLE_INPUT_TOO_LARGE", "请求内容过长。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = versionInput.safeParse(body.value);
  if (!parsed.success)
    return apiError("INVALID_ARTICLE_VERSION", "请提供当前文章版本。", 422);
  try {
    const version = await applyDraft(
      context.get("userId"),
      context.req.param("id"),
      context.req.param("draftId"),
      parsed.data.expectedVersion,
    );
    return context.json({ version });
  } catch (error) {
    return articleFailure(error, "替换正文");
  }
});
articleRoutes.post("/articles/:id/drafts/:draftId/discard", async (context) => {
  try {
    await discardDraft(
      context.get("userId"),
      context.req.param("id"),
      context.req.param("draftId"),
    );
    return context.body(null, 204);
  } catch (error) {
    return articleFailure(error);
  }
});
articleRoutes.put("/articles/:id/body", async (context) => {
  // 50,000 characters may take up to ~200 KB as UTF-8 JSON.
  const body = await readJson(context.req.raw, 262_144);
  if (body.status === "large")
    return apiError(
      "ARTICLE_BODY_TOO_LARGE",
      "正文不能超过 50,000 字符。",
      413,
    );
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = bodyInput.safeParse(body.value);
  if (!parsed.success)
    return apiError(
      "INVALID_ARTICLE_BODY",
      "标题不能为空且不超过 200 字。",
      422,
    );
  if (parsed.data.body.length > MAX_BODY_CHARS)
    return apiError(
      "ARTICLE_BODY_TOO_LARGE",
      "正文不能超过 50,000 字符。",
      413,
    );
  const { expectedVersion, ...input } = parsed.data;
  try {
    const version = await saveBody(
      context.get("userId"),
      context.req.param("id"),
      expectedVersion,
      input,
    );
    return context.json({ version });
  } catch (error) {
    return articleFailure(error, "保存");
  }
});
