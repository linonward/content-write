/**
 * 设计 token 检查（docs/design-system.md 第 5、7 节）：页面与模块只用 token 与刻度类名。
 * 任意值类名、hex 色值、自定义断点与 shadcn 别名颜色只允许出现在 `components/ui`
 * 与 `app/globals.css`。由 `pnpm lint` 运行；可用 `node apps/web/scripts/design-tokens.ts` 单独执行。
 */
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type Violation = { line: number; text: string; rule: string };

const rules: { rule: string; pattern: RegExp }[] = [
  {
    // `p-[13px]`、`text-[#123]`、`bg-[#fff]/50`；不含 `data-[x]:`、`group-data-[x]/card:` 这类变体。
    rule: "任意值类名，改用刻度类名或先加 token",
    pattern: /(?<![\w-])!?-?[a-z][a-z0-9-]*-\[[^\]\s"'`]+\](?!:|\/[\w-]+:)/g,
  },
  {
    // `[color-scheme:light]` 这类任意属性。
    rule: "任意属性类名，改到 globals.css 或组件",
    pattern: /(?<![\w&-])\[[a-z-]+:[^\]\s"'`]+\](?!:)/g,
  },
  {
    rule: "自定义断点，改用 sm / md / lg / xl",
    pattern: /(?<![\w-])(?:min|max)-\[[^\]\s]+\]:/g,
  },
  {
    rule: "hex 色值，改用颜色 token",
    pattern:
      /(?<![\w&])#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{1}|[0-9a-fA-F]{3}|[0-9a-fA-F]{5})?(?![\w-])/g,
  },
  {
    rule: "shadcn 别名或 Tailwind 调色板颜色，改用设计 token",
    pattern:
      /(?<![\w-])(?:bg|text|border|ring|outline|fill|stroke|divide|placeholder|from|via|to|decoration|caret)-(?:(?:primary|secondary|muted|destructive|card|popover|accent)-foreground|primary|secondary|muted|destructive|foreground|background|card|popover|input|white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?:\/\d+)?(?![\w-])/g,
  },
];

export function findViolations(source: string): Violation[] {
  const found: Violation[] = [];
  source.split("\n").forEach((content, index) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(content)) return;
    for (const { rule, pattern } of rules) {
      for (const match of content.matchAll(pattern)) {
        found.push({ line: index + 1, text: match[0], rule });
      }
    }
  });
  return found;
}

const exempt = (path: string) =>
  path.startsWith(`components${sep}ui${sep}`) ||
  path === join("app", "globals.css") ||
  /\.test\.tsx?$/.test(path);

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(tsx?|css)$/.test(entry.name)) yield path;
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL("../src", import.meta.url));
  let count = 0;
  for (const file of files(root)) {
    const path = relative(root, file);
    if (exempt(path)) continue;
    for (const v of findViolations(readFileSync(file, "utf8"))) {
      count += 1;
      console.error(`apps/web/src/${path}:${v.line}  ${v.text}  ${v.rule}`);
    }
  }
  if (count > 0) {
    console.error(
      `\n设计 token 检查：${count} 处违规（见 docs/design-system.md 第 5、7 节）。`,
    );
    process.exit(1);
  }
  console.log("设计 token 检查通过。");
}
