import { randomUUID } from "node:crypto";
import { getDb } from "@content-write/db/client";
import { readMemories, selectMemories } from "@content-write/db/memories";
import { aiJobs, memories } from "@content-write/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { processOneJob } from "../../../worker/src/jobs";
import { app } from "../../src/app";
import {
  cleanup,
  confirm,
  confirmedArticle,
  failure,
  finish,
  signIn,
  write,
} from "./helpers";

afterAll(cleanup);
type Memory = {
  id: string;
  content: string;
  status: string;
  origin: string;
  evidence: { sampleId: string; quote: string; start: number; end: number }[];
  mode: string | null;
  jobId: string | null;
  version: number;
};
type Payload = {
  memories: Memory[];
  latestJob: { id: string; status: string } | null;
  extraction: { available: boolean; mode: string | null };
};
async function list(cookie: string) {
  const response = await app.request("/api/memories", { headers: { cookie } });
  expect(response.status).toBe(200);
  return (await response.json()) as Payload;
}
async function add(cookie: string, content = "段落多用短句") {
  const response = await write(cookie, "/memories", { content });
  expect(response.status).toBe(201);
  const payload = (await response.json()) as Payload;
  return payload.memories.find(
    (memory) => memory.content === content,
  ) as Memory;
}
const change = (cookie: string, id: string, body: object) =>
  write(cookie, `/memories/${id}`, body, { method: "PATCH" });
const remove = (cookie: string, id: string) =>
  write(cookie, `/memories/${id}`, {}, { method: "DELETE" });
const extract = (cookie: string, key = randomUUID()) =>
  write(cookie, "/memories/extract", {}, { key });
async function addSample(cookie: string, title: string, content: string) {
  const response = await write(cookie, "/writing-samples", { title, content });
  expect(response.status).toBe(201);
  return ((await response.json()) as { sample: { id: string } }).sample.id;
}
async function ownerId(cookie: string) {
  const response = await app.request("/api/me", { headers: { cookie } });
  return ((await response.json()) as { user: { id: string } }).user.id;
}

it("owns memories, versions every change and rejects cross-user access", async () => {
  const owner = await signIn("memories-owner");
  const other = await signIn("memories-other");
  expect((await app.request("/api/memories")).status).toBe(401);
  const memory = await add(owner);
  expect(memory).toMatchObject({
    status: "confirmed",
    origin: "manual",
    evidence: [],
    version: 1,
  });
  expect((await list(other)).memories).toEqual([]);
  expect(
    (await change(other, memory.id, { expectedVersion: 1, status: "disabled" }))
      .status,
  ).toBe(404);
  expect((await remove(other, memory.id)).status).toBe(404);
  expect(
    (
      await change(owner, memory.id, {
        expectedVersion: 1,
        content: "开头先给结论",
      })
    ).status,
  ).toBe(200);
  expect(
    (await change(owner, memory.id, { expectedVersion: 2, status: "disabled" }))
      .status,
  ).toBe(200);
  // Setting the current state again is not a new version.
  expect(
    (await change(owner, memory.id, { expectedVersion: 3, status: "disabled" }))
      .status,
  ).toBe(200);
  expect((await list(owner)).memories[0]).toMatchObject({
    content: "开头先给结论",
    status: "disabled",
    version: 3,
  });
  expect(
    await failure(
      await change(owner, memory.id, {
        expectedVersion: 2,
        status: "confirmed",
      }),
    ),
  ).toMatchObject({ status: 409, code: "MEMORY_VERSION_CONFLICT" });
  expect((await remove(owner, memory.id)).status).toBe(204);
  expect((await list(owner)).memories).toEqual([]);
  expect((await remove(owner, memory.id)).status).toBe(404);
});

it("validates input, origin, body size and the concurrent count limit", async () => {
  const owner = await signIn("memories-boundaries");
  for (const body of [
    { content: " " },
    { content: "字".repeat(201) },
    { content: "x", userId: "other" },
  ])
    expect((await write(owner, "/memories", body)).status).toBe(422);
  const memory = await add(owner);
  for (const body of [
    { expectedVersion: 1, status: "candidate" },
    { expectedVersion: 1, content: "x", status: "disabled" },
    { expectedVersion: 0, content: "x" },
    { content: "x" },
  ])
    expect((await change(owner, memory.id, body)).status).toBe(422);
  expect(
    (await write(owner, "/memories", { content: "x".repeat(5000) })).status,
  ).toBe(413);
  expect(
    (
      await write(
        owner,
        "/memories",
        { content: "x" },
        {
          source: "https://untrusted.example",
        },
      )
    ).status,
  ).toBe(403);
  await Promise.all(
    Array.from({ length: 48 }, (_, i) => add(owner, `偏好 ${i}`)),
  );
  const last = await Promise.all([
    write(owner, "/memories", { content: "最后一条 A" }),
    write(owner, "/memories", { content: "最后一条 B" }),
  ]);
  expect(last.map((response) => response.status).sort()).toEqual([201, 409]);
  expect((await list(owner)).memories).toHaveLength(50);
  expect(await failure(await extract(owner))).toMatchObject({
    status: 422,
    code: "SAMPLES_REQUIRED",
  });
  await addSample(owner, "旧文", "我习惯用短句开头。");
  expect(await failure(await extract(owner))).toMatchObject({
    status: 409,
    code: "MEMORY_LIMIT",
  });
});

