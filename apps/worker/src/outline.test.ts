import { describe, expect, it } from "vitest";
import { createMockOutline, validateOutline } from "./outline";

const source = {
  id: "material-1",
  title: "来源一",
  summary: "作者记录了一个待核对的观点。",
  evidenceIds: ["span-1"],
};

describe("source-backed outline", () => {
  it("builds a valid outline from a brief and pinned source", () => {
    const result = createMockOutline(
      { workingTitle: "写作题目", audience: "目标读者", thesis: "待验证主张" },
      [source],
    );
    expect(validateOutline(result, [source]).success).toBe(true);
    expect(
      result.sections.some((section) =>
        section.evidenceIds.includes("material-1:span-1"),
      ),
    ).toBe(true);
  });

  it("rejects unsupported evidence references", () => {
    const result = createMockOutline(
      { workingTitle: "写作题目", audience: "目标读者", thesis: "待验证主张" },
      [source],
    );
    result.sections[0].evidenceIds = ["material-1:invented"];
    expect(validateOutline(result, [source]).success).toBe(false);
  });
});
