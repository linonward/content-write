import { describe, expect, it } from "vitest";
import { findViolations } from "./design-tokens";

const texts = (source: string) => findViolations(source).map((v) => v.text);

describe("design token check", () => {
  it("flags arbitrary values, hex colors, custom breakpoints and alias colors", () => {
    expect(texts('className="p-[13px] text-[#66716c] max-w-[570px]"')).toEqual([
      "p-[13px]",
      "text-[#66716c]",
      "max-w-[570px]",
      "#66716c",
    ]);
    expect(texts('className="max-[680px]:px-4"')).toEqual(["max-[680px]:"]);
    expect(texts('<html className="[color-scheme:light]">')).toEqual([
      "[color-scheme:light]",
    ]);
    expect(texts("  color: #1b2a27;")).toEqual(["#1b2a27"]);
    expect(
      texts('className="text-muted-foreground bg-primary/80 text-red-600"'),
    ).toEqual(["text-muted-foreground", "bg-primary/80", "text-red-600"]);
  });

  it("allows tokens, scale classes and data/aria/group variants", () => {
    expect(
      texts(
        'className="bg-surface text-body text-ink-2 p-6 gap-1.5 max-md:px-4 data-[size=sm]:px-4 group-data-[size=sm]/card:px-4 has-[>svg]:gap-2 aria-[current=page]:text-accent [&_svg]:size-4"',
      ),
    ).toEqual([]);
    expect(texts('href="#e1" id="outline-title"')).toEqual([]);
    expect(texts("// 示例：p-[13px] 只在注释里")).toEqual([]);
  });
});
