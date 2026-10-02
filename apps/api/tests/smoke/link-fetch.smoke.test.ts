import { describe, expect, it } from "vitest";
import {
  fetchLink,
  type LinkFetchDeps,
  requestPinned,
} from "../../src/modules/materials/link-fetch";

/**
 * Real-network smoke test: fetches public articles through the product fetcher.
 * Not part of CI. Run: pnpm --filter @content-write/api smoke:link-fetch
 * Set LINK_FETCH_DOH=1 when local DNS returns proxy fake IPs (198.18.0.0/15);
 * hosts are then resolved through AliDNS over HTTPS, the connection is unchanged.
 */
async function resolveOverHttps(host: string) {
  const response = await fetch(
    `https://dns.alidns.com/resolve?name=${encodeURIComponent(host)}&type=1`,
  );
  const body = (await response.json()) as {
    Answer?: { type: number; data: string }[];
  };
  return (body.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data);
}

const deps: LinkFetchDeps | undefined =
  process.env.LINK_FETCH_DOH === "1"
    ? { resolveAll: resolveOverHttps, requestPinned }
    : undefined;

const supported = [
  "https://mp.weixin.qq.com/s/krGl43lntJvuzU_lHtg1nA",
  "https://mp.weixin.qq.com/s/rYZYlM61cyEoNCcSAX6BEg",
  "https://mp.weixin.qq.com/s/zoXxkdVj70XOuAMdkGtuEQ",
  "https://www.woshipm.com/it/5997158.html",
  "https://www.ifanr.com/1674965",
  "https://sspai.com/post/115211",
];

// Error pages, JS-only shells and blocked sites must fail instead of saving junk.
const unsupported = [
  "https://mp.weixin.qq.com/s/2Wm1W5Q2YF3gk3Y0iK6X3A",
  "https://sspai.com/post/92000",
  "https://zhuanlan.zhihu.com/p/690000000",
];

describe("real link fetching", () => {
  for (const url of supported)
    it(`extracts the article from ${url}`, async () => {
      const result = await fetchLink(url, deps);
      expect(result.status).toBe("fetched");
      if (result.status !== "fetched") return;
      console.log(
        `${url}\n  ${result.title} · ${result.content.length} 字\n  ${result.content.slice(0, 80).replace(/\n+/g, " | ")}\n  … ${result.content.slice(-80).replace(/\n+/g, " | ")}`,
      );
      expect(result.title).not.toBe(new URL(url).hostname);
      expect(result.content.length).toBeGreaterThan(400);
    });

  for (const url of unsupported)
    it(`fails cleanly for ${url}`, async () => {
      expect((await fetchLink(url, deps)).status).toBe("failed");
    });
}, 30_000);
