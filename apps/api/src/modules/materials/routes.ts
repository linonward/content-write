import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../identity/auth";
import { parseImport } from "./import-file";
import { fetchLink, validatePublicUrl } from "./link-fetch";
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

export const materialRoutes = new Hono<{
  Variables: { materialUserId: string };
}>();

function error(
  code: string,
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429,
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
  return context.json({
    materials: await listMaterials(context.get("materialUserId")),
  });
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
