import { randomUUID } from "node:crypto";
import { rateLimit, user } from "@content-write/db/auth-schema";
import { getDb, getPool } from "@content-write/db/client";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createMockAnalysis } from "../../../worker/src/analysis";
import { createMockDraft } from "../../../worker/src/draft";
import {
  completeDraftJob,
  loadDraftContext,
} from "../../../worker/src/draft-jobs";
import { claimJob, processOneJob } from "../../../worker/src/jobs";
import { app } from "../../src/app";
import { auth } from "../../src/modules/identity/auth";

const suffix = randomUUID();
const password = `integration-${suffix}`;
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const users: string[] = [];
const priorMode = process.env.AI_MODE;
process.env.AI_MODE = "mock";

type Draft = {
  id: string;
  title: string;
  markdown: string;
  sourceMap: { materialId: string; materialVersion: number }[];
};
type Detail = {
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

function write(
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

async function failure(response: Response) {
  return {
    status: response.status,
    ...((await response.json()) as { error: object }).error,
  };
}

async function detail(cookie: string, articleId: string) {
  const response = await app.request(`/api/articles/${articleId}`, {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Detail;
}

async function finish(jobId: string) {
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
async function confirmedArticle(cookie: string) {
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

async function confirm(cookie: string, articleId: string) {
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

async function generate(cookie: string, articleId: string, version: number) {
  const started = await write(
    cookie,
    `/articles/${articleId}/draft/generate`,
    { expectedVersion: version },
    { key: randomUUID() },
  );
  expect(started.status).toBe(202);
  return ((await started.json()) as { jobId: string }).jobId;
}

describe("article drafts", () => {
  afterAll(async () => {
    if (priorMode === undefined) delete process.env.AI_MODE;
    else process.env.AI_MODE = priorMode;
    for (const id of users) await getDb().delete(user).where(eq(user.id, id));
    await getPool().end();
  });

  it("generates a sourced draft only from a confirmed outline", async () => {
    const owner = await signIn("draft-owner");
    const other = await signIn("draft-other");
    const { articleId } = await confirmedArticle(owner);
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/draft/generate`,
          { expectedVersion: 2 },
          { key: randomUUID() },
        ),
      ),
    ).toMatchObject({ status: 422, code: "OUTLINE_NOT_CONFIRMED" });
    const version = await confirm(owner, articleId);
    expect(
      (
        await write(
          other,
          `/articles/${articleId}/draft/generate`,
          { expectedVersion: version },
          { key: randomUUID() },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/draft/generate`,
          { expectedVersion: version },
          { key: randomUUID(), source: "https://untrusted.example" },
        )
      ).status,
    ).toBe(403);
    expect(
      await failure(
        await write(owner, `/articles/${articleId}/draft/generate`, {
          expectedVersion: version,
        }),
      ),
    ).toMatchObject({ status: 422, code: "INVALID_IDEMPOTENCY_KEY" });

    const key = randomUUID();
    const started = await write(
      owner,
      `/articles/${articleId}/draft/generate`,
      { expectedVersion: version },
      { key },
    );
    expect(started.status).toBe(202);
    const jobId = ((await started.json()) as { jobId: string }).jobId;
    const repeated = await write(
      owner,
      `/articles/${articleId}/draft/generate`,
      { expectedVersion: version },
      { key },
    );
    expect(((await repeated.json()) as { jobId: string }).jobId).toBe(jobId);
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/draft/generate`,
          { expectedVersion: version + 5 },
          { key },
        ),
      ),
    ).toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/draft/generate`,
          { expectedVersion: version },
          { key: randomUUID() },
        ),
      ),
    ).toMatchObject({ status: 409, code: "DRAFT_JOB_ACTIVE" });

    await finish(jobId);
    const { article, latestDraftJob } = await detail(owner, articleId);
    expect(latestDraftJob).toMatchObject({ id: jobId, status: "succeeded" });
    expect(article.version).toBe(version + 1);
    expect(article.title).toBeTruthy();
    expect(article.body).toContain("## ");
    expect(article.currentDraft?.mode).toBe("mock");
    expect(article.currentDraft?.sourceMap.length).toBeGreaterThan(0);
    expect(
      article.currentDraft?.sourceMap.every(
        (entry) => entry.materialVersion === 1,
      ),
    ).toBe(true);
    expect(article.candidates).toEqual([]);
    expect(
      (
        await app.request(`/api/articles/${articleId}`, {
          headers: { cookie: other },
        })
      ).status,
    ).toBe(404);
  });

  it("keeps an existing body; regenerated drafts wait as candidates", async () => {
    const owner = await signIn("draft-candidate");
    const other = await signIn("draft-candidate-other");
    const { articleId } = await confirmedArticle(owner);
    const confirmedVersion = await confirm(owner, articleId);
    await finish(await generate(owner, articleId, confirmedVersion));
    const first = (await detail(owner, articleId)).article;

    await finish(await generate(owner, articleId, first.version));
    const withCandidate = (await detail(owner, articleId)).article;
    expect(withCandidate.version).toBe(first.version);
    expect(withCandidate.body).toBe(first.body);
    expect(withCandidate.candidates).toHaveLength(1);
    const candidate = withCandidate.candidates[0];

    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/drafts/${candidate.id}/apply`,
          { expectedVersion: first.version + 5 },
        ),
      ),
    ).toMatchObject({ status: 409, code: "ARTICLE_VERSION_CONFLICT" });
    expect(
      (
        await write(
          other,
          `/articles/${articleId}/drafts/${candidate.id}/apply`,
          {
            expectedVersion: first.version,
          },
        )
      ).status,
    ).toBe(404);
    const applied = await write(
      owner,
      `/articles/${articleId}/drafts/${candidate.id}/apply`,
      { expectedVersion: first.version },
    );
    expect(applied.status).toBe(200);
    const afterApply = (await detail(owner, articleId)).article;
    expect(afterApply.version).toBe(first.version + 1);
    expect(afterApply.currentDraft?.id).toBe(candidate.id);
    expect(afterApply.body).toBe(candidate.markdown);
    expect(afterApply.candidates).toEqual([]);
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/drafts/${candidate.id}/apply`,
          {
            expectedVersion: afterApply.version,
          },
        ),
      ),
    ).toMatchObject({ status: 409, code: "DRAFT_NOT_CANDIDATE" });

    await finish(await generate(owner, articleId, afterApply.version));
    const next = (await detail(owner, articleId)).article.candidates[0];
    expect(
      (
        await write(
          other,
          `/articles/${articleId}/drafts/${next.id}/discard`,
          {},
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/drafts/${next.id}/discard`,
          {},
        )
      ).status,
    ).toBe(204);
    const afterDiscard = (await detail(owner, articleId)).article;
    expect(afterDiscard.candidates).toEqual([]);
    expect(afterDiscard.version).toBe(afterApply.version);
    expect(afterDiscard.body).toBe(afterApply.body);
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/drafts/${next.id}/discard`,
          {},
        ),
      ),
    ).toMatchObject({ status: 409, code: "DRAFT_NOT_CANDIDATE" });
  });

  it("drops a claimed draft when the outline is edited and re-confirmed", async () => {
    const owner = await signIn("draft-stale");
    const { articleId } = await confirmedArticle(owner);
    const version = await confirm(owner, articleId);
    const jobId = await generate(owner, articleId, version);
    let claimed = await claimJob();
    while (claimed && claimed.id !== jobId) {
      await processOneJob();
      claimed = await claimJob();
    }
    expect(claimed?.id).toBe(jobId);
    if (!claimed) return;
    const context = await loadDraftContext(claimed);
    if (!context) throw new Error("Expected draft context");

    const current = (await detail(owner, articleId)).article;
    const edited = structuredClone(current.outline) as {
      sections: { heading: string }[];
    };
    edited.sections[0].heading = "作者改过的小节";
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/outline`,
          { expectedVersion: current.version, outline: edited },
          { method: "PUT" },
        )
      ).status,
    ).toBe(200);
    await confirm(owner, articleId);

    expect(await completeDraftJob(claimed, createMockDraft(context), 1)).toBe(
      "stale",
    );
    const after = (await detail(owner, articleId)).article;
    expect(after.body).toBeNull();
    expect(after.candidates).toEqual([]);
  });

  it("removes drafts with the article when a source material is deleted", async () => {
    const owner = await signIn("draft-delete");
    const { articleId, materialId } = await confirmedArticle(owner);
    await finish(
      await generate(owner, articleId, await confirm(owner, articleId)),
    );
    expect(
      (
        await app.request(`/api/materials/${materialId}`, {
          method: "DELETE",
          headers: { cookie: owner, origin },
        })
      ).status,
    ).toBe(204);
    const remaining = await getPool().query(
      "SELECT 1 FROM article_drafts WHERE article_id = $1",
      [articleId],
    );
    expect(remaining.rowCount).toBe(0);
  });
});
