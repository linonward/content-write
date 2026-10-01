import { Hono } from "hono";
import {
  type AuthedEnv,
  apiError,
  idempotencyKey,
  invalidIdempotencyKey,
  requireUser,
} from "../../http";
import { startAnalysis } from "../materials/process";
import { getJob } from "./repository";

export const jobRoutes = new Hono<AuthedEnv>();
jobRoutes.use("/jobs/*", requireUser);

jobRoutes.get("/jobs/:id", async (context) => {
  const job = await getJob(context.get("userId"), context.req.param("id"));
  if (!job) return apiError("JOB_NOT_FOUND", "任务不存在。", 404);
  return context.json({
    job: {
      id: job.id,
      kind: job.kind,
      materialId: job.material_id,
      materialVersion: job.material_version,
      status: job.status,
      errorCode: job.error_code,
      updatedAt: job.updated_at,
      analysis:
        job.status === "succeeded" && job.result
          ? { result: job.result, mode: job.mode }
          : null,
    },
  });
});

// Only material analysis has a retry endpoint; ideas and outlines regenerate from their own pages.
jobRoutes.post("/jobs/:id/retry", async (context) => {
  const key = idempotencyKey(context.req.raw);
  if (!key) return invalidIdempotencyKey();
  const userId = context.get("userId");
  const job = await getJob(userId, context.req.param("id"));
  if (!job) return apiError("JOB_NOT_FOUND", "任务不存在。", 404);
  if (
    job.status !== "failed" ||
    job.kind !== "material_analysis" ||
    !job.material_id ||
    !job.material_version
  )
    return apiError(
      "JOB_NOT_RETRYABLE",
      "只有处理失败的素材整理任务可以重试。",
      409,
    );
  const result = await startAnalysis(
    userId,
    job.material_id,
    key,
    job.material_version,
  );
  switch (result.status) {
    case "created":
    case "existing":
      return context.json(
        { jobId: result.jobId, status: "queued", mode: "mock" },
        202,
      );
    case "missing":
      return apiError("MATERIAL_NOT_FOUND", "素材不存在。", 404);
    case "conflict":
      return apiError(
        "MATERIAL_VERSION_CONFLICT",
        "素材版本已变化，请刷新后重新处理。",
        409,
      );
    case "no_content":
      return apiError("MATERIAL_CONTENT_REQUIRED", "请先粘贴正文。", 422);
    case "already_done":
      return apiError("ALREADY_ANALYZED", "当前版本已有整理结果。", 409);
    case "quota":
      return apiError("AI_DAILY_LIMIT", "今日处理次数已用完。", 429);
    case "concurrency":
      return apiError(
        "AI_CONCURRENCY_LIMIT",
        "同时处理的任务已达上限。",
        429,
        true,
      );
    case "unavailable":
      return apiError("AI_NOT_CONFIGURED", "当前尚未配置可用模型服务。", 503);
  }
});
