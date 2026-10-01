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
import { parseImport } from "./import-file";
import { fetchLink, validatePublicUrl } from "./link-fetch";
import { getAnalysis, startAnalysis } from "./process";
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

export const materialRoutes = new Hono<AuthedEnv>();
materialRoutes.use("/materials", requireUser);
materialRoutes.use("/materials/*", requireUser);

const readBody = (request: Request) => readJson(request, 1_048_576);

materialRoutes.get("/materials", async (context) => {
  const search = new URL(context.req.url).searchParams;
  const parsed = listInput.safeParse(Object.fromEntries(search));
  if (!parsed.success)
    return apiError("INVALID_FILTER", "搜索或过滤条件无效。", 422);
  return context.json(await listMaterials(context.get("userId"), parsed.data));
});
materialRoutes.post("/materials", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return apiError("MATERIAL_TOO_LARGE", "素材正文过长。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = materialInput.safeParse(body.value);
  if (!parsed.success)
    return apiError(
      "INVALID_MATERIAL",
      "请填写标题和正文；标题最多 200 字，正文最多 50000 字。",
      422,
    );
  const item = await createMaterial(context.get("userId"), parsed.data);
  return context.json({ material: item }, 201);
});
materialRoutes.post("/materials/import", async (context) => {
  const parsed = await parseImport(context.req.raw);
  if (parsed.status !== "ok") {
    return apiError(
      parsed.status === "large" ? "MATERIAL_TOO_LARGE" : "INVALID_FILE",
      parsed.message,
      parsed.status === "large" ? 413 : 422,
    );
  }
  const item = await createMaterial(context.get("userId"), parsed.value);
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
    return apiError("MATERIAL_TOO_LARGE", "链接过长。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = linkInput.safeParse(body.value);
  if (!parsed.success)
    return apiError("INVALID_LINK", "请输入有效的链接。", 422);
  let url: URL;
  try {
    url = validatePublicUrl(parsed.data.url);
  } catch {
    return apiError(
      "INVALID_LINK",
      "仅支持公开的 HTTP/HTTPS 地址及 80/443 端口。",
      422,
    );
  }
  const shouldFetch =
    parsed.data.fetch === true && process.env.REMOTE_FETCH_ENABLED === "true";
  if (shouldFetch && !(await allowLinkFetch(context.get("userId")))) {
    return apiError(
      "LINK_FETCH_LIMIT",
      "抓取次数过多，请一小时后再试；也可先保存链接。",
      429,
    );
  }
  const fetched = shouldFetch ? await fetchLink(url.href) : null;
  const item = await createMaterial(context.get("userId"), {
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
    context.get("userId"),
    context.req.param("id"),
  );
  if (!item) return apiError("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  return context.json({ material: item });
});
materialRoutes.get("/materials/:id/analysis", async (context) => {
  const item = await getAnalysis(
    context.get("userId"),
    context.req.param("id"),
  );
  if (!item) return apiError("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  return context.json({
    currentVersion: item.current_version,
    processingAvailable: aiAvailable(),
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
  const key = idempotencyKey(context.req.raw);
  if (!key) return invalidIdempotencyKey();
  const result = await startAnalysis(
    context.get("userId"),
    context.req.param("id"),
    key,
  );
  if (result.status === "missing")
    return apiError("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  if (result.status === "no_content")
    return apiError(
      "MATERIAL_CONTENT_REQUIRED",
      "请先为链接素材粘贴正文，再整理素材。",
      422,
    );
  if (result.status === "conflict")
    return apiError("IDEMPOTENCY_CONFLICT", "请求键已用于不同素材版本。", 409);
  if (result.status === "already_done")
    return apiError("ALREADY_ANALYZED", "当前版本已有整理结果。", 409);
  if (result.status === "quota")
    return apiError("AI_DAILY_LIMIT", "今日处理次数已用完。", 429);
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
materialRoutes.patch("/materials/:id", async (context) => {
  const body = await readBody(context.req.raw);
  if (body.status === "large")
    return apiError("MATERIAL_TOO_LARGE", "素材正文过长。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = updateInput.safeParse(body.value);
  if (!parsed.success)
    return apiError(
      "INVALID_MATERIAL",
      "请填写标题、正文和有效版本；标题最多 200 字，正文最多 50000 字。",
      422,
    );
  const { expectedVersion, ...input } = parsed.data;
  const result = await updateMaterial(
    context.get("userId"),
    context.req.param("id"),
    expectedVersion,
    input,
  );
  if (result.status === "missing")
    return apiError("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  if (result.status === "conflict")
    return apiError(
      "MATERIAL_VERSION_CONFLICT",
      "素材已有新版本，请刷新后再编辑。",
      409,
    );
  return context.json({ material: result.item });
});
materialRoutes.delete("/materials/:id", async (context) => {
  const deleted = await deleteMaterial(
    context.get("userId"),
    context.req.param("id"),
  );
  if (!deleted) return apiError("MATERIAL_NOT_FOUND", "素材不存在。", 404);
  return context.body(null, 204);
});
