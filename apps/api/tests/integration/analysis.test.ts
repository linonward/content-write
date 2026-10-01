import { randomUUID } from "node:crypto";
import { rateLimit, user } from "@content-write/db/auth-schema";
import { getDb, getPool } from "@content-write/db/client";
import { aiJobs, aiRuns, materialAnalyses } from "@content-write/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createMockAnalysis } from "../../../worker/src/analysis";
import { claimJob, completeJob, processOneJob } from "../../../worker/src/jobs";
import { app } from "../../src/app";
import { auth } from "../../src/modules/identity/auth";

const suffix = randomUUID();
const password = `integration-${suffix}`;
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const users: string[] = [];
const priorMode = process.env.AI_MODE;
process.env.AI_MODE = "mock";

async function signIn(label: string) {
  await getDb().delete(rateLimit);
  const email = `${label}-${suffix}@example.test`;
  const created = await auth.api.createUser({
    body: { email, name: email, password, role: "user" },
  });
  users.push(created.user.id);
  const response = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function material(cookie: string, content = "🚀作者认为应该先验证。") {
  const response = await app.request("/api/materials", {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ title: "测试素材", content }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { material: { id: string } }).material.id;
}

function startRequest(
  id: string,
  cookie?: string,
  key = randomUUID(),
  source = origin,
) {
  return app.request(`/api/materials/${id}/process`, {
    method: "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      origin: source,
      "idempotency-key": key,
    },
  });
}

