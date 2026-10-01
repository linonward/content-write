import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../identity/auth";
import { parseImport } from "./import-file";
import { fetchLink, validatePublicUrl } from "./link-fetch";
import { getAnalysis, getJob, startAnalysis } from "./process";
import {
  allowLinkFetch,
  createMaterial,
  deleteMaterial,
  getMaterial,
  listMaterials,
  updateMaterial,
} from "./repository";

const materialInput = z.strictObject({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(50_000),
});
const updateInput = materialInput.extend({
  expectedVersion: z.int().positive(),
});
const linkInput = z.strictObject({
  url: z.string().trim().min(1).max(2048),
  fetch: z.boolean().optional(),
});
const listInput = z.strictObject({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(["text", "markdown", "link"]).optional(),
  status: z
    .enum(["unprocessed", "processing", "failed", "analyzed"])
    .optional(),
  tag: z.string().trim().min(1).max(50).optional(),
});

export const materialRoutes = new Hono<{
  Variables: { materialUserId: string };
}>();

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
  if (Number(request.headers.get("content-length")) > 1_048_576)
    return { status: "large" as const };
  const body = await request.text();
  if (body.length > 1_048_576) return { status: "large" as const };
  try {
    return { status: "ok" as const, value: JSON.parse(body) as unknown };
  } catch {
    return { status: "invalid" as const };
  }
}

materialRoutes.use("/materials/*", async (context, next) => {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  if (!session) return error("UNAUTHORIZED", "请先登录。", 401);
  context.set("materialUserId", session.user.id);
  if (!["GET", "HEAD", "OPTIONS"].includes(context.req.method)) {
    if (
      context.req.header("origin") !==
      (process.env.WEB_ORIGIN ?? "http://localhost:3000")
    ) {
      return error("INVALID_ORIGIN", "请求来源不受信任。", 403);
    }
  }
  await next();
});
materialRoutes.use("/materials", async (context, next) => {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  if (!session) return error("UNAUTHORIZED", "请先登录。", 401);
  context.set("materialUserId", session.user.id);
  if (
    context.req.method === "POST" &&
    context.req.header("origin") !==
      (process.env.WEB_ORIGIN ?? "http://localhost:3000")
  ) {
    return error("INVALID_ORIGIN", "请求来源不受信任。", 403);
  }
  await next();
});

