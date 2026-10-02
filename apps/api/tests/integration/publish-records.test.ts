import { getPool } from "@content-write/db/client";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import {
  cleanup,
  confirm,
  confirmedArticle,
  detail,
  failure,
  finish,
  generate,
  origin,
  signIn,
  write,
} from "./helpers";

type Record = {
  id: string;
  url: string;
  publishedAt: string;
  articleVersion: number;
  createdAt: string;
};
type Listing = {
  articleVersion: number;
  hasBody: boolean;
  records: Record[];
};

/** An article whose first draft became the body. */
async function articleWithBody(cookie: string) {
  const { articleId, materialId } = await confirmedArticle(cookie);
  await finish(
    await generate(cookie, articleId, await confirm(cookie, articleId)),
  );
  const { article } = await detail(cookie, articleId);
  return { articleId, materialId, version: article.version };
}

async function listing(cookie: string, articleId: string) {
  const response = await app.request(
    `/api/articles/${articleId}/publish-records`,
    { headers: { cookie } },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Listing;
}

const record = (articleId: string) => `/articles/${articleId}/publish-records`;
const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

describe("publish records", () => {
  afterAll(cleanup);

  it("records a manual publication against the current article version", async () => {
    const owner = await signIn("publish-owner");
    const other = await signIn("publish-other");
    const { articleId, version } = await articleWithBody(owner);
    const input = {
      expectedVersion: version,
      url: "https://mp.weixin.qq.com/s/abc123",
      publishedAt: minutesAgo(30),
    };

    expect(await listing(owner, articleId)).toEqual({
      articleVersion: version,
      hasBody: true,
      records: [],
    });
    expect(
      (
        await app.request(`/api/articles/${articleId}/publish-records`, {
          headers: { cookie: other },
        })
      ).status,
    ).toBe(404);
    expect((await write(other, record(articleId), input)).status).toBe(404);
    expect(
      (
        await write(owner, record(articleId), input, {
          source: "https://untrusted.example",
        })
      ).status,
    ).toBe(403);
    expect(
      await failure(
        await write(owner, record(articleId), {
          ...input,
          expectedVersion: version + 1,
        }),
      ),
    ).toMatchObject({ status: 409, code: "ARTICLE_VERSION_CONFLICT" });

    const created = await write(owner, record(articleId), input);
    expect(created.status).toBe(201);
    const { record: saved } = (await created.json()) as { record: Record };
    expect(saved).toMatchObject({
      url: input.url,
      articleVersion: version,
      publishedAt: input.publishedAt,
    });
    expect(
      await failure(await write(owner, record(articleId), input)),
    ).toMatchObject({ status: 409, code: "PUBLISH_RECORD_EXISTS" });

    const second = await write(owner, record(articleId), {
      ...input,
      url: "https://mp.weixin.qq.com/s/def456",
      publishedAt: minutesAgo(5),
    });
    expect(second.status).toBe(201);
    const listed = await listing(owner, articleId);
    // Newest publication first; recording never changes the article.
    expect(listed.records.map((item) => item.url)).toEqual([
      "https://mp.weixin.qq.com/s/def456",
      input.url,
    ]);
    expect(listed.articleVersion).toBe(version);
    expect((await detail(owner, articleId)).article.version).toBe(version);
  });

  it("validates the link and time and refuses articles without a body", async () => {
    const owner = await signIn("publish-validate");
    const { articleId } = await confirmedArticle(owner);
    const { article } = await detail(owner, articleId);
    const valid = {
      expectedVersion: article.version,
      url: "https://mp.weixin.qq.com/s/xyz",
      publishedAt: minutesAgo(1),
    };
    expect((await listing(owner, articleId)).hasBody).toBe(false);
    expect(
      await failure(await write(owner, record(articleId), valid)),
    ).toMatchObject({ status: 422, code: "ARTICLE_BODY_REQUIRED" });

    const { articleId: withBody, version } = await articleWithBody(owner);
    const base = { ...valid, expectedVersion: version };
    for (const url of [
      "mp.weixin.qq.com/s/xyz",
      "javascript:alert(1)",
      "ftp://example.com/a",
      "https://user:pass@example.com/a",
      `https://example.com/${"a".repeat(2_000)}`,
      "",
    ])
      expect(
        await failure(await write(owner, record(withBody), { ...base, url })),
      ).toMatchObject({ status: 422, code: "INVALID_PUBLISH_RECORD" });
    for (const publishedAt of [
      "",
      "not a date",
      new Date(Date.now() + 60 * 60_000).toISOString(),
    ])
      expect(
        await failure(
          await write(owner, record(withBody), { ...base, publishedAt }),
        ),
      ).toMatchObject({ status: 422, code: "INVALID_PUBLISH_RECORD" });
    // A few minutes ahead is tolerated for device clock drift.
    expect(
      (
        await write(owner, record(withBody), {
          ...base,
          publishedAt: new Date(Date.now() + 3 * 60_000).toISOString(),
        })
      ).status,
    ).toBe(201);
  });

  it("keeps the recorded version when the article changes later", async () => {
    const owner = await signIn("publish-version");
    const { articleId, version } = await articleWithBody(owner);
    await write(owner, record(articleId), {
      expectedVersion: version,
      url: "https://mp.weixin.qq.com/s/v1",
      publishedAt: minutesAgo(10),
    });
    const saved = await write(
      owner,
      `/articles/${articleId}/body`,
      { expectedVersion: version, title: "改过的标题", body: "改过的正文" },
      { method: "PUT" },
    );
    expect(saved.status).toBe(200);
    const listed = await listing(owner, articleId);
    expect(listed.articleVersion).toBe(version + 1);
    expect(listed.records[0].articleVersion).toBe(version);
  });

  it("deletes a record without touching the article; other users cannot", async () => {
    const owner = await signIn("publish-delete");
    const other = await signIn("publish-delete-other");
    const { articleId, version } = await articleWithBody(owner);
    const created = await write(owner, record(articleId), {
      expectedVersion: version,
      url: "https://mp.weixin.qq.com/s/del",
      publishedAt: minutesAgo(10),
    });
    const { record: saved } = (await created.json()) as { record: Record };
    const remove = (cookie: string, source = origin) =>
      app.request(`/api${record(articleId)}/${saved.id}`, {
        method: "DELETE",
        headers: { cookie, origin: source },
      });
    expect((await remove(other)).status).toBe(404);
    expect((await remove(owner, "https://untrusted.example")).status).toBe(403);
    expect((await remove(owner)).status).toBe(204);
    expect(await failure(await remove(owner))).toMatchObject({
      status: 404,
      code: "PUBLISH_RECORD_NOT_FOUND",
    });
    expect((await listing(owner, articleId)).records).toEqual([]);
    expect((await detail(owner, articleId)).article.version).toBe(version);
  });

  it("removes records with the article when a source material is deleted", async () => {
    const owner = await signIn("publish-cascade");
    const { articleId, materialId, version } = await articleWithBody(owner);
    await write(owner, record(articleId), {
      expectedVersion: version,
      url: "https://mp.weixin.qq.com/s/cascade",
      publishedAt: minutesAgo(10),
    });
    const deleted = await app.request(`/api/materials/${materialId}`, {
      method: "DELETE",
      headers: { cookie: owner, origin },
    });
    expect(deleted.status).toBe(204);
    const remaining = await getPool().query(
      "SELECT 1 FROM publish_records WHERE article_id = $1",
      [articleId],
    );
    expect(remaining.rowCount).toBe(0);
  });
});