it("extracts evidence-backed candidates that stay out of context until confirmed", async () => {
  const owner = await signIn("memories-extract");
  const userId = await ownerId(owner);
  expect(await failure(await extract(owner))).toMatchObject({
    status: 422,
    code: "SAMPLES_REQUIRED",
  });
  expect((await write(owner, "/memories/extract", {})).status).toBe(422);
  await addSample(owner, "旧文一", "我习惯用短句开头。然后讲一个场景。");
  await addSample(owner, "旧文二", "结尾不喊口号。只留一个问题。");
  const key = randomUUID();
  const started = await extract(owner, key);
  expect(started.status).toBe(202);
  const { jobId } = (await started.json()) as { jobId: string };
  const again = await extract(owner, key);
  expect(((await again.json()) as { jobId: string }).jobId).toBe(jobId);
  expect(await failure(await extract(owner))).toMatchObject({
    status: 409,
    code: "MEMORY_JOB_ACTIVE",
  });
  expect((await list(owner)).latestJob).toMatchObject({ id: jobId });
  await finish(jobId);
  const { memories: found, latestJob } = await list(owner);
  expect(latestJob).toMatchObject({ id: jobId, status: "succeeded" });
  expect(found).toHaveLength(2);
  for (const memory of found) {
    expect(memory).toMatchObject({
      status: "candidate",
      origin: "extracted",
      mode: "mock",
      jobId,
    });
    expect(memory.evidence).toHaveLength(1);
  }
  expect(found.map((memory) => memory.evidence[0].quote).sort()).toEqual([
    "我习惯用短句开头。",
    "结尾不喊口号。",
  ]);
  expect(await selectMemories(getDb(), userId)).toEqual([]);
  // A second run finds the same preferences and does not repeat them.
  const repeat = await extract(owner);
  await finish(((await repeat.json()) as { jobId: string }).jobId);
  expect((await list(owner)).memories).toHaveLength(2);
  const [candidate] = found;
  expect(
    (
      await change(owner, candidate.id, {
        expectedVersion: 1,
        status: "confirmed",
      })
    ).status,
  ).toBe(200);
  expect(await selectMemories(getDb(), userId)).toEqual([
    { id: candidate.id, version: 2 },
  ]);
});

it("marks extraction stale when its samples were disabled before it ran", async () => {
  const owner = await signIn("memories-stale");
  const sampleId = await addSample(owner, "旧文", "我习惯用短句开头。");
  const started = await extract(owner);
  const { jobId } = (await started.json()) as { jobId: string };
  expect(
    (
      await write(
        owner,
        `/writing-samples/${sampleId}`,
        { expectedVersion: 1, enabled: false },
        { method: "PATCH" },
      )
    ).status,
  ).toBe(200);
  await processOneJob();
  const [job] = await getDb()
    .select({ status: aiJobs.status, errorCode: aiJobs.errorCode })
    .from(aiJobs)
    .where(eq(aiJobs.id, jobId));
  expect(job).toEqual({ status: "stale", errorCode: "SAMPLES_CHANGED" });
  expect((await list(owner)).memories).toEqual([]);
});

it("reports an unconfigured model service", async () => {
  const owner = await signIn("memories-unconfigured");
  await addSample(owner, "旧文", "我习惯用短句开头。");
  const mode = process.env.AI_MODE;
  delete process.env.AI_MODE;
  try {
    expect((await list(owner)).extraction).toEqual({
      available: false,
      mode: null,
    });
    expect(await failure(await extract(owner))).toMatchObject({
      status: 503,
      code: "AI_NOT_CONFIGURED",
    });
  } finally {
    process.env.AI_MODE = mode;
  }
});

it("records confirmed memory versions on generation jobs and excludes changed ones", async () => {
  const owner = await signIn("memories-context");
  const userId = await ownerId(owner);
  const { articleId } = await confirmedArticle(owner);
  const first = await add(owner, "开头先给结论");
  const second = await add(owner, "少用感叹号");
  const third = await add(owner, "多用具体场景");
  await getDb().insert(memories).values({
    id: randomUUID(),
    userId,
    content: "未确认的候选",
    status: "candidate",
    origin: "extracted",
  });
  const refs = await selectMemories(getDb(), userId);
  expect(refs).toEqual(
    [third, second, first].map((memory) => ({ id: memory.id, version: 1 })),
  );
  const version = await confirm(owner, articleId);
  const key = randomUUID();
  const response = await write(
    owner,
    `/articles/${articleId}/draft/generate`,
    { expectedVersion: version },
    { key },
  );
  expect(response.status).toBe(202);
  const { jobId } = (await response.json()) as { jobId: string };
  const [job] = await getDb().select().from(aiJobs).where(eq(aiJobs.id, jobId));
  expect(job.memories).toEqual(refs);
  await change(owner, first.id, { expectedVersion: 1, status: "disabled" });
  await change(owner, second.id, { expectedVersion: 1, content: "不用感叹号" });
  expect(
    (await readMemories(getDb(), userId, job.memories)).map((row) => row.id),
  ).toEqual([third.id]);
  await change(owner, first.id, { expectedVersion: 2, status: "confirmed" });
  expect(
    (await readMemories(getDb(), userId, job.memories)).map((row) => row.id),
  ).toEqual([third.id]);
  expect(await readMemories(getDb(), "other-user", job.memories)).toEqual([]);
  expect(
    await failure(
      await write(
        owner,
        `/articles/${articleId}/draft/generate`,
        { expectedVersion: version },
        { key },
      ),
    ),
  ).toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
});
