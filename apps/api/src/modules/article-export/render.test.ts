import { describe, expect, it } from "vitest";
import {
  fileBaseName,
  renderHtmlDocument,
  renderMarkdown,
  renderMarkdownDocument,
} from "./render";

describe("article renderer", () => {
  it("renders the supported Markdown blocks", () => {
    const html = renderMarkdown(
      [
        "## 小标题",
        "第一段，**加粗**与*强调*。",
        "- 一\n- 二",
        "3. 三\n4. 四",
        "> 引用",
        "```ts\nconst a = 1 < 2;\n```",
        "---",
        "[链接](https://example.com/a)",
      ].join("\n\n"),
    );
    expect(html).toContain("<h2>小标题</h2>");
    expect(html).toContain("<strong>加粗</strong>");
    expect(html).toContain("<em>强调</em>");
    expect(html).toContain("<ul>\n<li>一</li>");
    expect(html).toContain('<ol start="3">');
    expect(html).toContain("<blockquote>\n<p>引用</p>\n</blockquote>");
    expect(html).toContain(
      '<pre><code class="language-ts">const a = 1 &#x3C; 2;\n</code></pre>',
    );
    expect(html).toContain("<hr>");
    expect(html).toContain(
      '<a href="https://example.com/a" rel="noopener noreferrer nofollow">链接</a>',
    );
  });

  it("drops raw HTML blocks and inline tags instead of executing them", () => {
    const html = renderMarkdown(
      [
        "<script>alert(1)</script>",
        '<iframe src="https://evil.example"></iframe>',
        "<style>body{display:none}</style>",
        '<div onclick="steal()">块</div>',
        '正文 <img src=x onerror="alert(1)"> 继续 <b onmouseover="x()">粗</b>',
        "<!-- 注释 -->",
      ].join("\n\n"),
    );
    for (const unsafe of [
      "<script",
      "alert",
      "<iframe",
      "evil.example",
      "<style",
      "onclick",
      "onerror",
      "onmouseover",
      "<img",
      "<div",
      "<!--",
    ])
      expect(html).not.toContain(unsafe);
    expect(html).toContain("正文");
    expect(html).toContain("继续");
  });

  it("removes unsafe link protocols and relative targets", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "//evil.example/x",
      "/api/me",
    ]) {
      const html = renderMarkdown(`[点我](${href.replace(/\s/g, "%09")})`);
      expect(html).toBe("<p><a>点我</a></p>");
    }
    expect(renderMarkdown("<javascript:alert(1)>")).not.toContain("href");
    expect(renderMarkdown("[信](mailto:a@example.com)")).toContain(
      'href="mailto:a@example.com"',
    );
  });

  it("never loads images: remote images become links, others plain text", () => {
    const remote = renderMarkdown("![封面](https://cdn.example/a.png)");
    expect(remote).toBe(
      '<p><a href="https://cdn.example/a.png" class="image-link" rel="noopener noreferrer nofollow">[图片：封面]</a></p>',
    );
    for (const src of [
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "javascript:alert(1)",
      "local.png",
    ]) {
      const html = renderMarkdown(`![](${src})`);
      expect(html).toBe(
        '<p><span class="image-placeholder">[图片：未命名]</span></p>',
      );
    }
    // A linked image cannot nest a second link.
    expect(
      renderMarkdown("[![图](https://cdn.example/a.png)](https://example.com)"),
    ).toBe(
      '<p><a href="https://example.com/" rel="noopener noreferrer nofollow"><span class="image-placeholder">[图片：图]</span></a></p>',
    );
    // Reference-style images and raw <img> never produce an <img> either.
    const reference = renderMarkdown(
      '![图][r]\n\n<img src="https://cdn.example/b.png">\n\n[r]: https://cdn.example/c.png',
    );
    expect(reference).not.toContain("<img");
    expect(reference).not.toContain("b.png");
  });

  it("escapes text that looks like markup", () => {
    expect(renderMarkdown("1 < 2 && `<b>`")).toBe(
      "<p>1 &#x3C; 2 &#x26;&#x26; <code>&#x3C;b></code></p>",
    );
  });

  it("builds a standalone HTML document with an escaped title and a no-network CSP", () => {
    const doc = renderHtmlDocument(
      '标题 <script>alert("x")</script>',
      "正文\n\n<script>alert(2)</script>",
    );
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain('<meta charset="utf-8">');
    expect(doc).toContain(
      "content=\"default-src 'none'; style-src 'unsafe-inline'\"",
    );
    expect(doc).toContain(
      "<title>标题 &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</title>",
    );
    expect(doc).toContain("<p>正文</p>");
    expect(doc).not.toContain("<script");
  });

  it("exports Markdown as the author's text under the title", () => {
    expect(renderMarkdownDocument("标题", "\n正文 <b>原样</b>\n\n")).toBe(
      "# 标题\n\n正文 <b>原样</b>\n",
    );
  });

  it("makes safe file names", () => {
    expect(fileBaseName('离职/后的:写作*陷阱?"<>|')).toBe(
      "离职 后的 写作 陷阱",
    );
    expect(fileBaseName("..\\..\\etc")).toBe("etc");
    expect(fileBaseName("  \u0000 ")).toBe("文章");
    expect(Array.from(fileBaseName("长".repeat(200)))).toHaveLength(80);
  });
});
