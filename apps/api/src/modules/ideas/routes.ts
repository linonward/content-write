import { Hono } from "hono";
import { z } from "zod";
import { aiAvailable } from "../../config";
import {
  type AuthedEnv,
  apiError,
  idempotencyKey,
  invalidIdempotencyKey,
  readJson,
  requireUser,
} from "../../http";
import { startIdeaGeneration } from "./process";
import { eligibleMaterials, listIdeas, setIdeaStatus } from "./repository";

const generateInput = z.strictObject({
  sources: z
    .array(
      z.strictObject({ id: z.string().uuid(), version: z.int().positive() }),
    )
    .min(1)
    .max(10),
});
const statusInput = z.strictObject({
  status: z.enum(["new", "saved", "ignored"]),
});

export const ideaRoutes = new Hono<AuthedEnv>();

const readBody = (request: Request) => readJson(request, 16_384);

ideaRoutes.use("/ideas", requireUser);
ideaRoutes.use("/ideas/*", requireUser);

ideaRoutes.get("/ideas/materials", async (context) =>
  context.json({
    ...(await eligibleMaterials(context.get("userId"))),
    generationAvailable: aiAvailable(),
  }),
);
ideaRoutes.get("/ideas", async (context) =>
  context.json(await listIdeas(context.get("userId"))),
);
ideaRoutes.post("/ideas/generate", async (context) => {
  const key = idempotencyKey(context.req.raw);
  if (!key) return invalidIdempotencyKey();
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return apiError("IDEA_INPUT_TOO_LARGE", "选取素材过多。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = generateInput.safeParse(body.value);
  if (
    !parsed.success ||
    new Set(parsed.data.sources.map((source) => source.id)).size !==
      parsed.data.sources.length
  )
    return apiError(
      "INVALID_SOURCES",
      "请选择 1～10 条不同的已整理素材。",
      422,
    );
  const result = await startIdeaGeneration(
    context.get("userId"),
    parsed.data.sources,
    key,
  );
  if (result.status === "missing")
    return apiError("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  if (result.status === "stale")
    return apiError(
      "MATERIAL_VERSION_CONFLICT",
      "素材版本已变化，请刷新后重选。",
      409,
    );
  if (result.status === "unprocessed")
    return apiError(
      "MATERIAL_NOT_ANALYZED",
      "请先整理选定素材的当前版本。",
      422,
    );
  if (result.status === "conflict")
    return apiError("IDEMPOTENCY_CONFLICT", "请求键已用于其他输入。", 409);
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
  if (result.status !== "created" && result.status !== "existing")
    return apiError("INTERNAL_ERROR", "任务创建失败。", 503);
  return context.json(
    { jobId: result.jobId, status: "queued", mode: "mock" },
    202,
  );
});
ideaRoutes.patch("/ideas/:id", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return apiError("IDEA_INPUT_TOO_LARGE", "请求内容过长。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = statusInput.safeParse(body.value);
  if (!parsed.success)
    return apiError("INVALID_IDEA_STATUS", "选题状态无效。", 422);
  const updated = await setIdeaStatus(
    context.get("userId"),
    context.req.param("id"),
    parsed.data.status,
  );
  if (!updated) return apiError("IDEA_NOT_FOUND", "选题不存在。", 404);
  return context.json({ idea: updated });
});
