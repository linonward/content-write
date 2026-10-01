import { getPool } from "@content-write/db/client";
import { afterAll, describe, expect, it } from "vitest";
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

async function revisions(articleId: string) {
  const result = await getPool().query<{
    version: number;
    source: string;
    title: string;
    body: string;
  }>(
    "SELECT version, source, title, body FROM article_revisions WHERE article_id = $1 ORDER BY version",
    [articleId],
  );
  return result.rows;
}

function save(
  cookie: string,
  articleId: string,
  input: { expectedVersion: number; title: string; body: string },
  source?: string,
) {
  return write(cookie, `/articles/${articleId}/body`, input, {
    method: "PUT",
    source,
  });
}

describe("article body editing", () => {
  afterAll(cleanup);

  it("saves title and body as a new version with history; stale saves never overwrite", async () => {
    const owner = await signIn("body-owner");
    const other = await signIn("body-other");
    const { articleId } = await confirmedArticle(owner);
    await finish(
      await generate(owner, articleId, await confirm(owner, articleId)),
    );
    const drafted = (await detail(owner, articleId)).article;
    expect(await revisions(articleId)).toEqual([
      expect.objectContaining({
        version: drafted.version,
        source: "draft",
        body: drafted.body,
      }),
    ]);

    const edit = {
      expectedVersion: drafted.version,
      title: "作者改过的标题",
      body: "# 新正文\n\n作者自己写的段落。",
    };
    expect((await save(other, articleId, edit)).status).toBe(404);
    expect(
      (await save(owner, articleId, edit, "https://untrusted.example")).status,
    ).toBe(403);
    const saved = await save(owner, articleId, edit);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ version: drafted.version + 1 });
    const after = (await detail(owner, articleId)).article;
    expect(after).toMatchObject({
      version: drafted.version + 1,
      title: edit.title,
      body: edit.body,
    });
    expect((await revisions(articleId)).at(-1)).toEqual({
      version: drafted.version + 1,
      source: "edit",
      title: edit.title,
      body: edit.body,
    });

    expect(
      await failure(
        await save(owner, articleId, {
          ...edit,
          body: "基于旧版本的修改",
        }),
      ),
    ).toMatchObject({ status: 409, code: "ARTICLE_VERSION_CONFLICT" });
    expect((await detail(owner, articleId)).article.body).toBe(edit.body);

    // Saving unchanged text is a no-op: no version bump, no history row.
    const unchanged = await save(owner, articleId, {
      ...edit,
      expectedVersion: drafted.version + 1,
    });
    expect(await unchanged.json()).toEqual({ version: drafted.version + 1 });
    expect(await revisions(articleId)).toHaveLength(2);
  });

  it("rejects oversized or invalid input", async () => {
    const owner = await signIn("body-limits");
    const { articleId } = await confirmedArticle(owner);
    const { version } = (await detail(owner, articleId)).article;
    expect(
      await failure(
        await save(owner, articleId, {
          expectedVersion: version,
          title: "标题",
          body: "字".repeat(50_001),
        }),
      ),
    ).toMatchObject({ status: 413, code: "ARTICLE_BODY_TOO_LARGE" });
    expect(
      await failure(
        await save(owner, articleId, {
          expectedVersion: version,
          title: "题".repeat(201),
          body: "正文",
        }),
      ),
    ).toMatchObject({ status: 422, code: "INVALID_ARTICLE_BODY" });
  });

  it("keeps text written before any draft; a later draft becomes a candidate", async () => {
    const owner = await signIn("body-first");
    const { articleId } = await confirmedArticle(owner);
    const version = await confirm(owner, articleId);
    expect(
      (
        await save(owner, articleId, {
          expectedVersion: version,
          title: "先自己写",
          body: "作者先写的开头。",
        })
      ).status,
    ).toBe(200);
    await finish(await generate(owner, articleId, version + 1));
    const article = (await detail(owner, articleId)).article;
    expect(article.body).toBe("作者先写的开头。");
    expect(article.candidates).toHaveLength(1);

    const applied = await write(
      owner,
      `/articles/${articleId}/drafts/${article.candidates[0].id}/apply`,
      { expectedVersion: article.version },
    );
    expect(applied.status).toBe(200);
    expect((await revisions(articleId)).map((row) => row.source)).toEqual([
      "edit",
      "draft",
    ]);
  });
});
