import { randomUUID } from "node:crypto";
import { rateLimit, user } from "@content-write/db/auth-schema";
import { getDb, getPool } from "@content-write/db/client";
import {
  aiJobs,
  ideaJobSources,
  ideaSources,
  ideas,
} from "@content-write/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createMockAnalysis } from "../../../worker/src/analysis";
import {
  completeIdeaJob,
  loadIdeaSources,
} from "../../../worker/src/idea-jobs";
import { createMockIdeas } from "../../../worker/src/ideas";
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

async function material(cookie: string, label: string, analyzed = true) {
  const content = `${label}：作者记录了一个待验证的观点。`;
  const response = await app.request("/api/materials", {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ title: label, content }),
  });
  expect(response.status).toBe(201);
  const item = ((await response.json()) as { material: { id: string } })
    .material;
  if (analyzed) {
    await getPool().query(
      "INSERT INTO material_analyses (id, material_id, user_id, material_version, result, mode) SELECT $1, id, user_id, 1, $3::jsonb, 'mock' FROM materials WHERE id = $2",
      [randomUUID(), item.id, JSON.stringify(createMockAnalysis(content))],
    );
  }
  return { id: item.id, version: 1 };
}

function generate(
  cookie: string | undefined,
  sources: { id: string; version: number }[],
  key = randomUUID(),
  source = origin,
) {
  return app.request("/api/ideas/generate", {
    method: "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      origin: source,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify({ sources }),
  });
}

