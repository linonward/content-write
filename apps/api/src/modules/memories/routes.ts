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
  addMemory,
  changeMemory,
  deleteMemory,
  listMemories,
  MemoryError,
  startExtraction,
} from "./service";

const content = z.string().trim().min(1).max(200);
const createInput = z.strictObject({ content });
const changeInput = z.union([
  z.strictObject({ expectedVersion: z.int().positive(), content }),
  z.strictObject({
    expectedVersion: z.int().positive(),
    status: z.enum(["confirmed", "disabled"]),
  }),
]);

function mapError(error: unknown) {
  if (!(error instanceof MemoryError)) throw error;
  switch (error.reason) {
    case "missing":
      return apiError("MEMORY_NOT_FOUND", "记忆不存在。", 404);
    case "version_conflict":
      return apiError(
        "MEMORY_VERSION_CONFLICT",
        "这条记忆已在别处修改，请刷新列表后重试。",
        409,
      );
    case "limit":
      return apiError(
        "MEMORY_LIMIT",
        "最多保存 50 条记忆（含候选与禁用），请先删除不需要的记忆。",
        409,
      );
    case "samples_required":
      return apiError(
        "SAMPLES_REQUIRED",
        "请先在“历史文章”中添加并启用至少 1 篇文章。",
        422,
      );
    case "job_active":
      return apiError("MEMORY_JOB_ACTIVE", "正在提取候选记忆，请稍候。", 409);
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

async function readInput(request: Request) {
  const body = await readJson(request, 4096);
  if (body.status === "large")
    return { response: apiError("MEMORY_TOO_LARGE", "请求过大。", 413) };
  if (body.status === "invalid")
    return {
      response: apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400),
    };
  return { value: body.value };
}
const invalidMemory = () =>
  apiError("INVALID_MEMORY", "记忆需为 1–200 字，并提供有效版本。", 422);

export const memoryRoutes = new Hono<AuthedEnv>();
memoryRoutes.use("/memories", requireUser);
memoryRoutes.use("/memories/*", requireUser);
memoryRoutes.get("/memories", async (c) =>
  c.json(await listMemories(c.get("userId"))),
);
memoryRoutes.post("/memories", async (c) => {
  const body = await readInput(c.req.raw);
  if (body.response) return body.response;
  const input = createInput.safeParse(body.value);
  if (!input.success) return invalidMemory();
  try {
    await addMemory(c.get("userId"), input.data.content);
    return c.json(await listMemories(c.get("userId")), 201);
  } catch (error) {
    return mapError(error);
  }
});
memoryRoutes.post("/memories/extract", requireAiConsent, async (c) => {
  const key = idempotencyKey(c.req.raw);
  if (!key) return invalidIdempotencyKey();
  try {
    const jobId = await startExtraction(c.get("userId"), key);
    return c.json({ jobId, status: "queued", mode: aiMode() }, 202);
  } catch (error) {
    return mapError(error);
  }
});
memoryRoutes.patch("/memories/:id", async (c) => {
  const body = await readInput(c.req.raw);
  if (body.response) return body.response;
  const input = changeInput.safeParse(body.value);
  if (!input.success) return invalidMemory();
  const { expectedVersion, ...change } = input.data;
  try {
    await changeMemory(
      c.get("userId"),
      c.req.param("id"),
      expectedVersion,
      change,
    );
    return c.json(await listMemories(c.get("userId")));
  } catch (error) {
    return mapError(error);
  }
});
memoryRoutes.delete("/memories/:id", async (c) => {
  try {
    await deleteMemory(c.get("userId"), c.req.param("id"));
    return c.body(null, 204);
  } catch (error) {
    return mapError(error);
  }
});
