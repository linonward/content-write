import { describe, expect, it } from "vitest";
import { createMockIdeas, validateIdeas } from "./ideas";

const sources = [
  {
    id: "source-a",
    title: "素材 A",
    version: 2,
    summary: "作者记录了验证方法。",
    angle: "从验证方法展开",
    claim: "先做小规模验证。",
  },
  {
    id: "source-b",
    title: "素材 B",
    version: 1,
    summary: "来源讨论了写作过程。",
    angle: "从写作过程展开",
    claim: "保留修改记录。",
  },
];

describe("source-based idea output", () => {
  it("creates 3 grounded mock ideas with explicit evidence gaps", () => {
    const result = createMockIdeas(sources);
    expect(result).toHaveLength(3);
    expect(validateIdeas(result, sources).success).toBe(true);
    expect(
      result.every(
        (idea) => idea.materialIds.length > 0 && idea.evidenceGaps.length > 0,
      ),
    ).toBe(true);
  });

  it("rejects fabricated material IDs and invalid structures", () => {
    const result = createMockIdeas(sources);
    expect(
      validateIdeas(
        [{ ...result[0], materialIds: ["other"] }, result[1], result[2]],
        sources,
      ).success,
    ).toBe(false);
    expect(validateIdeas(result.slice(0, 2), sources).success).toBe(false);
  });
});
