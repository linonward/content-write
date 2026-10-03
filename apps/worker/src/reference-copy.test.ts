import { describe, expect, it } from "vitest";
import type { ParseResult } from "./ai/deepseek";
import {
  COPY_RUN_CHARS,
  copiedRun,
  REFERENCE_COPIED,
  withoutReferenceCopy,
} from "./reference-copy";

const original =
  "30 岁那年，我从大厂辞职，以为终于自由了。\n\n结果第三个月，我连早上几点起床都决定不了。";
const reference = { title: "辞职之后我才明白的事", content: original };
const copied = "结果第三个月，我连早上几点起床都决定不了";

describe("copiedRun", () => {
  it("finds a run of the original, ignoring whitespace on both sides", () => {
    const run = copiedRun(reference, [
      "我自己的开头。",
      "结果 第三个月，\n我连早上几点起床都决定不了，这是真的。",
    ]);
    expect(run).toHaveLength(COPY_RUN_CHARS);
    expect(original.replace(/\s+/g, "")).toContain(run);
  });

  it("accepts text that only shares shorter runs with the original", () => {
    const short = copied.slice(0, COPY_RUN_CHARS - 1);
    expect(copiedRun(reference, [`${short}。后面是我自己的话。`])).toBeNull();
  });

  it("checks each text on its own, so adjacent fields cannot form a run", () => {
    const half = Math.floor(COPY_RUN_CHARS / 2);
    const run = copied.slice(0, COPY_RUN_CHARS);
    expect(
      copiedRun(reference, [run.slice(0, half), run.slice(half)]),
    ).toBeNull();
  });

  it("does not join the title and the body into one run", () => {
    const half = Math.floor(COPY_RUN_CHARS / 2);
    const across =
      reference.title.slice(-half) +
      original.replace(/\s+/g, "").slice(0, COPY_RUN_CHARS - half);
    expect(copiedRun(reference, [across])).toBeNull();
    const title = "辞职之后我才明白的那些小事，写给还在犹豫的你";
    expect(
      copiedRun({ title, content: original }, [`标题是${title}吗`]),
    ).not.toBeNull();
  });

  it("counts a Latin word or a number once, so shared names are not copying", () => {
    const tools = {
      title: "工具",
      content:
        "我们团队今年全面换成了 GitHub Copilot Enterprise 和 Visual Studio Code 2026。",
    };
    expect(
      copiedRun(tools, [
        "我用的是 GitHub Copilot Enterprise 和 Visual Studio Code 2026，体验不同。",
      ]),
    ).toBeNull();
    expect(
      copiedRun(tools, ["他说我们团队今年全面换成了 GitHub Copilot，我不信。"]),
    ).toBe("我们团队今年全面换成了GitHub");
  });

  it("leaves alone runs the author already had in the text being edited", () => {
    const selection = `我引用一句：${copied}。`;
    expect(
      copiedRun(reference, [`改写后仍保留：${copied}。`], [selection]),
    ).toBe(null);
    expect(
      copiedRun(
        reference,
        ["30岁那年，我从大厂辞职，以为终于自由了。"],
        [selection],
      ),
    ).not.toBeNull();
  });
});

describe("withoutReferenceCopy", () => {
  const parse = (value: unknown): ParseResult<{ body: string }> => ({
    success: true,
    data: value as { body: string },
  });
  const texts = (data: { body: string }) => [data.body];

  it("turns a copied run into a repairable error that names the run", () => {
    const result = withoutReferenceCopy(
      parse,
      reference,
      texts,
    )({
      body: `我的开头：${copied}。`,
    });
    expect(result).toMatchObject({ success: false, code: REFERENCE_COPIED });
    if (!result.success)
      expect(result.error).toContain(copied.slice(0, COPY_RUN_CHARS));
  });

  it("passes clean output and skips articles without a bound reference", () => {
    expect(
      withoutReferenceCopy(parse, reference, texts)({ body: "我自己的话。" })
        .success,
    ).toBe(true);
    expect(
      withoutReferenceCopy(parse, null, texts)({ body: copied }).success,
    ).toBe(true);
  });

  it("keeps the inner parser's own failure", () => {
    const failing = (): ParseResult<{ body: string }> => ({
      success: false,
      error: "结构不符合要求",
    });
    expect(
      withoutReferenceCopy(failing, reference, texts)({ body: copied }),
    ).toEqual({ success: false, error: "结构不符合要求" });
  });
});
