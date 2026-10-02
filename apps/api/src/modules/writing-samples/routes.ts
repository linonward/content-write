import { Hono } from "hono";
import { z } from "zod";
import { type AuthedEnv, apiError, readJson, requireUser } from "../../http";
import {
  addSample,
  deleteSample,
  listSamples,
  SampleError,
  toggleSample,
} from "./service";

const createInput = z.strictObject({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20000),
});
const toggleInput = z.strictObject({
  expectedVersion: z.int().positive(),
  enabled: z.boolean(),
});
function mapError(error: unknown) {
  if (!(error instanceof SampleError)) throw error;
  if (error.reason === "missing")
    return apiError("SAMPLE_NOT_FOUND", "历史文章不存在。", 404);
  if (error.reason === "limit")
    return apiError(
      "SAMPLE_LIMIT",
      "最多保存 20 篇历史文章，请先删除不需要的文章。",
      409,
    );
  return apiError(
    "SAMPLE_VERSION_CONFLICT",
    "历史文章状态已在别处修改，请刷新列表后重试。",
    409,
  );
}
export const writingSampleRoutes = new Hono<AuthedEnv>();
writingSampleRoutes.use("/writing-samples", requireUser);
writingSampleRoutes.use("/writing-samples/*", requireUser);
writingSampleRoutes.get("/writing-samples", async (c) =>
  c.json({ samples: await listSamples(c.get("userId")) }),
);
writingSampleRoutes.post("/writing-samples", async (c) => {
  const body = await readJson(c.req.raw, 128000);
  if (body.status === "large")
    return apiError("SAMPLE_TOO_LARGE", "历史文章请求过大。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const input = createInput.safeParse(body.value);
  if (!input.success)
    return apiError(
      "INVALID_SAMPLE",
      "请填写标题与正文；标题最多 200 字，正文最多 20000 字。",
      422,
    );
  try {
    return c.json(
      { sample: await addSample(c.get("userId"), input.data) },
      201,
    );
  } catch (error) {
    return mapError(error);
  }
});
writingSampleRoutes.patch("/writing-samples/:id", async (c) => {
  const body = await readJson(c.req.raw, 4096);
  if (body.status === "large")
    return apiError("SAMPLE_TOO_LARGE", "请求过大。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const input = toggleInput.safeParse(body.value);
  if (!input.success)
    return apiError("INVALID_SAMPLE", "请提供有效的版本与启用状态。", 422);
  try {
    return c.json({
      sample: await toggleSample(
        c.get("userId"),
        c.req.param("id"),
        input.data.expectedVersion,
        input.data.enabled,
      ),
    });
  } catch (error) {
    return mapError(error);
  }
});
writingSampleRoutes.delete("/writing-samples/:id", async (c) => {
  try {
    await deleteSample(c.get("userId"), c.req.param("id"));
    return c.body(null, 204);
  } catch (error) {
    return mapError(error);
  }
});
