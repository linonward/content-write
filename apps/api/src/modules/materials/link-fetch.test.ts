import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  fetchLink,
  isPublicIp,
  requestPinned,
  validatePublicUrl,
} from "./link-fetch";

const paragraph = "这是一段足够长的正文内容，用来模拟真实文章里的段落。".repeat(
  4,
);
const page = (body: string, title = "文章标题") =>
  new TextEncoder().encode(
    `<html><head><title>${title}</title><script>evil()</script></head><body>${body}</body></html>`,
  );
const article = page(
  `<nav>导航</nav><article><h1>主题</h1><p>${paragraph}</p><p>${paragraph}</p></article><footer>页脚</footer>`,
);
const html = { "content-type": "text/html; charset=utf-8" };
const resolveAll = async () => ["8.8.8.8"];

const response = (
  status: number,
  headers: Record<string, string>,
  bytes = article,
) => ({
  status,
  headers,
  bytes,
});

describe("safe link fetching", () => {
  it("rejects unsafe schemes, credentials, ports and address literals", () => {
    for (const url of [
      "file:///etc/passwd",
      "http://user:pass@example.com/",
      "http://example.com:8080/",
      "http://localhost/",
      "http://127.0.0.1/",
      "http://169.254.169.254/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[2002:7f00:1::]/",
    ])
      expect(() => validatePublicUrl(url)).toThrow();
    expect(validatePublicUrl("https://example.com/path").href).toBe(
      "https://example.com/path",
    );
  });

  it("blocks non-global DNS answers and never connects to them", async () => {
    expect(isPublicIp("10.0.0.2")).toBe(false);
    expect(isPublicIp("100.64.0.1")).toBe(false);
    expect(isPublicIp("192.0.2.1")).toBe(false);
    expect(isPublicIp("8.8.8.8")).toBe(true);
    const requestPinned = vi.fn();
    const result = await fetchLink("https://example.com/", {
      resolveAll: async () => ["8.8.8.8", "169.254.169.254"],
      requestPinned,
    });
    expect(result.status).toBe("failed");
    expect(requestPinned).not.toHaveBeenCalled();
  });

  it("pins a vetted DNS address and extracts visible text", async () => {
    const requestPinned = vi.fn(async () =>
      response(200, { "content-type": "text/html; charset=utf-8" }),
    );
    const result = await fetchLink("https://example.com/a", {
      resolveAll: async () => ["8.8.8.8"],
      requestPinned,
    });
    expect(requestPinned).toHaveBeenCalledWith(
      expect.any(URL),
      "8.8.8.8",
      expect.any(Number),
    );
    expect(result).toMatchObject({ status: "fetched", title: "文章标题" });
    if (result.status === "fetched") {
      expect(result.content).toContain(paragraph);
      expect(result.content).not.toContain("evil()");
      expect(result.content).not.toContain("导航");
      expect(result.content).not.toContain("页脚");
    }
  });

  it("validates every redirect and stops before a private destination", async () => {
    const requestPinned = vi.fn(async () =>
      response(302, { location: "http://127.0.0.1/internal" }),
    );
    const result = await fetchLink("https://example.com/", {
      resolveAll: async () => ["8.8.8.8"],
      requestPinned,
    });
    expect(result.status).toBe("failed");
    expect(requestPinned).toHaveBeenCalledTimes(1);
  });

  it("rejects non-text and oversized bodies", async () => {
    for (const payload of [
      response(200, { "content-type": "image/png" }),
      response(
        200,
        { "content-type": "text/plain" },
        new Uint8Array(8_388_609),
      ),
    ]) {
      const result = await fetchLink("https://example.com/", {
        resolveAll: async () => ["8.8.8.8"],
        requestPinned: async () => payload,
      });
      expect(result.status).toBe("failed");
    }
  });

  it("rejects decompression bombs", async () => {
    const compressed = gzipSync(Buffer.alloc(8_388_609, 65));
    const result = await fetchLink("https://example.com/", {
      resolveAll: async () => ["8.8.8.8"],
      requestPinned: async () =>
        response(
          200,
          { "content-type": "text/plain", "content-encoding": "gzip" },
          compressed,
        ),
    });
    expect(result.status).toBe("failed");
  });

  it("connects to the pinned address without resolving the URL host again", async () => {
    const server = createServer((request, response) => {
      expect(request.headers.host).toMatch(/^unresolvable\.invalid:/);
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("pinned response");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("missing test port");
      const result = await requestPinned(
        new URL(`http://unresolvable.invalid:${address.port}/`),
        "127.0.0.1",
        1000,
      );
      expect(new TextDecoder().decode(result.bytes)).toBe("pinned response");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("reads WeChat articles from the article container", async () => {
    const result = await fetchLink("https://mp.weixin.qq.com/s/abc", {
      resolveAll,
      requestPinned: async () =>
        response(
          200,
          html,
          page(
            `<h1 id="activity-name"> 公众号标题 </h1><div id="js_content" style="visibility: hidden"><section><p>${paragraph}</p><p>${paragraph}</p></section></div><div>赞 在看 分享</div>`,
            "",
          ),
        ),
    });
    expect(result).toMatchObject({ status: "fetched", title: "公众号标题" });
    if (result.status === "fetched") {
      expect(result.content).toBe(`${paragraph}\n${paragraph}`);
    }
  });

  it("fails on pages without a readable article instead of saving them", async () => {
    for (const [url, body] of [
      ["https://mp.weixin.qq.com/s/abc", "<p>参数错误</p><p>赞 在看 分享</p>"],
      [
        "https://mp.weixin.qq.com/s/abc",
        `<p>环境异常</p><p>当前环境异常，完成验证后即可继续访问。${paragraph}</p>`,
      ],
      [
        "https://example.com/",
        "<noscript>We're sorry but this site doesn't work properly without JavaScript enabled.</noscript><div id=app></div>",
      ],
      [
        "https://example.com/",
        `<article><p>${paragraph.slice(0, 60)}</p></article>`,
      ],
      [
        "https://example.com/",
        `<article><h1>Just a moment...</h1><p>${paragraph}</p><p>${paragraph}</p></article>`,
      ],
    ]) {
      const result = await fetchLink(url, {
        resolveAll,
        requestPinned: async () => response(200, html, page(body)),
      });
      expect(result.status).toBe("failed");
    }
  });

  it("sends a browser user agent without cookies", async () => {
    const server = createServer((request, response) => {
      expect(request.headers["user-agent"]).toMatch(/^Mozilla\/5\.0 /);
      expect(request.headers.cookie).toBeUndefined();
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("missing test port");
      await requestPinned(
        new URL(`http://example.test:${address.port}/`),
        "127.0.0.1",
        1000,
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
