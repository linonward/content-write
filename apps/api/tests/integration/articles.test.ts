import { randomUUID } from "node:crypto";
import { rateLimit, user } from "@content-write/db/auth-schema";
import { getDb, getPool } from "@content-write/db/client";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createMockAnalysis } from "../../../worker/src/analysis";
import { claimJob, processOneJob } from "../../../worker/src/jobs";
import { createMockOutline } from "../../../worker/src/outline";
import {
  completeOutlineJob,
  loadOutlineContext,
} from "../../../worker/src/outline-jobs";
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

function write(
  cookie: string,
  path: string,
  body: unknown,
  method = "POST",
  source = origin,
  key?: string,
) {
  return app.request(`/api${path}`, {
    method,
    headers: {
      cookie,
      origin: source,
      "content-type": "application/json",
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function makeIdea(cookie: string) {
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
  const generated = await write(
    cookie,
    "/ideas/generate",
    { sources: [{ id: materialId, version: 1 }] },
    "POST",
    origin,
    randomUUID(),
  );
  expect(generated.status).toBe(202);
  const jobId = ((await generated.json()) as { jobId: string }).jobId;
  for (let attempt = 0; attempt < 10; attempt++) {
    const state = await getPool().query<{ status: string }>(
      "SELECT status FROM ai_jobs WHERE id = $1",
      [jobId],
    );
    if (state.rows[0]?.status === "succeeded") break;
    await processOneJob();
  }
  const listed = await app.request("/api/ideas", { headers: { cookie } });
  const ideas = ((await listed.json()) as { ideas: { id: string }[] }).ideas;
  expect(ideas.length).toBeGreaterThan(0);
  return { ideaId: ideas[0].id, materialId };
}

async function makeArticle(cookie: string) {
  const source = await makeIdea(cookie);
  const created = await write(cookie, "/articles", { ideaId: source.ideaId });
  expect(created.status).toBe(201);
  const articleId = ((await created.json()) as { articleId: string }).articleId;
  return { ...source, articleId };
}

describe("article brief and outline", () => {
  afterAll(async () => {
    if (priorMode === undefined) delete process.env.AI_MODE;
    else process.env.AI_MODE = priorMode;
    for (const id of users) await getDb().delete(user).where(eq(user.id, id));
    await getPool().end();
  });

  it("creates one owned article from a current idea and protects writes", async () => {
    const owner = await signIn("article-owner");
    const other = await signIn("article-other");
    const { ideaId, articleId } = await makeArticle(owner);
    expect((await write(owner, "/articles", { ideaId })).status).toBe(200);
    expect((await write(other, "/articles", { ideaId })).status).toBe(404);
    expect(
      (
        await app.request(`/api/articles/${articleId}`, {
          headers: { cookie: other },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/brief`,
          {
            expectedVersion: 1,
            workingTitle: "无效",
            audience: "读者",
            thesis: "观点",
          },
          "PATCH",
          "https://untrusted.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await write(
          other,
          `/articles/${articleId}/brief`,
          {
            expectedVersion: 1,
            workingTitle: "无效",
            audience: "读者",
            thesis: "观点",
          },
          "PATCH",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/brief`,
          {
            expectedVersion: 1,
            workingTitle: "改进标题",
            audience: "读者",
            thesis: "观点",
          },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/brief`,
          {
            expectedVersion: 1,
            workingTitle: "旧修改",
            audience: "读者",
            thesis: "观点",
          },
          "PATCH",
        )
      ).status,
    ).toBe(409);
  });

  it("generates, edits and confirms a sourced outline; edits revoke confirmation", async () => {
    const owner = await signIn("outline-flow");
    const other = await signIn("outline-other");
    const { articleId } = await makeArticle(owner);
    expect(
      (
        await write(owner, `/articles/${articleId}/outline/confirm`, {
          expectedVersion: 1,
        })
      ).status,
    ).toBe(422);
    const key = randomUUID();
    const generated = await write(
      owner,
      `/articles/${articleId}/outline/generate`,
      { expectedVersion: 1 },
      "POST",
      origin,
      key,
    );
    expect(generated.status).toBe(202);
    const jobId = ((await generated.json()) as { jobId: string }).jobId;
    expect(
      (
        (await (
          await write(
            owner,
            `/articles/${articleId}/outline/generate`,
            { expectedVersion: 1 },
            "POST",
            origin,
            key,
          )
        ).json()) as { jobId: string }
      ).jobId,
    ).toBe(jobId);
    expect(
      (
        await write(
          other,
          `/articles/${articleId}/outline/generate`,
          { expectedVersion: 1 },
          "POST",
          origin,
          randomUUID(),
        )
      ).status,
    ).toBe(404);
    for (let attempt = 0; attempt < 10; attempt++) {
      const state = await getPool().query<{ status: string }>(
        "SELECT status FROM ai_jobs WHERE id = $1",
        [jobId],
      );
      if (state.rows[0]?.status === "succeeded") break;
      await processOneJob();
    }
    const fetched = await app.request(`/api/articles/${articleId}`, {
      headers: { cookie: owner },
    });
    const article = (
      (await fetched.json()) as {
        article: {
          version: number;
          outline: { sections: { evidenceIds: string[]; heading: string }[] };
          outlineConfirmedAt: string | null;
        };
      }
    ).article;
    expect(article.version).toBe(2);
    expect(article.outline.sections.length).toBeGreaterThanOrEqual(2);
    expect(
      article.outline.sections.flatMap((section) => section.evidenceIds).length,
    ).toBeGreaterThan(0);
    expect(article.outlineConfirmedAt).toBeNull();
    expect(
      (
        (await (
          await write(
            owner,
            `/articles/${articleId}/outline/generate`,
            { expectedVersion: 1 },
            "POST",
            origin,
            key,
          )
        ).json()) as { jobId: string }
      ).jobId,
    ).toBe(jobId);
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/outline`,
          { expectedVersion: 1, outline: article.outline },
          "PUT",
        )
      ).status,
    ).toBe(409);
    const invalid = structuredClone(article.outline);
    invalid.sections[0].evidenceIds = ["fake:span"];
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/outline`,
          { expectedVersion: 2, outline: invalid },
          "PUT",
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await write(
          other,
          `/articles/${articleId}/outline`,
          { expectedVersion: 2, outline: article.outline },
          "PUT",
        )
      ).status,
    ).toBe(404);
    const confirmed = await write(
      owner,
      `/articles/${articleId}/outline/confirm`,
      { expectedVersion: 2 },
    );
    expect(confirmed.status).toBe(200);
    const edited = structuredClone(article.outline);
    edited.sections[0].heading = "作者修改的小节";
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/outline`,
          { expectedVersion: 3, outline: edited },
          "PUT",
        )
      ).status,
    ).toBe(200);
    const after = (
      (await (
        await app.request(`/api/articles/${articleId}`, {
          headers: { cookie: owner },
        })
      ).json()) as {
        article: {
          outlineConfirmedAt: string | null;
          outline: { sections: { heading: string }[] };
        };
      }
    ).article;
    expect(after.outlineConfirmedAt).toBeNull();
    expect(after.outline.sections[0].heading).toBe("作者修改的小节");
  });

  it("keeps the article's source revision after the material is edited", async () => {
    const owner = await signIn("outline-pinned");
    const { articleId, materialId } = await makeArticle(owner);
    const changed = await write(
      owner,
      `/materials/${materialId}`,
      {
        title: "素材新版本",
        content: "新版本正文",
        expectedVersion: 1,
      },
      "PATCH",
    );
    expect(changed.status).toBe(200);
    const started = await write(
      owner,
      `/articles/${articleId}/outline/generate`,
      { expectedVersion: 1 },
      "POST",
      origin,
      randomUUID(),
    );
    expect(started.status).toBe(202);
    const jobId = ((await started.json()) as { jobId: string }).jobId;
    for (let attempt = 0; attempt < 10; attempt++) {
      const state = await getPool().query<{ status: string }>(
        "SELECT status FROM ai_jobs WHERE id = $1",
        [jobId],
      );
      if (state.rows[0]?.status === "succeeded") break;
      await processOneJob();
    }
    const detail = (
      (await (
        await app.request(`/api/articles/${articleId}`, {
          headers: { cookie: owner },
        })
      ).json()) as {
        article: {
          outline: unknown;
          sources: { materialVersion: number; title: string }[];
        };
      }
    ).article;
    expect(detail.outline).not.toBeNull();
    expect(detail.sources[0]).toMatchObject({
      materialVersion: 1,
      title: "文章来源",
    });
  });

  it("does not apply a claimed result after brief changes or source deletion", async () => {
    const owner = await signIn("outline-stale");
    const { articleId, materialId } = await makeArticle(owner);
    const started = await write(
      owner,
      `/articles/${articleId}/outline/generate`,
      { expectedVersion: 1 },
      "POST",
      origin,
      randomUUID(),
    );
    const jobId = ((await started.json()) as { jobId: string }).jobId;
    let claimed = await claimJob();
    while (claimed && claimed.id !== jobId) {
      await processOneJob();
      claimed = await claimJob();
    }
    expect(claimed?.id).toBe(jobId);
    if (!claimed) return;
    const context = await loadOutlineContext(claimed);
    expect(context).not.toBeNull();
    if (!context) throw new Error("Expected outline context");
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/brief`,
          {
            expectedVersion: 1,
            workingTitle: "新版 brief",
            audience: "读者",
            thesis: "新观点",
          },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    expect(
      await completeOutlineJob(
        claimed,
        createMockOutline(context.brief, context.sources),
        1,
      ),
    ).toBe("stale");
    const article = (
      (await (
        await app.request(`/api/articles/${articleId}`, {
          headers: { cookie: owner },
        })
      ).json()) as { article: { outline: unknown } }
    ).article;
    expect(article.outline).toBeNull();
    expect(
      (
        await app.request(`/api/materials/${materialId}`, {
          method: "DELETE",
          headers: { cookie: owner, origin },
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await app.request(`/api/articles/${articleId}`, {
          headers: { cookie: owner },
        })
      ).status,
    ).toBe(404);
    expect(
      (await app.request(`/api/jobs/${jobId}`, { headers: { cookie: owner } }))
        .status,
    ).toBe(404);
  });
});
