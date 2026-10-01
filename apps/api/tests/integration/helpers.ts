import { randomUUID } from "node:crypto";
import { rateLimit, user } from "@content-write/db/auth-schema";
import { getDb, getPool } from "@content-write/db/client";
import { eq } from "drizzle-orm";
import { expect } from "vitest";
import { createMockAnalysis } from "../../../worker/src/analysis";
import { processOneJob } from "../../../worker/src/jobs";
import { app } from "../../src/app";
import { auth } from "../../src/modules/identity/auth";

// Shared by article integration tests: real HTTP through the Hono app, real PostgreSQL, mock AI.
const suffix = randomUUID();
const password = `integration-${suffix}`;
export const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const users: string[] = [];
const priorMode = process.env.AI_MODE;
process.env.AI_MODE = "mock";

/** Restores AI_MODE, deletes the users created here and closes the pool. */
export async function cleanup() {
  if (priorMode === undefined) delete process.env.AI_MODE;
  else process.env.AI_MODE = priorMode;
  for (const id of users) await getDb().delete(user).where(eq(user.id, id));
  await getPool().end();
}

export type Draft = {
  id: string;
  title: string;
  markdown: string;
  sourceMap: { materialId: string; materialVersion: number }[];
};
export type Detail = {
  article: {
    version: number;
    title: string | null;
    body: string | null;
    outline: unknown;
    currentDraft: {
      id: string;
      sourceMap: Draft["sourceMap"];
      evidenceGaps: string[];
      mode: string;
    } | null;
    candidates: Draft[];
  };
  latestDraftJob: { id: string; status: string } | null;
};

export async function signIn(label: string) {
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

export function write(
  cookie: string,
  path: string,
  body: unknown,
  options: { key?: string; source?: string; method?: string } = {},
) {
  return app.request(`/api${path}`, {
    method: options.method ?? "POST",
    headers: {
      cookie,
      origin: options.source ?? origin,
      "content-type": "application/json",
      ...(options.key ? { "idempotency-key": options.key } : {}),
    },
    body: JSON.stringify(body),
  });
}

export async function failure(response: Response) {
  return {
    status: response.status,
    ...((await response.json()) as { error: object }).error,
  };
}

export async function detail(cookie: string, articleId: string) {
  const response = await app.request(`/api/articles/${articleId}`, {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Detail;
}

export async function finish(jobId: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const state = await getPool().query<{ status: string }>(
      "SELECT status FROM ai_jobs WHERE id = $1",
      [jobId],
    );
    if (state.rows[0]?.status === "succeeded") return;
    await processOneJob();
  }
  throw new Error(`Job ${jobId} did not succeed`);
}

/** Material → analysis → idea → article → generated and confirmed outline. */
export async function confirmedArticle(cookie: string) {
  const content = "作者在实践中记录了一个需要进一步核对的观点。";
  const source = await write(cookie, "/materials", {
    title: "文章来源",
    content,
  });
  expect(source.status).toBe(201);
  const materialId = ((await source.json()) as { material: { id: string } })
    .material.id;
  await getPool().query(
    "INSERT INTO material_analyses (id, material_id, user_id, material_version, result, mode) SELECT $1,id,user_id,1,$3::jsonb,'mock' FROM materials WHERE id = $2",
    [randomUUID(), materialId, JSON.stringify(createMockAnalysis(content))],
  );
  const ideaJob = await write(
    cookie,
    "/ideas/generate",
    { sources: [{ id: materialId, version: 1 }] },
    { key: randomUUID() },
  );
  expect(ideaJob.status).toBe(202);
  await finish(((await ideaJob.json()) as { jobId: string }).jobId);
  const ideas = (
    (await (
      await app.request("/api/ideas", { headers: { cookie } })
    ).json()) as { ideas: { id: string }[] }
  ).ideas;
  const created = await write(cookie, "/articles", { ideaId: ideas[0].id });
  expect(created.status).toBe(201);
  const articleId = ((await created.json()) as { articleId: string }).articleId;
  const outlineJob = await write(
    cookie,
    `/articles/${articleId}/outline/generate`,
    { expectedVersion: 1 },
    { key: randomUUID() },
  );
  expect(outlineJob.status).toBe(202);
  await finish(((await outlineJob.json()) as { jobId: string }).jobId);
  return { articleId, materialId };
}

export async function confirm(cookie: string, articleId: string) {
  const { article } = await detail(cookie, articleId);
  const confirmed = await write(
    cookie,
    `/articles/${articleId}/outline/confirm`,
    {
      expectedVersion: article.version,
    },
  );
  expect(confirmed.status).toBe(200);
  return ((await confirmed.json()) as { version: number }).version;
}

export async function generate(
  cookie: string,
  articleId: string,
  version: number,
) {
  const started = await write(
    cookie,
    `/articles/${articleId}/draft/generate`,
    { expectedVersion: version },
    { key: randomUUID() },
  );
  expect(started.status).toBe(202);
  return ((await started.json()) as { jobId: string }).jobId;
}
