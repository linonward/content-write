import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  fetchLink,
  isPublicIp,
  requestPinned,
  validatePublicUrl,
} from "./link-fetch";

const article = new TextEncoder().encode(
  "<html><head><title>文章标题</title><script>evil()</script></head><body><nav>导航</nav><article><h1>主题</h1><p>正文内容</p></article></body></html>",
);

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
      expect(result.content).toContain("正文内容");
      expect(result.content).not.toContain("evil()");
      expect(result.content).not.toContain("导航");
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
        new Uint8Array(2_097_153),
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
    const compressed = gzipSync(Buffer.alloc(2_097_153, 65));
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
});