materialRoutes.get("/materials", async (context) => {
  const search = new URL(context.req.url).searchParams;
  const parsed = listInput.safeParse(Object.fromEntries(search));
  if (!parsed.success)
    return error("INVALID_FILTER", "搜索或过滤条件无效。", 422);
  return context.json(
    await listMaterials(context.get("materialUserId"), parsed.data),
  );
});
materialRoutes.post("/materials", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return error("MATERIAL_TOO_LARGE", "素材正文过长。", 413);
  if (body.status === "invalid")
    return error("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = materialInput.safeParse(body.value);
  if (!parsed.success)
    return error(
      "INVALID_MATERIAL",
      "请填写标题和正文；标题最多 200 字，正文最多 50000 字。",
      422,
    );
  const item = await createMaterial(context.get("materialUserId"), parsed.data);
  return context.json({ material: item }, 201);
});
materialRoutes.post("/materials/import", async (context) => {
  const parsed = await parseImport(context.req.raw);
  if (parsed.status !== "ok") {
    return error(
      parsed.status === "large" ? "MATERIAL_TOO_LARGE" : "INVALID_FILE",
      parsed.message,
      parsed.status === "large" ? 413 : 422,
    );
  }
  const item = await createMaterial(
    context.get("materialUserId"),
    parsed.value,
  );
  return context.json({ material: item }, 201);
});
materialRoutes.get("/materials/link-capabilities", (context) =>
  context.json({
    remoteFetchEnabled: process.env.REMOTE_FETCH_ENABLED === "true",
  }),
);
materialRoutes.post("/materials/link", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return error("MATERIAL_TOO_LARGE", "链接过长。", 413);
  if (body.status === "invalid")
    return error("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = linkInput.safeParse(body.value);
  if (!parsed.success) return error("INVALID_LINK", "请输入有效的链接。", 422);
  let url: URL;
  try {
    url = validatePublicUrl(parsed.data.url);
  } catch {
    return error(
      "INVALID_LINK",
      "仅支持公开的 HTTP/HTTPS 地址及 80/443 端口。",
      422,
    );
  }
  const shouldFetch =
    parsed.data.fetch === true && process.env.REMOTE_FETCH_ENABLED === "true";
  if (shouldFetch && !(await allowLinkFetch(context.get("materialUserId")))) {
    return error(
      "LINK_FETCH_LIMIT",
      "抓取次数过多，请一小时后再试；也可先保存链接。",
      429,
    );
  }
  const fetched = shouldFetch ? await fetchLink(url.href) : null;
  const item = await createMaterial(context.get("materialUserId"), {
    title:
      fetched?.status === "fetched"
        ? fetched.title
        : url.hostname.slice(0, 200),
    content: fetched?.status === "fetched" ? fetched.content : "",
    kind: "link",
    sourceUrl: url.href,
    fetchStatus:
      fetched?.status === "fetched"
        ? "fetched"
        : shouldFetch
          ? "failed"
          : "disabled",
  });
  return context.json({ material: item }, 201);
});
materialRoutes.get("/materials/:id", async (context) => {
  const item = await getMaterial(
    context.get("materialUserId"),
    context.req.param("id"),
  );
  if (!item) return error("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  return context.json({ material: item });
});
materialRoutes.get("/materials/:id/analysis", async (context) => {
  const item = await getAnalysis(
    context.get("materialUserId"),
    context.req.param("id"),
  );
  if (!item) return error("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  return context.json({
    currentVersion: item.current_version,
    processingAvailable: process.env.AI_MODE === "mock",
    hasContent: item.has_content,
    job: item.job_id ? { id: item.job_id, status: item.job_status } : null,
    analysis: item.result
      ? {
          materialVersion: item.material_version,
          result: item.result,
          mode: item.mode,
        }
      : null,
  });
});
materialRoutes.post("/materials/:id/process", async (context) => {
  const key = context.req.header("idempotency-key");
  if (!key || key.length > 128 || !/^[\x21-\x7e]+$/.test(key))
    return error(
      "INVALID_IDEMPOTENCY_KEY",
      "请提供有效的 Idempotency-Key。",
      422,
    );
  const result = await startAnalysis(
    context.get("materialUserId"),
    context.req.param("id"),
    key,
  );
  if (result.status === "missing")
    return error("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  if (result.status === "no_content")
    return error(
      "MATERIAL_CONTENT_REQUIRED",
      "请先为链接素材粘贴正文，再整理素材。",
      422,
    );
  if (result.status === "conflict")
    return error("IDEMPOTENCY_CONFLICT", "请求键已用于不同素材版本。", 409);
  if (result.status === "already_done")
    return error("ALREADY_ANALYZED", "当前版本已有整理结果。", 409);
  if (result.status === "quota")
    return error("AI_DAILY_LIMIT", "今日处理次数已用完。", 429);
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
materialRoutes.patch("/materials/:id", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return error("MATERIAL_TOO_LARGE", "素材正文过长。", 413);
  if (body.status === "invalid")
    return error("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = updateInput.safeParse(body.value);
  if (!parsed.success)
    return error(
      "INVALID_MATERIAL",
      "请填写标题、正文和有效版本；标题最多 200 字，正文最多 50000 字。",
      422,
    );
  const { expectedVersion, ...input } = parsed.data;
  const result = await updateMaterial(
    context.get("materialUserId"),
    context.req.param("id"),
    expectedVersion,
    input,
  );
  if (result.status === "missing")
    return error("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  if (result.status === "conflict")
    return error(
      "MATERIAL_VERSION_CONFLICT",
      "素材已有新版本，请刷新后再编辑。",
      409,
    );
  return context.json({ material: result.item });
});
materialRoutes.delete("/materials/:id", async (context) => {
  const deleted = await deleteMaterial(
    context.get("materialUserId"),
    context.req.param("id"),
  );
  if (!deleted) return error("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  return context.body(null, 204);
});

export const jobRoutes = new Hono<{ Variables: { jobUserId: string } }>();
jobRoutes.use("/jobs/*", async (context, next) => {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  if (!session) return error("UNAUTHORIZED", "请先登录。", 401);
  context.set("jobUserId", session.user.id);
  if (
    !["GET", "HEAD", "OPTIONS"].includes(context.req.method) &&
    context.req.header("origin") !==
      (process.env.WEB_ORIGIN ?? "http://localhost:3000")
  ) {
    return error("INVALID_ORIGIN", "请求来源不受信任。", 403);
  }
  await next();
});
jobRoutes.get("/jobs/:id", async (context) => {
  const job = await getJob(context.get("jobUserId"), context.req.param("id"));
  if (!job) return error("JOB_NOT_FOUND", "任务不存在。", 404);
  return context.json({
    job: {
      id: job.id,
      materialId: job.material_id,
      materialVersion: job.material_version,
      status: job.status,
      errorCode: job.error_code,
      updatedAt: job.updated_at,
      analysis:
        job.status === "succeeded"
          ? { result: job.result, mode: job.mode }
          : null,
    },
  });
});
jobRoutes.post("/jobs/:id/retry", async (context) => {
  const key = context.req.header("idempotency-key");
  if (!key || key.length > 128 || !/^[\x21-\x7e]+$/.test(key))
    return error(
      "INVALID_IDEMPOTENCY_KEY",
      "请提供有效的 Idempotency-Key。",
      422,
    );
  const job = await getJob(context.get("jobUserId"), context.req.param("id"));
  if (!job) return error("JOB_NOT_FOUND", "任务不存在。", 404);
  if (job.status !== "failed")
    return error("JOB_NOT_RETRYABLE", "只有处理失败的任务可以重试。", 409);
  const result = await startAnalysis(
    context.get("jobUserId"),
    job.material_id,
    key,
    job.material_version,
  );
  if (result.status === "missing")
    return error("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  if (result.status === "conflict")
    return error(
      "MATERIAL_VERSION_CONFLICT",
      "素材版本已变化，请刷新后重新处理。",
      409,
    );
  if (result.status === "no_content")
    return error("MATERIAL_CONTENT_REQUIRED", "请先粘贴正文。", 422);
  if (result.status === "already_done")
    return error("ALREADY_ANALYZED", "当前版本已有整理结果。", 409);
  if (result.status === "quota")
    return error("AI_DAILY_LIMIT", "今日处理次数已用完。", 429);
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
