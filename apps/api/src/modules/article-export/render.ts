import type { Element, ElementContent, Root } from "hast";
import rehypeSanitize, { type Options as Schema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * The one rendering chain behind the phone preview and the HTML export
 * (product 3.5, 9.3). CommonMark only: raw HTML in the Markdown is dropped by
 * remark-rehype (no `allowDangerousHtml`), images become links or text so no
 * remote file is ever loaded, and a strict allow-list sanitizer runs last as
 * defense in depth.
 */

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

/** Absolute URL with an allowed protocol, else null. Relative and protocol-relative URLs are refused. */
function safeUrl(value: unknown, protocols: Set<string>) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return protocols.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Replaces every image with `[图片：alt]`: a link to the original when it is
 * an http(s) URL outside another link, plain text otherwise.
 */
function imagesAsLinks() {
  const replace = (node: Element, insideLink: boolean): ElementContent => {
    const alt =
      typeof node.properties.alt === "string" && node.properties.alt.trim()
        ? node.properties.alt.trim()
        : "未命名";
    const label = { type: "text" as const, value: `[图片：${alt}]` };
    const href = safeUrl(node.properties.src, IMAGE_PROTOCOLS);
    return href && !insideLink
      ? {
          type: "element",
          tagName: "a",
          properties: { href, className: ["image-link"] },
          children: [label],
        }
      : {
          type: "element",
          tagName: "span",
          properties: { className: ["image-placeholder"] },
          children: [label],
        };
  };
  const walk = (parent: Root | Element, insideLink: boolean) => {
    parent.children = parent.children.map((child) => {
      if (child.type !== "element") return child;
      if (child.tagName === "img") return replace(child, insideLink);
      walk(child, insideLink || child.tagName === "a");
      return child;
    }) as typeof parent.children;
  };
  return (tree: Root) => walk(tree, false);
}

// Only the elements Markdown produces for the supported blocks, with no ids,
// styles or event attributes; `strip` removes script/style contents entirely.
const schema: Schema = {
  tagNames: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
    "hr",
    "blockquote",
    "ul",
    "ol",
    "li",
    "pre",
    "code",
    "em",
    "strong",
    "a",
    "span",
  ],
  attributes: {
    a: ["href", "title", ["className", "image-link"]],
    ol: ["start"],
    code: [["className", /^language-[\w-]+$/]],
    span: [["className", "image-placeholder"]],
  },
  protocols: { href: ["http", "https", "mailto"] },
  ancestors: { li: ["ol", "ul"] },
  strip: ["script", "style"],
  allowComments: false,
  allowDoctypes: false,
};

/** After sanitizing: links must be absolute http(s)/mailto and never pass referrer or opener. */
function safeLinks() {
  const walk = (parent: Root | Element) => {
    for (const child of parent.children) {
      if (child.type !== "element") continue;
      if (child.tagName === "a") {
        const href = safeUrl(child.properties.href, LINK_PROTOCOLS);
        if (href) {
          child.properties.href = href;
          child.properties.rel = ["noopener", "noreferrer", "nofollow"];
        } else delete child.properties.href;
      }
      walk(child);
    }
  };
  return (tree: Root) => walk(tree);
}

const processor = unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(imagesAsLinks)
  .use(rehypeSanitize, schema)
  .use(safeLinks)
  .use(rehypeStringify)
  .freeze();

/** Sanitized HTML fragment for an article body written in Markdown. */
export function renderMarkdown(markdown: string): string {
  return String(processor.processSync(markdown));
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Mirrors the phone preview (apps/web article-preview.module.css) for a standalone file.
const DOCUMENT_CSS = `body{margin:0;background:#f7f6f2;color:#1b2a27;font-family:"Noto Serif SC","Songti SC",serif}
article{box-sizing:border-box;max-width:677px;margin:0 auto;padding:32px 24px 56px;background:#fff;font-size:16px;line-height:1.85}
h1{font-family:"Noto Sans SC","PingFang SC",sans-serif;font-size:22px;line-height:1.4;margin:0 0 24px}
h2,h3,h4,h5,h6{font-family:"Noto Sans SC","PingFang SC",sans-serif;font-size:17px;line-height:1.5;margin:28px 0 12px}
p,ul,ol,pre,blockquote{margin:0 0 16px}
ul,ol{padding-left:1.4em}
blockquote{border-left:3px solid #89938d;padding:4px 0 4px 12px;color:#56645f;font-size:15px}
pre{overflow-x:auto;padding:12px;background:#f4f2ec;border-radius:6px;font-size:13px;line-height:1.6}
code{font-family:ui-monospace,Menlo,monospace;font-size:.9em}
hr{border:0;border-top:1px solid #dad8cf;margin:28px 0}
a{color:#174a42}
.image-placeholder,.image-link{color:#56645f}`;

/**
 * A standalone document for download. The meta CSP blocks scripts, frames and
 * every network fetch, so even a browser opening the file loads nothing remote.
 */
export function renderHtmlDocument(title: string, markdown: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${safeTitle}</title>
<style>${DOCUMENT_CSS}</style>
</head>
<body>
<article>
<h1>${safeTitle}</h1>
${renderMarkdown(markdown)}
</article>
</body>
</html>
`;
}

/** The author's own Markdown with the title as a heading; raw text, never rendered by the browser. */
export function renderMarkdownDocument(title: string, markdown: string) {
  return `# ${title}\n\n${markdown.trim()}\n`;
}

/** File name without extension: no path separators, reserved or control characters. */
export function fileBaseName(title: string): string {
  const cleaned = title
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this removes.
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return Array.from(cleaned).slice(0, 80).join("").trim() || "文章";
}