describe("source-based ideas", () => {
  afterAll(async () => {
    if (priorMode === undefined) delete process.env.AI_MODE;
    else process.env.AI_MODE = priorMode;
    for (const id of users) await getDb().delete(user).where(eq(user.id, id));
    await getPool().end();
  });

  it("requires owned current analyses, valid selection, trusted origin and idempotency", async () => {
    const owner = await signIn("idea-owner");
    const other = await signIn("idea-other");
    const ready = await material(owner, "选题来源");
    const foreign = await material(other, "别人的来源");
    const unprocessed = await material(owner, "未整理来源", false);
    expect((await generate(undefined, [ready])).status).toBe(401);
    expect(
      (
        await generate(
          owner,
          [ready],
          randomUUID(),
          "https://untrusted.example",
        )
      ).status,
    ).toBe(403);
    expect((await generate(owner, [])).status).toBe(422);
    expect((await generate(owner, [ready, ready])).status).toBe(422);
    expect((await generate(owner, [foreign])).status).toBe(404);
    expect((await generate(owner, [unprocessed])).status).toBe(422);
    expect((await generate(owner, [{ ...ready, version: 2 }])).status).toBe(
      409,
    );
    const key = randomUUID();
    const first = await generate(owner, [ready], key);
    expect(first.status).toBe(202);
    const jobId = ((await first.json()) as { jobId: string }).jobId;
    expect(
      (
        (await (await generate(owner, [ready], key)).json()) as {
          jobId: string;
        }
      ).jobId,
    ).toBe(jobId);
    expect((await generate(owner, [unprocessed], key)).status).toBe(409);
    const alternate = await material(owner, "第二来源");
    expect((await generate(owner, [alternate], key)).status).toBe(409);
    expect(
      (await app.request(`/api/jobs/${jobId}`, { headers: { cookie: other } }))
        .status,
    ).toBe(404);
    const eligible = await app.request("/api/ideas/materials", {
      headers: { cookie: owner },
    });
    const available = (
      (await eligible.json()) as { materials: { id: string }[] }
    ).materials;
    expect(available.some((item) => item.id === ready.id)).toBe(true);
    expect(
      available.some(
        (item) => item.id === unprocessed.id || item.id === foreign.id,
      ),
    ).toBe(false);
  });

  it("counts idea jobs against daily and concurrent limits", async () => {
    const owner = await signIn("idea-limits");
    const source = await material(owner, "限额素材");
    expect((await generate(owner, [source])).status).toBe(202);
    const daily = process.env.AI_DAILY_JOB_LIMIT;
    const concurrent = process.env.AI_USER_CONCURRENCY;
    try {
      process.env.AI_DAILY_JOB_LIMIT = "1";
      expect((await generate(owner, [source])).status).toBe(429);
      process.env.AI_DAILY_JOB_LIMIT = "20";
      process.env.AI_USER_CONCURRENCY = "1";
      expect((await generate(owner, [source])).status).toBe(429);
    } finally {
      if (daily === undefined) delete process.env.AI_DAILY_JOB_LIMIT;
      else process.env.AI_DAILY_JOB_LIMIT = daily;
      if (concurrent === undefined) delete process.env.AI_USER_CONCURRENCY;
      else process.env.AI_USER_CONCURRENCY = concurrent;
    }
  });

  it("keeps idea jobs out of material processing state and analysis retry", async () => {
    const owner = await signIn("idea-job-kind");
    const source = await material(owner, "类型隔离素材");
    const response = await generate(owner, [source]);
    expect(response.status).toBe(202);
    const jobId = ((await response.json()) as { jobId: string }).jobId;
    const panel = await app.request(`/api/materials/${source.id}/analysis`, {
      headers: { cookie: owner },
    });
    expect(((await panel.json()) as { job: unknown }).job).toBeNull();
    const job = await app.request(`/api/jobs/${jobId}`, {
      headers: { cookie: owner },
    });
    expect(((await job.json()) as { job: object }).job).toMatchObject({
      kind: "idea_generation",
      materialId: null,
    });
    await getPool().query(
      "UPDATE ai_jobs SET status = 'failed', error_code = 'IDEA_GENERATION_FAILED' WHERE id = $1",
      [jobId],
    );
    const panelAfterFailure = await app.request(
      `/api/materials/${source.id}/analysis`,
      { headers: { cookie: owner } },
    );
    expect(
      ((await panelAfterFailure.json()) as { job: unknown }).job,
    ).toBeNull();
    const retry = await app.request(`/api/jobs/${jobId}/retry`, {
      method: "POST",
      headers: { cookie: owner, origin, "idempotency-key": randomUUID() },
    });
    expect(retry.status).toBe(409);
    expect(
      ((await retry.json()) as { error: { code: string } }).error.code,
    ).toBe("JOB_NOT_RETRYABLE");
  });

  it("persists 3 source-backed ideas, allows owner to save and ignore, and removes them with a deleted source", async () => {
    const owner = await signIn("idea-flow");
    const other = await signIn("idea-flow-other");
    const first = await material(owner, "第一素材");
    const second = await material(owner, "第二素材");
    const response = await generate(owner, [first, second]);
    expect(response.status).toBe(202);
    const jobId = ((await response.json()) as { jobId: string }).jobId;
    for (let attempt = 0; attempt < 10; attempt++) {
      const state = await getPool().query<{ status: string }>(
        "SELECT status FROM ai_jobs WHERE id = $1",
        [jobId],
      );
      if (state.rows[0]?.status === "succeeded") break;
      await processOneJob();
    }
    const listed = await app.request("/api/ideas", {
      headers: { cookie: owner },
    });
    expect(listed.status).toBe(200);
    const payload = (await listed.json()) as {
      ideas: {
        id: string;
        sources: { materialId: string; materialVersion: number }[];
        evidenceGaps: string[];
        suggestedStructure: string[];
      }[];
    };
    const generated = payload.ideas.filter((idea) =>
      idea.sources.some((source) => source.materialId === first.id),
    );
    expect(generated).toHaveLength(3);
    expect(
      generated.every(
        (idea) =>
          idea.sources.length === 2 &&
          idea.evidenceGaps.length > 0 &&
          idea.suggestedStructure.length >= 2,
      ),
    ).toBe(true);
    const ideaId = generated[0].id;
    const patch = (cookie: string, status: string, source = origin) =>
      app.request(`/api/ideas/${ideaId}`, {
        method: "PATCH",
        headers: { cookie, origin: source, "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
    expect((await patch(other, "saved")).status).toBe(404);
    expect(
      (await patch(owner, "saved", "https://untrusted.example")).status,
    ).toBe(403);
    expect((await patch(owner, "invalid")).status).toBe(422);
    expect((await patch(owner, "saved")).status).toBe(200);
    expect((await patch(owner, "ignored")).status).toBe(200);
    const after = await app.request("/api/ideas", {
      headers: { cookie: owner },
    });
    expect(
      (
        (await after.json()) as { ideas: { id: string; status: string }[] }
      ).ideas.find((idea) => idea.id === ideaId)?.status,
    ).toBe("ignored");
    expect(
      (
        (await (
          await app.request("/api/ideas", { headers: { cookie: other } })
        ).json()) as { ideas: unknown[] }
      ).ideas,
    ).toHaveLength(0);
    expect(
      (
        await app.request(`/api/materials/${second.id}`, {
          method: "DELETE",
          headers: { cookie: owner, origin },
        })
      ).status,
    ).toBe(204);
    expect(
      await getDb().select().from(ideas).where(eq(ideas.jobId, jobId)),
    ).toHaveLength(0);
    expect(
      await getDb()
        .select()
        .from(ideaSources)
        .where(eq(ideaSources.materialId, first.id)),
    ).toHaveLength(0);
    expect(
      await getDb()
        .select()
        .from(ideaJobSources)
        .where(eq(ideaJobSources.jobId, jobId)),
    ).toHaveLength(0);
    expect(
      (await app.request(`/api/jobs/${jobId}`, { headers: { cookie: owner } }))
        .status,
    ).toBe(404);
  });

  it("rejects stale worker results and deleted claimed jobs", async () => {
    const owner = await signIn("idea-stale");
    const first = await material(owner, "旧来源");
    const second = await material(owner, "另一来源");
    const key = randomUUID();
    const started = await generate(owner, [first, second], key);
    const jobId = ((await started.json()) as { jobId: string }).jobId;
    let claimed = await claimJob();
    while (claimed && claimed.id !== jobId) {
      if (claimed.kind === "idea_generation") {
        const sources = await loadIdeaSources(claimed);
        if (sources)
          await completeIdeaJob(claimed, createMockIdeas(sources), 1);
      } else {
        const source = await getPool().query<{ content: string }>(
          "SELECT content FROM materials WHERE id = $1",
          [claimed.material_id],
        );
        await completeJob(
          claimed,
          createMockAnalysis(source.rows[0]?.content ?? ""),
          1,
        );
      }
      claimed = await claimJob();
    }
    expect(claimed?.id).toBe(jobId);
    const changed = await app.request(`/api/materials/${second.id}`, {
      method: "PATCH",
      headers: { cookie: owner, origin, "content-type": "application/json" },
      body: JSON.stringify({
        title: "新版来源",
        content: "新版正文",
        expectedVersion: 1,
      }),
    });
    expect(changed.status).toBe(200);
    expect(
      (
        (await (await generate(owner, [first, second], key)).json()) as {
          jobId: string;
        }
      ).jobId,
    ).toBe(jobId);
    if (claimed) {
      const sources = await loadIdeaSources(claimed);
      expect(sources).toBeNull();
      expect(
        await completeIdeaJob(
          claimed,
          createMockIdeas([
            {
              id: first.id,
              title: "旧来源",
              version: 1,
              summary: "旧摘要",
              angle: "角度",
              claim: "观点",
            },
          ]),
          1,
        ),
      ).toBe("stale");
    }
    expect(
      await getDb().select().from(ideas).where(eq(ideas.jobId, jobId)),
    ).toHaveLength(0);
    expect((await generate(owner, [first, second])).status).toBe(409);
    const newest = await material(owner, "删除中的来源");
    const newJob = await generate(owner, [first, newest]);
    const newJobId = ((await newJob.json()) as { jobId: string }).jobId;
    expect(
      (
        await app.request(`/api/materials/${newest.id}`, {
          method: "DELETE",
          headers: { cookie: owner, origin },
        })
      ).status,
    ).toBe(204);
    expect(
      await getDb().select().from(aiJobs).where(eq(aiJobs.id, newJobId)),
    ).toHaveLength(0);
  });
});