describe("material processing", () => {
  afterAll(async () => {
    if (priorMode === undefined) delete process.env.AI_MODE;
    else process.env.AI_MODE = priorMode;
    for (const id of users) await getDb().delete(user).where(eq(user.id, id));
    await getPool().end();
  });

  it("requires owner, origin and key; preserves idempotency and enforces quotas", async () => {
    const owner = await signIn("analysis-owner");
    const other = await signIn("analysis-other");
    const id = await material(owner);
    expect((await startRequest(id)).status).toBe(401);
    expect((await startRequest(id, other)).status).toBe(404);
    expect(
      (await startRequest(id, owner, randomUUID(), "https://untrusted.example"))
        .status,
    ).toBe(403);
    expect(
      (
        await app.request(`/api/materials/${id}/process`, {
          method: "POST",
          headers: { cookie: owner, origin },
        })
      ).status,
    ).toBe(422);
    const key = randomUUID();
    const first = await startRequest(id, owner, key);
    expect(first.status).toBe(202);
    const firstId = ((await first.json()) as { jobId: string }).jobId;
    const duplicate = await startRequest(id, owner, key);
    expect(((await duplicate.json()) as { jobId: string }).jobId).toBe(firstId);
    expect(
      (
        await app.request(`/api/jobs/${firstId}`, {
          headers: { cookie: other },
        })
      ).status,
    ).toBe(404);
    const secondId = await material(owner, "另一条素材");
    const prior = process.env.AI_DAILY_JOB_LIMIT;
    process.env.AI_DAILY_JOB_LIMIT = "1";
    try {
      expect((await startRequest(secondId, owner)).status).toBe(429);
    } finally {
      if (prior === undefined) delete process.env.AI_DAILY_JOB_LIMIT;
      else process.env.AI_DAILY_JOB_LIMIT = prior;
    }
  });

  it("worker commits validated result, usage and job state; old token cannot commit", async () => {
    const owner = await signIn("analysis-worker");
    const id = await material(owner);
    const started = await startRequest(id, owner);
    const jobId = ((await started.json()) as { jobId: string }).jobId;
    const claimed = await claimJob();
    expect(claimed).not.toBeNull();
    if (!claimed) return;
    expect(
      await completeJob(
        { ...claimed, claim_token: "expired" },
        createMockAnalysis("🚀作者认为应该先验证。"),
        5,
      ),
    ).toBe("lost");
    // Another queued job may be claimed first; process the claimed one and then our job.
    const source = await getPool().query<{ content: string }>(
      "SELECT content FROM materials WHERE id = $1",
      [claimed.material_id],
    );
    expect(
      await completeJob(
        claimed,
        createMockAnalysis(source.rows[0]?.content ?? ""),
        5,
      ),
    ).toBe("succeeded");
    if (claimed.id !== jobId) await processOneJob();
    const status = await app.request(`/api/jobs/${jobId}`, {
      headers: { cookie: owner },
    });
    expect(
      ((await status.json()) as { job: { status: string } }).job.status,
    ).toBe("succeeded");
    const analysis = await app.request(`/api/materials/${id}/analysis`, {
      headers: { cookie: owner },
    });
    expect(
      (
        (await analysis.json()) as {
          analysis: { result: { evidenceSpans: { quote: string }[] } };
        }
      ).analysis.result.evidenceSpans[0]?.quote,
    ).toContain("🚀");
    expect(
      await getDb()
        .select()
        .from(materialAnalyses)
        .where(eq(materialAnalyses.materialId, id)),
    ).toHaveLength(1);
    expect(
      await getDb().select().from(aiRuns).where(eq(aiRuns.jobId, jobId)),
    ).toHaveLength(1);
  });

  it("does not apply a stale material result", async () => {
    const owner = await signIn("analysis-stale");
    const id = await material(owner);
    const started = await startRequest(id, owner);
    const jobId = ((await started.json()) as { jobId: string }).jobId;
    // Drain earlier queued jobs so this claim belongs to the current test.
    let claimed = await claimJob();
    while (claimed && claimed.id !== jobId) {
      const source = await getPool().query<{ content: string }>(
        "SELECT content FROM materials WHERE id = $1",
        [claimed.material_id],
      );
      await completeJob(
        claimed,
        createMockAnalysis(source.rows[0]?.content ?? ""),
        1,
      );
      claimed = await claimJob();
    }
    expect(claimed?.id).toBe(jobId);
    if (!claimed) return;
    const changed = await app.request(`/api/materials/${id}`, {
      method: "PATCH",
      headers: { cookie: owner, origin, "content-type": "application/json" },
      body: JSON.stringify({
        title: "新版",
        content: "已经修改",
        expectedVersion: 1,
      }),
    });
    expect(changed.status).toBe(200);
    expect(
      await completeJob(
        claimed,
        createMockAnalysis("🚀作者认为应该先验证。"),
        1,
      ),
    ).toBe("stale");
    expect(
      await getDb()
        .select()
        .from(materialAnalyses)
        .where(eq(materialAnalyses.materialId, id)),
    ).toHaveLength(0);
    expect(
      await getDb().select().from(aiJobs).where(eq(aiJobs.id, jobId)),
    ).toMatchObject([{ status: "stale" }]);
  });

  it("recovers an expired lease and rejects its old token", async () => {
    const owner = await signIn("analysis-lease");
    const id = await material(owner);
    const started = await startRequest(id, owner);
    const jobId = ((await started.json()) as { jobId: string }).jobId;
    const first = await claimJob();
    expect(first?.id).toBe(jobId);
    if (!first) return;
    await getPool().query(
      "UPDATE ai_jobs SET lease_until = now() - interval '1 second' WHERE id = $1",
      [jobId],
    );
    const recovered = await claimJob();
    expect(recovered?.id).toBe(jobId);
    expect(recovered?.claim_token).not.toBe(first.claim_token);
    expect(
      await completeJob(first, createMockAnalysis("🚀作者认为应该先验证。"), 1),
    ).toBe("lost");
    if (!recovered) return;
    expect(
      await completeJob(
        recovered,
        createMockAnalysis("🚀作者认为应该先验证。"),
        1,
      ),
    ).toBe("succeeded");
  });

  it("limits concurrent jobs per user", async () => {
    const owner = await signIn("analysis-concurrency");
    const firstId = await material(owner, "第一条");
    const secondId = await material(owner, "第二条");
    const prior = process.env.AI_USER_CONCURRENCY;
    process.env.AI_USER_CONCURRENCY = "1";
    try {
      expect((await startRequest(firstId, owner)).status).toBe(202);
      expect((await startRequest(secondId, owner)).status).toBe(429);
    } finally {
      if (prior === undefined) delete process.env.AI_USER_CONCURRENCY;
      else process.env.AI_USER_CONCURRENCY = prior;
    }
  });

  it("requires source text and reports unavailable processing mode", async () => {
    const owner = await signIn("analysis-empty");
    const id = await material(owner, "待清空");
    await getPool().query("UPDATE materials SET content = '' WHERE id = $1", [
      id,
    ]);
    const emptyStatus = await app.request(`/api/materials/${id}/analysis`, {
      headers: { cookie: owner },
    });
    expect((await emptyStatus.json()) as object).toMatchObject({
      hasContent: false,
      processingAvailable: true,
    });
    expect((await startRequest(id, owner)).status).toBe(422);
    const prior = process.env.AI_MODE;
    process.env.AI_MODE = "real";
    try {
      const unavailable = await app.request(`/api/materials/${id}/analysis`, {
        headers: { cookie: owner },
      });
      expect((await unavailable.json()) as object).toMatchObject({
        processingAvailable: false,
      });
      expect((await startRequest(id, owner)).status).toBe(503);
    } finally {
      if (prior === undefined) delete process.env.AI_MODE;
      else process.env.AI_MODE = prior;
    }
  });
});
