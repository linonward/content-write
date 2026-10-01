import { describe, expect, it } from "vitest";
import { createMockAnalysis, validateAnalysis } from "./analysis";

describe("material analysis contract", () => {
  it("rejects invented evidence positions and references", () => {
    const content = "甲说增长十倍。乙认为应该先验证。";
    const valid = createMockAnalysis(content);
    expect(validateAnalysis(content, valid).success).toBe(true);
    expect(
      validateAnalysis(content, {
        ...valid,
        evidenceSpans: [{ id: "e1", quote: "捏造", start: 0, end: 2 }],
      }).success,
    ).toBe(false);
    expect(
      validateAnalysis(content, {
        ...valid,
        claims: [
          { text: "观点", kind: "source_claim", evidenceIds: ["missing"] },
        ],
      }).success,
    ).toBe(false);
  });

  it("uses JavaScript UTF-16 offsets", () => {
    const content = "🚀项目启动。接着验证。";
    const result = createMockAnalysis(content);
    expect(
      result.evidenceSpans.every(
        (span) => content.slice(span.start, span.end) === span.quote,
      ),
    ).toBe(true);
  });
});
