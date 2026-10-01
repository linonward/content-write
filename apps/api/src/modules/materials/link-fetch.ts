import { resolve4, resolve6 } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { load, loadBuffer } from "cheerio";

const MAX_BODY_BYTES = 2_097_152;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

const blockedV4 = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blockedV4.addSubnet(ip, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
for (const [ip, prefix] of [
  ["2001::", 32],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const)
  blockedV6.addSubnet(ip, prefix, "ipv6");

export function isPublicIp(value: string) {
  const ip = value.replace(/^\[|\]$/g, "");
  const family = isIP(ip);
  if (family === 4) return !blockedV4.check(ip, "ipv4");
  if (family === 6)
    return globalV6.check(ip, "ipv6") && !blockedV6.check(ip, "ipv6");
  return false;
}

export function validatePublicUrl(input: string): URL {
  if (input.length > 2048) throw new Error("链接不能超过 2048 字符。");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("请输入有效的 HTTP 或 HTTPS 链接。");
  }
  if (
    !(["http:", "https:"] as string[]).includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.hostname ||
    (url.port && !["80", "443"].includes(url.port)) ||
    url.hostname.toLowerCase() === "localhost" ||
    url.hostname.toLowerCase().endsWith(".localhost") ||
    (isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0 &&
      !isPublicIp(url.hostname))
  ) {
    throw new Error("链接地址或端口不受支持。");
  }
  url.hash = "";
  return url;
}

export type HopResponse = {
  status: number;
  headers: Record<string, string>;
  bytes: Uint8Array;
};
export type LinkFetchDeps = {
  resolveAll: (host: string) => Promise<string[]>;
  requestPinned: (
    url: URL,
    ip: string,
    timeoutMs: number,
  ) => Promise<HopResponse>;
};

async function resolveAll(host: string): Promise<string[]> {
  if (isIP(host.replace(/^\[|\]$/g, ""))) return [host.replace(/^\[|\]$/g, "")];
  const answers = await Promise.allSettled([resolve4(host), resolve6(host)]);
  const ips: string[] = [];
  for (const answer of answers) {
    if (answer.status === "fulfilled") ips.push(...answer.value);
    else {
      const code = (answer.reason as { code?: string }).code;
      if (code !== "ENODATA" && code !== "ENOTFOUND") throw answer.reason;
    }
  }
  return ips;
}

export async function requestPinned(
  url: URL,
  ip: string,
  timeoutMs: number,
): Promise<HopResponse> {
  return new Promise((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: host,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        agent: false,
        servername: isIP(host) ? undefined : host,
        rejectUnauthorized: true,
        lookup: (_hostname, options, callback) => {
          const family = isIP(ip) as 4 | 6;
          if (options.all) callback(null, [{ address: ip, family }]);
          else callback(null, ip, family);
        },
        signal: AbortSignal.timeout(timeoutMs),
        maxHeaderSize: 16_384,
        headers: {
          host: url.host,
          accept: "text/html, text/plain, text/markdown",
          "accept-encoding": "gzip, deflate, br, identity",
          "user-agent": "ContentWrite/1.0 (public article fetch)",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > MAX_BODY_BYTES) {
            request.destroy(new Error("响应内容过大。"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(response.headers)) {
            if (typeof value === "string") headers[key.toLowerCase()] = value;
          }
          resolve({
            status: response.statusCode ?? 0,
            headers,
            bytes: Buffer.concat(chunks),
          });
        });
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    request.end();
  });
}

function decodeBody(bytes: Uint8Array, encoding: string | undefined) {
  const input = Buffer.from(bytes);
  switch (encoding?.toLowerCase() ?? "identity") {
    case "identity":
      return input;
    case "gzip":
      return gunzipSync(input, { maxOutputLength: MAX_BODY_BYTES });
    case "deflate":
      return inflateSync(input, { maxOutputLength: MAX_BODY_BYTES });
    case "br":
      return brotliDecompressSync(input, { maxOutputLength: MAX_BODY_BYTES });
    default:
      throw new Error("不支持的内容编码。");
  }
}

function extractContent(bytes: Buffer, type: string, url: URL) {
  const mime = type.split(";")[0]?.trim().toLowerCase();
  if (
    !(["text/html", "text/plain", "text/markdown"] as string[]).includes(mime)
  )
    throw new Error("不支持的内容类型。");
  let title = url.hostname;
  let content: string;
  if (mime === "text/html") {
    const declaredCharset = /charset\s*=\s*([^;]+)/i
      .exec(type)?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, "");
    const $ = declaredCharset
      ? load(new TextDecoder(declaredCharset, { fatal: true }).decode(bytes))
      : loadBuffer(bytes);
    title =
      $("title").first().text().trim() ||
      $("h1").first().text().trim() ||
      title;
    $("script,style,noscript,nav,header,footer,aside,form,iframe,svg").remove();
    $("br,p,div,section,article,h1,h2,h3,li,blockquote").append("\n");
    content = $("body").text();
  } else {
    const charset =
      /charset\s*=\s*([^;]+)/i
        .exec(type)?.[1]
        ?.trim()
        .replace(/^['"]|['"]$/g, "") ?? "utf-8";
    content = new TextDecoder(charset, { fatal: true }).decode(bytes);
  }
  content = content
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  if (!content || content.length > 50_000)
    throw new Error("网页正文为空或过长。");
  return { title: title.slice(0, 200), content };
}

function deadline<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("抓取超时。")),
      milliseconds,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function fetchLink(
  input: string,
  deps: LinkFetchDeps = { resolveAll, requestPinned },
): Promise<
  | { status: "fetched"; title: string; content: string; finalUrl: string }
  | { status: "failed" }
> {
  const end = Date.now() + FETCH_TIMEOUT_MS;
  try {
    let url = validatePublicUrl(input);
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      const remaining = end - Date.now();
      if (remaining <= 0) throw new Error("抓取超时。");
      const ips = await deadline(
        deps.resolveAll(url.hostname.replace(/^\[|\]$/g, "")),
        remaining,
      );
      if (ips.length === 0 || ips.some((ip) => !isPublicIp(ip)))
        throw new Error("目标地址不安全。");
      const result = await deadline(
        deps.requestPinned(url, ips[0], Math.max(1, end - Date.now())),
        Math.max(1, end - Date.now()),
      );
      if ([301, 302, 303, 307, 308].includes(result.status)) {
        if (redirect === MAX_REDIRECTS || !result.headers.location)
          throw new Error("重定向次数过多。");
        url = validatePublicUrl(new URL(result.headers.location, url).href);
        continue;
      }
      if (result.status !== 200 || result.bytes.byteLength > MAX_BODY_BYTES)
        throw new Error("无法获取网页内容。");
      const bytes = decodeBody(
        result.bytes,
        result.headers["content-encoding"],
      );
      if (bytes.byteLength > MAX_BODY_BYTES) throw new Error("网页正文过大。");
      const extracted = extractContent(
        bytes,
        result.headers["content-type"] ?? "",
        url,
      );
      return { status: "fetched", ...extracted, finalUrl: url.href };
    }
    return { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
