import { MAX_SELECTION_CHARS } from "@content-write/db/edit-suggestions";
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
  applySuggestion,
  EditError,
  listSuggestions,
  rejectSuggestion,
  startEdit,
} from "./service";

const editInput = z
  .strictObject({
    expectedVersion: z.int().positive(),
    scope: z.enum(["selection", "full"]),
    start: z.int().nonnegative(),
    end: z.int().positive(),
    // Length is checked separately so an oversized selection gets 413, not 422.
    selectionText: z.string(),
    instruction: z.string().trim().min(1).max(500),
  })
  .refine((input) => input.end > input.start);
const versionInput = z.strictObject({ expectedVersion: z.int().positive() });

function editFailure(error: unknown) {
  if (!(error instanceof EditError)) throw error;
  switch (error.reason) {
    case "article_missing":
      return apiError("ARTICLE_NOT_FOUND", "文章不存在。", 404);
    case "body_missing":
      return apiError(
        "ARTICLE_BODY_REQUIRED",
        "文章还没有正文，生成或写好正文后再请求修改。",
        422,
      );
    case "version_conflict":
      return apiError(
        "ARTICLE_VERSION_CONFLICT",
        "文章已有新版本，请刷新后再操作。",
        409,
      );
    case "selection_mismatch":
      return apiError(
        "SELECTION_MISMATCH",
        "选中的文字与服务器上的正文不一致，请等待保存完成后重新选择。",
        409,
      );
    case "invalid_scope":
      return apiError("INVALID_EDIT_SCOPE", "全文修改需要覆盖整篇正文。", 422);
    case "idempotency_conflict":
      return apiError("IDEMPOTENCY_CONFLICT", "请求键已用于其他输入。", 409);
    case "job_active":
      return apiError(
        "EDIT_JOB_ACTIVE",
        "这篇文章已有正在生成的修改建议。",
        409,
      );
    case "suggestion_missing":
      return apiError("SUGGESTION_NOT_FOUND", "修改建议不存在。", 404);
    case "suggestion_not_ready":
      return apiError("SUGGESTION_NOT_READY", "修改建议还在生成。", 409);
    case "suggestion_closed":
      return apiError("SUGGESTION_CLOSED", "这条建议已应用或已拒绝。", 409);
    case "suggestion_stale":
      return apiError(
        "SUGGESTION_STALE",
        "正文已变化，这条建议已过期，请重新选择后生成。",
        409,
      );
    case "body_too_large":
      return apiError(
        "ARTICLE_BODY_TOO_LARGE",
        "应用后正文会超过 50,000 字符。",
        413,
      );
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

export const articleEditRoutes = new Hono<AuthedEnv>();
articleEditRoutes.use("/articles/:id/edit", requireUser);
articleEditRoutes.use("/articles/:id/suggestions", requireUser);
articleEditRoutes.use("/articles/:id/suggestions/*", requireUser);

articleEditRoutes.post(
  "/articles/:id/edit",
  requireAiConsent,
  async (context) => {
    const key = idempotencyKey(context.req.raw);
    if (!key) return invalidIdempotencyKey();
    // 8,000 characters may take ~32 KB as UTF-8 JSON.
    const body = await readJson(context.req.raw, 65_536);
    if (body.status === "large")
      return apiError(
        "SELECTION_TOO_LARGE",
        `一次最多修改 ${MAX_SELECTION_CHARS.toLocaleString("en-US")} 字符，请分段选择。`,
        413,
      );
    if (body.status === "invalid")
      return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
    const parsed = editInput.safeParse(body.value);
    if (!parsed.success)
      return apiError(
        "INVALID_EDIT_REQUEST",
        "请选择要修改的文字，并填写 1～500 字的修改要求。",
        422,
      );
    if (parsed.data.selectionText.length > MAX_SELECTION_CHARS)
      return apiError(
        "SELECTION_TOO_LARGE",
        `一次最多修改 ${MAX_SELECTION_CHARS.toLocaleString("en-US")} 字符，请分段选择。`,
        413,
      );
    if (!parsed.data.selectionText.trim())
      return apiError(
        "INVALID_EDIT_REQUEST",
        "选中的内容只有空白，请选择要修改的文字。",
        422,
      );
    try {
      const jobId = await startEdit(
        context.get("userId"),
        context.req.param("id"),
        parsed.data,
        key,
      );
      return context.json({ jobId, status: "queued", mode: aiMode() }, 202);
    } catch (error) {
      return editFailure(error);
    }
  },
);
articleEditRoutes.get("/articles/:id/suggestions", async (context) => {
  try {
    return context.json(
      await listSuggestions(context.get("userId"), context.req.param("id")),
    );
  } catch (error) {
    return editFailure(error);
  }
});
articleEditRoutes.post(
  "/articles/:id/suggestions/:sid/apply",
  async (context) => {
    const body = await readJson(context.req.raw, 4_096);
    if (body.status === "large")
      return apiError("ARTICLE_INPUT_TOO_LARGE", "请求内容过长。", 413);
    if (body.status === "invalid")
      return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
    const parsed = versionInput.safeParse(body.value);
    if (!parsed.success)
      return apiError("INVALID_ARTICLE_VERSION", "请提供当前文章版本。", 422);
    try {
      const version = await applySuggestion(
        context.get("userId"),
        context.req.param("id"),
        context.req.param("sid"),
        parsed.data.expectedVersion,
      );
      return context.json({ version });
    } catch (error) {
      return editFailure(error);
    }
  },
);
articleEditRoutes.post(
  "/articles/:id/suggestions/:sid/reject",
  async (context) => {
    try {
      await rejectSuggestion(
        context.get("userId"),
        context.req.param("id"),
        context.req.param("sid"),
      );
      return context.body(null, 204);
    } catch (error) {
      return editFailure(error);
    }
  },
);
