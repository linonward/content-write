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

type Preview = {
  articleId: string;
  version: number;
  title: string;
  html: string;
  fileName: string;
};

const get = (cookie: string, path: string, headers: object = {}) =>
  app.request(`/api${path}`, { headers: { cookie, ...headers } });

/** Article with a generated draft, then the given title and body saved over it. */
async function articleWithBody(cookie: string, title: string, body: string) {
  const { articleId } = await confirmedArticle(cookie);
  await finish(
    await generate(cookie, articleId, await confirm(cookie, articleId)),
  );
  const { article } = await detail(cookie, articleId);
  const saved = await write(
    cookie,
    `/articles/${articleId}/body`,
    { expectedVersion: article.version, title, body },
    { method: "PUT" },
  );
  expect(saved.status).toBe(200);
  return {
    articleId,
    version: ((await saved.json()) as { version: number }).version,
  };
}

const unsafeBody = [
  "## 小节",
  "第一段。",
  "- 列表项",
  "> 引用",
  "```js\nconsole.log(1)\n```",
  "---",
  "<script>alert(1)</script>",
  '<iframe src="https://evil.example/frame"></iframe>',
  '段落 <img src=x onerror="alert(2)"> 结束',
  "[坏链接](javascript:alert(3)) [数据](data:text/html,hi)",
  "![配图](https://cdn.example/remote.png)",
].join("\n\n");

describe("article preview and export", () => {
  afterAll(cleanup);

  it("renders the author's article through the sanitized chain for preview, Markdown and HTML", async () => {
    const owner = await signIn("export-owner");
    const title = '离职后的写作陷阱 / "第一周"';
    const { articleId, version } = await articleWithBody(
      owner,
      title,
      unsafeBody,
    );

    const previewResponse = await get(owner, `/articles/${articleId}/preview`);
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.headers.get("cache-control")).toBe("no-store");
    const preview = (await previewResponse.json()) as Preview;
    expect(preview).toMatchObject({
      articleId,
      version,
      title,
      fileName: "离职后的写作陷阱 第一周",
    });
    for (const element of [
      "<h2>小节</h2>",
      "<p>第一段。</p>",
      "<li>列表项</li>",
      "<blockquote>",
      '<code class="language-js">',
      "<hr>",
      '<a href="https://cdn.example/remote.png" class="image-link" rel="noopener noreferrer nofollow">[图片：配图]</a>',
    ])
      expect(preview.html).toContain(element);
    const unsafe = [
      "<script",
      "<iframe",
      "evil.example",
      "onerror",
      "<img",
      "javascript:",
      "data:",
    ];
    for (const marker of unsafe) expect(preview.html).not.toContain(marker);

    const html = await get(owner, `/articles/${articleId}/export?format=html`);
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html.headers.get("content-disposition")).toBe(
      `attachment; filename="article-v${version}.html"; filename*=UTF-8''${encodeURIComponent("离职后的写作陷阱 第一周.html")}`,
    );
    expect(html.headers.get("x-content-type-options")).toBe("nosniff");
    expect(html.headers.get("content-security-policy")).toContain("sandbox");
    expect(html.headers.get("cache-control")).toBe("no-store");
    const documentText = await html.text();
    expect(documentText.startsWith("<!doctype html>")).toBe(true);
    expect(documentText).toContain('<meta charset="utf-8">');
    expect(documentText).toContain("default-src 'none'");
    expect(documentText).toContain(
      "<title>离职后的写作陷阱 / &quot;第一周&quot;</title>",
    );
    // Same fragment as the preview: one rendering chain.
    expect(documentText).toContain(preview.html);
    for (const marker of unsafe) expect(documentText).not.toContain(marker);

    const markdown = await get(
      owner,
      `/articles/${articleId}/export?format=markdown`,
    );
    expect(markdown.status).toBe(200);
    expect(markdown.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(markdown.headers.get("content-disposition")).toContain(
      `filename="article-v${version}.md"; filename*=UTF-8''${encodeURIComponent("离职后的写作陷阱 第一周.md")}`,
    );
    // Markdown is the author's own source text, downloaded rather than rendered.
    expect(await markdown.text()).toBe(`# ${title}\n\n${unsafeBody}\n`);
  });

  it("requires a session, hides other users' articles and rejects bad input", async () => {
    const owner = await signIn("export-guard");
    const other = await signIn("export-other");
    const { articleId } = await articleWithBody(owner, "标题", "正文");

    for (const path of [
      `/articles/${articleId}/preview`,
      `/articles/${articleId}/export?format=html`,
    ]) {
      expect(await failure(await get("", path))).toMatchObject({
        status: 401,
        code: "UNAUTHORIZED",
      });
      expect(await failure(await get(other, path))).toMatchObject({
        status: 404,
        code: "ARTICLE_NOT_FOUND",
      });
    }
    expect(
      await failure(await get(owner, "/articles/missing/export?format=html")),
    ).toMatchObject({ status: 404, code: "ARTICLE_NOT_FOUND" });
    for (const query of ["", "?format=pdf", "?format=HTML"])
      expect(
        await failure(
          await get(owner, `/articles/${articleId}/export${query}`),
        ),
      ).toMatchObject({ status: 422, code: "INVALID_EXPORT_FORMAT" });

    // Reads only: an untrusted page gets no CORS grant to read the file.
    const crossSite = await get(
      owner,
      `/articles/${articleId}/export?format=html`,
      { origin: "https://untrusted.example" },
    );
    expect(crossSite.headers.get("access-control-allow-origin")).toBeNull();
    const sameSite = await get(
      owner,
      `/articles/${articleId}/export?format=html`,
      { origin },
    );
    expect(sameSite.status).toBe(200);
    expect(sameSite.headers.get("access-control-allow-origin")).toBe(origin);
  });

  it("explains that an article without a body cannot be previewed or exported", async () => {
    const owner = await signIn("export-empty");
    const { articleId } = await confirmedArticle(owner);
    for (const path of [
      `/articles/${articleId}/preview`,
      `/articles/${articleId}/export?format=markdown`,
      `/articles/${articleId}/export?format=html`,
    ])
      expect(await failure(await get(owner, path))).toMatchObject({
        status: 422,
        code: "ARTICLE_BODY_REQUIRED",
        message: "文章还没有正文，生成或写好正文后再预览和导出。",
      });
  });

  it("never includes the author's reference articles", async () => {
    const owner = await signIn("export-reference");
    const reference = await write(owner, "/breakdowns", {
      title: "别人的爆款",
      content: "参考原文独有的句子：这是别人的作品，不能导出。",
    });
    expect(reference.status).toBe(201);
    const referenceId = ((await reference.json()) as { id: string }).id;
    const { articleId } = await articleWithBody(
      owner,
      "我自己的文章",
      "我自己写的正文。",
    );

    const bodies = await Promise.all(
      [
        `/articles/${articleId}/preview`,
        `/articles/${articleId}/export?format=markdown`,
        `/articles/${articleId}/export?format=html`,
      ].map(async (path) => (await get(owner, path)).text()),
    );
    for (const text of bodies) {
      expect(text).toContain("我自己写的正文。");
      expect(text).not.toContain("参考原文独有的句子");
      expect(text).not.toContain("别人的爆款");
    }
    // A reference article id is not an article.
    expect(
      await failure(await get(owner, `/articles/${referenceId}/preview`)),
    ).toMatchObject({ status: 404, code: "ARTICLE_NOT_FOUND" });
  });
});
