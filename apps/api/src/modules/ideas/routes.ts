import { randomUUID } from "node:crypto";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { auth } from "../identity/auth";
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

export const ideaRoutes = new Hono<{ Variables: { ideaUserId: string } }>();

function error(
  code: string,
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 503,
) {
  return new Response(
    JSON.stringify({
      error: { code, message, requestId: randomUUID(), retryable: false },
    }),
    {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}

async function readBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 16_384)
    return { status: "large" as const };
  const body = await request.text();
  if (body.length > 16_384) return { status: "large" as const };
  try {
    return { status: "ok" as const, value: JSON.parse(body) as unknown };
  } catch {
    return { status: "invalid" as const };
  }
}

const guard: MiddlewareHandler<{ Variables: { ideaUserId: string } }> = async (
  context,
  next,
) => {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  if (!session) return error("UNAUTHORIZED", "请先登录。", 401);
  context.set("ideaUserId", session.user.id);
  if (
    !["GET", "HEAD", "OPTIONS"].includes(context.req.method) &&
    context.req.header("origin") !==
      (process.env.WEB_ORIGIN ?? "http://localhost:3000")
  ) {
    return error("INVALID_ORIGIN", "请求来源不受信任。", 403);
  }
  await next();
};

ideaRoutes.use("/ideas", guard);
ideaRoutes.use("/ideas/*", guard);

ideaRoutes.get("/ideas/materials", async (context) =>
  context.json({
    ...(await eligibleMaterials(context.get("ideaUserId"))),
    generationAvailable: process.env.AI_MODE === "mock",
  }),
);
ideaRoutes.get("/ideas", async (context) =>
  context.json(await listIdeas(context.get("ideaUserId"))),
);
ideaRoutes.post("/ideas/generate", async (context) => {
  const key = context.req.header("idempotency-key");
  if (!key || key.length > 128 || !/^[\x21-\x7e]+$/.test(key))
    return error(
      "INVALID_IDEMPOTENCY_KEY",
      "请提供有效的 Idempotency-Key。",
      422,
    );
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return error("IDEA_INPUT_TOO_LARGE", "选取素材过多。", 413);
  if (body.status === "invalid")
    return error("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = generateInput.safeParse(body.value);
  if (
    !parsed.success ||
    new Set(parsed.data.sources.map((source) => source.id)).size !==
      parsed.data.sources.length
  )
    return error("INVALID_SOURCES", "请选择 1～10 条不同的已整理素材。", 422);
  const result = await startIdeaGeneration(
    context.get("ideaUserId"),
    parsed.data.sources,
    key,
  );
  if (result.status === "missing")
    return error("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  if (result.status === "stale")
    return error(
      "MATERIAL_VERSION_CONFLICT",
      "素材版本已变化，请刷新后重选。",
      409,
    );
  if (result.status === "unprocessed")
    return error("MATERIAL_NOT_ANALYZED", "请先整理选定素材的当前版本。", 422);
  if (result.status === "conflict")
    return error("IDEMPOTENCY_CONFLICT", "请求键已用于其他输入。", 409);
  if (result.status === "quota")
    return error("AI_DAILY_LIMIT", "今日生成次数已用完。", 429);
  if (result.status === "concurrency")
    return error("AI_CONCURRENCY_LIMIT", "同时处理的任务已达上限。", 429);
  if (result.status === "unavailable")
    return error("AI_NOT_CONFIGURED", "当前尚未配置可用模型服务。", 503);
  if (result.status !== "created" && result.status !== "existing")
    return error("INTERNAL_ERROR", "任务创建失败。", 503);
  return context.json(
    { jobId: result.jobId, status: "queued", mode: "mock" },
    202,
  );
});
ideaRoutes.patch("/ideas/:id", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return error("IDEA_INPUT_TOO_LARGE", "请求内容过长。", 413);
  if (body.status === "invalid")
    return error("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = statusInput.safeParse(body.value);
  if (!parsed.success)
    return error("INVALID_IDEA_STATUS", "选题状态无效。", 422);
  const updated = await setIdeaStatus(
    context.get("ideaUserId"),
    context.req.param("id"),
    parsed.data.status,
  );
  if (!updated) return error("IDEA_NOT_FOUND", "选题不存在。", 404);
  return context.json({ idea: updated });
});
