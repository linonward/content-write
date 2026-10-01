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
  signIn,
  write,
} from "./helpers";

type Revision = {
  version: number;
  source: string;
  title: string;
  restoredFrom: number | null;
  chars: number;
  createdAt: string;
};

async function list(cookie: string, articleId: string) {
  const response = await app.request(`/api/articles/${articleId}/revisions`, {
    headers: { cookie },
  });
  return {
    status: response.status,
    body: (await response.json()) as { revisions: Revision[] },
  };
}

function save(
  cookie: string,
  articleId: string,
  expectedVersion: number,
  body: string,
) {
  return write(
    cookie,
    `/articles/${articleId}/body`,
    { expectedVersion, title: "标题", body },
    { method: "PUT" },
  );
}

function restore(
  cookie: string,
  articleId: string,
  input: { expectedVersion: number; revision: number },
  source?: string,
) {
  return write(cookie, `/articles/${articleId}/restore`, input, { source });
}

describe("article revisions", () => {
  afterAll(cleanup);

  it("lists, reads and restores history as a new version", async () => {
    const owner = await signIn("revision-owner");
    const other = await signIn("revision-other");
    const { articleId } = await confirmedArticle(owner);
    await finish(
      await generate(owner, articleId, await confirm(owner, articleId)),
    );
    const drafted = (await detail(owner, articleId)).article;
    expect(
      (await save(owner, articleId, drafted.version, "第一次修改")).status,
    ).toBe(200);
    expect(
      (await save(owner, articleId, drafted.version + 1, "第二次修改")).status,
    ).toBe(200);
    const current = drafted.version + 2;

    const listed = await list(owner, articleId);
    expect(listed.status).toBe(200);
    const revisions = listed.body.revisions;
    expect(revisions.map((revision) => revision.version)).toEqual([
      current,
      current - 1,
      drafted.version,
    ]);
    expect(revisions.map((revision) => revision.source)).toEqual([
      "edit",
      "edit",
      "draft",
    ]);
    expect(revisions[0]).toMatchObject({ chars: 5, restoredFrom: null });
    expect(revisions[0]).not.toHaveProperty("body");
    expect((await list(other, articleId)).status).toBe(404);

    const read = await app.request(
      `/api/articles/${articleId}/revisions/${drafted.version}`,
      { headers: { cookie: owner } },
    );
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      revision: {
        version: drafted.version,
        body: drafted.body,
        title: drafted.title,
      },
    });
    expect(
      (
        await app.request(
          `/api/articles/${articleId}/revisions/${drafted.version}`,
          {
            headers: { cookie: other },
          },
        )
      ).status,
    ).toBe(404);
    expect(
      await failure(
        await app.request(`/api/articles/${articleId}/revisions/999`, {
          headers: { cookie: owner },
        }),
      ),
    ).toMatchObject({ status: 404, code: "REVISION_NOT_FOUND" });

    const input = { expectedVersion: current, revision: drafted.version };
    expect((await restore(other, articleId, input)).status).toBe(404);
    expect(
      (await restore(owner, articleId, input, "https://untrusted.example"))
        .status,
    ).toBe(403);
    expect(
      await failure(
        await restore(owner, articleId, { ...input, expectedVersion: 1 }),
      ),
    ).toMatchObject({ status: 409, code: "ARTICLE_VERSION_CONFLICT" });
    expect(
      await failure(
        await restore(owner, articleId, { ...input, revision: 999 }),
      ),
    ).toMatchObject({ status: 404, code: "REVISION_NOT_FOUND" });

    const restored = await restore(owner, articleId, input);
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({ version: current + 1 });
    const after = (await detail(owner, articleId)).article;
    expect(after).toMatchObject({
      version: current + 1,
      title: drafted.title,
      body: drafted.body,
    });
    const history = (await list(owner, articleId)).body.revisions;
    expect(history).toHaveLength(4);
    expect(history[0]).toMatchObject({
      version: current + 1,
      source: "restore",
      restoredFrom: drafted.version,
    });

    // The text from before the restore is still recoverable.
    expect(
      (
        await restore(owner, articleId, {
          expectedVersion: current + 1,
          revision: current,
        })
      ).status,
    ).toBe(200);
    expect((await detail(owner, articleId)).article.body).toBe("第二次修改");

    // Restoring the text the article already has changes nothing.
    const unchanged = await restore(owner, articleId, {
      expectedVersion: current + 2,
      revision: current,
    });
    expect(await unchanged.json()).toEqual({ version: current + 2 });
    expect((await list(owner, articleId)).body.revisions).toHaveLength(5);
  });
});
