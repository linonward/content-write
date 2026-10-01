import { describe, expect, it } from "vitest";
import { createMockDraft, type DraftContext, validateDraft } from "./draft";

const context: DraftContext = {
  brief: {
    workingTitle: "写作题目",
    audience: "目标读者",
    thesis: "待验证主张",
  },
  outline: {
    workingTitle: "写作题目",
    audience: "目标读者",
    thesis: "待验证主张",
    sections: [
      {
        heading: "问题",
        purpose: "说明读者问题。",
        keyPoints: ["读者遇到的问题"],
        evidenceIds: [],
        missingEvidence: ["补充真实场景。"],
      },
      {
        heading: "来源怎么说",
        purpose: "核对来源。",
        keyPoints: ["来源支持的观点"],
        evidenceIds: ["material-1:span-1"],
        missingEvidence: [],
      },
    ],
  },
  sources: [
    {
      id: "material-1",
      version: 2,
      title: "来源一",
      summary: "作者记录了一个待核对的观点。",
      evidence: [{ id: "span-1", quote: "原文片段" }],
    },
  ],
};

describe("source-backed draft", () => {
  it("builds a valid draft that follows the confirmed outline", () => {
    const draft = createMockDraft(context);
    expect(validateDraft(draft, context.sources).success).toBe(true);
    expect(draft.markdown).toContain("## 问题");
    expect(draft.markdown).toContain("## 来源怎么说");
    expect(draft.markdown).toContain("原文片段");
    expect(draft.sourceMap).toEqual([
      {
        claim: "来源支持的观点",
        materialId: "material-1",
        materialVersion: 2,
        evidenceIds: ["span-1"],
      },
    ]);
    expect(draft.evidenceGaps).toContain("补充真实场景。");
  });

  it("rejects source mappings outside the article's pinned sources", () => {
    const draft = createMockDraft(context);
    const wrongVersion = structuredClone(draft);
    wrongVersion.sourceMap[0].materialVersion = 1;
    expect(validateDraft(wrongVersion, context.sources).success).toBe(false);
    const unknownSpan = structuredClone(draft);
    unknownSpan.sourceMap[0].evidenceIds = ["invented"];
    expect(validateDraft(unknownSpan, context.sources).success).toBe(false);
    const otherMaterial = structuredClone(draft);
    otherMaterial.sourceMap[0].materialId = "material-2";
    expect(validateDraft(otherMaterial, context.sources).success).toBe(false);
  });

  it("rejects drafts over the length limit", () => {
    const draft = createMockDraft(context);
    draft.markdown = "字".repeat(50_001);
    expect(validateDraft(draft, context.sources).success).toBe(false);
  });
});
