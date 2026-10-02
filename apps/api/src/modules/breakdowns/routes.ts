import { Hono } from "hono";
import { z } from "zod";
import { aiMode } from "../../config";
import {
  type AuthedEnv,
  apiError,
  idempotencyKey,
  invalidIdempotencyKey,
  readJson,
  requireUser,
} from "../../http";
import { requireAiConsent } from "../ai-jobs/consent";
import {
  BreakdownError,
  createFromLink,
  createFromText,
  deleteReference,
  getReference,
  listReferences,
  startBreakdown,
  updateReference,
} from "./service";

const MAX_CONTENT_CHARS = 50_000;
const title = z.string().trim().min(1).max(200);
const content = z.string().trim().min(1);
const textInput = z.strictObject({
  title: title.optional(),
  content,
});
const linkInput = z.strictObject({
  url: z.string().trim().min(1).max(2048),
  fetch: z.boolean().optional(),
});
const updateInput = z.strictObject({
  expectedVersion: z.int().positive(),
  title,
  content,
});
const versionInput = z.strictObject({ expectedVersion: z.int().positive() });

export const breakdownRoutes = new Hono<AuthedEnv>();
breakdownRoutes.use("/breakdowns", requireUser);
breakdownRoutes.use("/breakdowns/*", requireUser);

const readBody = (request: Request) => readJson(request, 1_048_576);
const tooLarge = () =>
  apiError("REFERENCE_TOO_LARGE", "正文最多 50000 字。", 413);

function breakdownFailure(error: unknown) {
  if (!(error instanceof BreakdownError)) throw error;
  switch (error.reason) {
    case "reference_missing":
      return apiError("REFERENCE_NOT_FOUND", "参考文章不存在。", 404);
    case "version_conflict":
      return apiError(
        "REFERENCE_VERSION_CONFLICT",
        "参考文章已有新版本，请刷新后再操作。",
        409,
      );
    case "invalid_link":
      return apiError(
        "INVALID_LINK",
        "仅支持公开的 HTTP/HTTPS 地址及 80/443 端口。",
        422,
      );
    case "fetch_limit":
      return apiError(
        "LINK_FETCH_LIMIT",
        "抓取次数过多，请一小时后再试；也可以直接粘贴正文。",
        429,
      );
    case "content_required":
      return apiError(
        "REFERENCE_CONTENT_REQUIRED",
        "请先粘贴文章正文，再拆解。",
        422,
      );
    case "already_done":
      return apiError("ALREADY_BROKEN_DOWN", "当前版本已有拆解结果。", 409);
    case "job_active":
      return apiError("BREAKDOWN_JOB_ACTIVE", "这篇文章正在拆解。", 409);
    case "idempotency_conflict":
      return apiError("IDEMPOTENCY_CONFLICT", "请求键已用于其他输入。", 409);
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

breakdownRoutes.get("/breakdowns", async (context) =>
  context.json(await listReferences(context.get("userId"))),
);
breakdownRoutes.post("/breakdowns", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large") return tooLarge();
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const userId = context.get("userId");
  const link = linkInput.safeParse(body.value);
  if (link.success) {
    try {
      const created = await createFromLink(userId, link.data);
      return context.json(created, 201);
    } catch (error) {
      return breakdownFailure(error);
    }
  }
  const text = textInput.safeParse(body.value);
  if (!text.success)
    return apiError(
      "INVALID_REFERENCE",
      "请粘贴文章正文或填写公开链接；标题最多 200 字。",
      422,
    );
  if (text.data.content.length > MAX_CONTENT_CHARS) return tooLarge();
  return context.json({ id: await createFromText(userId, text.data) }, 201);
});
breakdownRoutes.get("/breakdowns/:id", async (context) => {
  try {
    return context.json(
      await getReference(context.get("userId"), context.req.param("id")),
    );
  } catch (error) {
    return breakdownFailure(error);
  }
});
breakdownRoutes.patch("/breakdowns/:id", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large") return tooLarge();
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = updateInput.safeParse(body.value);
  if (!parsed.success)
    return apiError(
      "INVALID_REFERENCE",
      "请填写标题、正文和有效版本；标题最多 200 字。",
      422,
    );
  const { expectedVersion, ...input } = parsed.data;
  if (input.content.length > MAX_CONTENT_CHARS) return tooLarge();
  try {
    const version = await updateReference(
      context.get("userId"),
      context.req.param("id"),
      expectedVersion,
      input,
    );
    return context.json({ version });
  } catch (error) {
    return breakdownFailure(error);
  }
});
breakdownRoutes.delete("/breakdowns/:id", async (context) => {
  try {
    await deleteReference(context.get("userId"), context.req.param("id"));
    return context.body(null, 204);
  } catch (error) {
    return breakdownFailure(error);
  }
});
breakdownRoutes.post(
  "/breakdowns/:id/process",
  requireAiConsent,
  async (context) => {
    const key = idempotencyKey(context.req.raw);
    if (!key) return invalidIdempotencyKey();
    const body = await readJson(context.req.raw, 1_024);
    if (body.status === "large")
      return apiError("INVALID_INPUT", "请求内容过长。", 413);
    if (body.status === "invalid")
      return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
    const parsed = versionInput.safeParse(body.value);
    if (!parsed.success)
      return apiError("INVALID_VERSION", "请提供有效版本。", 422);
    try {
      const jobId = await startBreakdown(
        context.get("userId"),
        context.req.param("id"),
        parsed.data.expectedVersion,
        key,
      );
      return context.json({ jobId, status: "queued", mode: aiMode() }, 202);
    } catch (error) {
      return breakdownFailure(error);
    }
  },
);
