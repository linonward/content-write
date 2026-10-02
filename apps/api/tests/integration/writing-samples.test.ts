import { randomUUID } from "node:crypto";
import { getDb } from "@content-write/db/client";
import { aiJobs, writingSamples } from "@content-write/db/schema";
import {
  readWritingSamples,
  selectWritingSamples,
} from "@content-write/db/writing-samples";
import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { app } from "../../src/app";
import {
  cleanup,
  confirm,
  confirmedArticle,
  failure,
  signIn,
  write,
} from "./helpers";

afterAll(cleanup);
type Sample = {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  version: number;
};
const input = {
  title: "我的旧文章",
  content: "这是我过去写的文章，短句表达自己的观点。",
};
async function add(cookie: string, body = input) {
  const response = await write(cookie, "/writing-samples", body);
  expect(response.status).toBe(201);
  return ((await response.json()) as { sample: Sample }).sample;
}
const toggle = (
  cookie: string,
  id: string,
  expectedVersion: number,
  enabled: boolean,
) =>
  write(
    cookie,
    `/writing-samples/${id}`,
    { expectedVersion, enabled },
    { method: "PATCH" },
  );
const remove = (cookie: string, id: string) =>
  write(cookie, `/writing-samples/${id}`, {}, { method: "DELETE" });
async function list(cookie: string) {
  const response = await app.request("/api/writing-samples", {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { samples: Sample[] }).samples;
}
it("owns samples, persists content and rejects cross-user changes", async () => {
  const owner = await signIn("samples-owner");
  const other = await signIn("samples-other");
  expect((await app.request("/api/writing-samples")).status).toBe(401);
  const sample = await add(owner);
  expect(await list(owner)).toEqual([sample]);
  expect(await list(other)).toEqual([]);
  expect((await toggle(other, sample.id, 1, false)).status).toBe(404);
  expect((await remove(other, sample.id)).status).toBe(404);
  expect((await toggle(owner, sample.id, 1, false)).status).toBe(200);
  expect((await list(owner))[0]).toMatchObject({
    ...input,
    enabled: false,
    version: 2,
  });
  expect(await failure(await toggle(owner, sample.id, 1, true))).toMatchObject({
    status: 409,
    code: "SAMPLE_VERSION_CONFLICT",
  });
  expect((await toggle(owner, sample.id, 2, true)).status).toBe(200);
  expect((await remove(owner, sample.id)).status).toBe(204);
  expect(await list(owner)).toEqual([]);
  expect((await remove(owner, sample.id)).status).toBe(404);
});
it("validates input, origin, body bounds and concurrent count limit", async () => {
  const owner = await signIn("samples-boundaries");
  for (const body of [
    { ...input, title: " " },
    { ...input, content: " " },
    { ...input, title: "字".repeat(201) },
    { ...input, content: "字".repeat(20001) },
    { ...input, userId: "other" },
  ]) {
    expect((await write(owner, "/writing-samples", body)).status).toBe(422);
  }
  expect(
    (
      await write(owner, "/writing-samples", {
        ...input,
        content: "x".repeat(128001),
      })
    ).status,
  ).toBe(413);
  expect(
    (
      await write(owner, "/writing-samples", input, {
        source: "https://untrusted.example",
      })
    ).status,
  ).toBe(403);
  await Promise.all(Array.from({ length: 19 }, () => add(owner)));
  const last = await Promise.all([
    write(owner, "/writing-samples", input),
    write(owner, "/writing-samples", input),
  ]);
  expect(last.map((response) => response.status).sort()).toEqual([201, 409]);
  expect(await list(owner)).toHaveLength(20);
});
it("records a bounded selection, excludes disabled/deleted/changed versions and isolates reads", async () => {
  const owner = await signIn("samples-context");
  const { articleId } = await confirmedArticle(owner);
  const before = await getDb()
    .select({ samples: aiJobs.writingSamples })
    .from(aiJobs)
    .where(eq(aiJobs.articleId, articleId));
  expect(before.every((job) => job.samples.length === 0)).toBe(true);
  const samples: Sample[] = [];
  for (let i = 0; i < 4; i++)
    samples.push(
      await add(owner, {
        title: `文章 ${i}`,
        content: "风格样本。".repeat(700),
      }),
    );
  const [stored] = await getDb()
    .select()
    .from(writingSamples)
    .where(eq(writingSamples.id, samples[0].id));
  const refs = await selectWritingSamples(getDb(), stored.userId);
  expect(refs.map((ref) => ref.id)).toEqual(
    samples
      .slice(1)
      .reverse()
      .map((sample) => sample.id),
  );
  const context = await readWritingSamples(getDb(), stored.userId, refs);
  expect(context).toHaveLength(3);
  expect(context.every((sample) => sample.content.length === 2000)).toBe(true);
  expect(await readWritingSamples(getDb(), "other-user", refs)).toEqual([]);
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
  expect(job.writingSamples).toEqual(refs);
  const repeat = await write(
    owner,
    `/articles/${articleId}/draft/generate`,
    { expectedVersion: version },
    { key },
  );
  expect(repeat.status).toBe(202);
  expect(((await repeat.json()) as { jobId: string }).jobId).toBe(jobId);
  await toggle(owner, refs[0].id, 1, false);
  await remove(owner, refs[1].id);
  expect(
    (await readWritingSamples(getDb(), stored.userId, job.writingSamples)).map(
      (sample) => sample.id,
    ),
  ).toEqual([refs[2].id]);
  await toggle(owner, refs[0].id, 2, true);
  expect(
    (await readWritingSamples(getDb(), stored.userId, job.writingSamples)).map(
      (sample) => sample.id,
    ),
  ).toEqual([refs[2].id]);
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
it("serializes concurrent state changes so only one version wins", async () => {
  const owner = await signIn("samples-race");
  const sample = await add(owner);
  const changes = await Promise.all([
    toggle(owner, sample.id, 1, false),
    toggle(owner, sample.id, 1, false),
  ]);
  expect(changes.map((response) => response.status).sort()).toEqual([200, 409]);
});
