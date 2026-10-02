import type { FrameworkSnapshot } from "@content-write/db/framework";
import { describe, expect, it } from "vitest";
import { createMockDraft, validateDraft } from "./draft";
import { createMockFrameworkOutline, validateOutline } from "./outline";

const brief = {
  workingTitle: "离职后的写作陷阱",
  audience: "刚离职的程序员",
  thesis: "拖慢写作的不是时间，而是缺少固定的开始动作",
};
const source = {
  id: "material-1",
  title: "离职后的第一个月",
  summary: "作者发现缺少开始动作。",
  evidenceIds: ["e1", "e2"],
};
const framework: FrameworkSnapshot = {
  name: "预期反转",
  titlePattern: "年龄节点 + 认知转变",
  hook: { type: "预期反转", technique: "先给期待再打破。" },
  slots: ["开头：反常识现象", "转折：代价浮现", "明白的第一件事"].map(
    (name, index) => ({
      id: `slot${index + 1}`,
      name,
      purpose: "这一段的作用",
      technique: "这一段的手法",
    }),
  ),
  rhythm: "短段落。",
  ending: { type: "留白提问", technique: "把问题抛给读者。" },
};

describe("framework outline", () => {
  it("fills every slot in order and marks unsupported slots as gaps", () => {
    const outline = createMockFrameworkOutline(brief, [source], framework);
    expect(validateOutline(outline, [source], framework).success).toBe(true);
    expect(outline.sections.map((section) => section.slotId)).toEqual([
      "slot1",
      "slot2",
      "slot3",
    ]);
    // Two spans for three slots: the last slot has no evidence and says so.
    expect(outline.sections[2].evidenceIds).toEqual([]);
    expect(outline.sections[2].missingEvidence[0]).toContain("明白的第一件事");
  });

  it("rejects generated outlines that skip, reorder or invent slots", () => {
    const outline = createMockFrameworkOutline(brief, [source], framework);
    const skipped = { ...outline, sections: outline.sections.slice(0, 2) };
    const reordered = {
      ...outline,
      sections: [...outline.sections].reverse(),
    };
    const invented = {
      ...outline,
      sections: outline.sections.map((section, index) =>
        index === 0 ? { ...section, slotId: "slot9" } : section,
      ),
    };
    for (const value of [skipped, reordered, invented])
      expect(validateOutline(value, [source], framework).success).toBe(false);
  });

  it("rejects slot ids when the article has no framework", () => {
    const outline = createMockFrameworkOutline(brief, [source], framework);
    expect(validateOutline(outline, [source]).success).toBe(false);
  });

  it("rejects evidence from the reference article", () => {
    const outline = createMockFrameworkOutline(brief, [source], framework);
    outline.sections[0].evidenceIds = ["reference-article-id:s1"];
    expect(validateOutline(outline, [source], framework).success).toBe(false);
  });

  it("drafts cannot cite the reference article as a source", () => {
    const outline = createMockFrameworkOutline(brief, [source], framework);
    const sources = [
      {
        id: "material-1",
        version: 1,
        title: "离职后的第一个月",
        summary: "作者发现缺少开始动作。",
        evidence: [
          { id: "e1", quote: "真正拖慢我的不是时间" },
          { id: "e2", quote: "没有固定的开始动作" },
        ],
      },
    ];
    const draft = createMockDraft({ brief, outline, sources });
    expect(validateDraft(draft, sources).success).toBe(true);
    const cited = {
      ...draft,
      sourceMap: [
        {
          claim: "参考文章说的",
          materialId: "reference-article-id",
          materialVersion: 1,
          evidenceIds: ["s1"],
        },
      ],
    };
    expect(validateDraft(cited, sources).success).toBe(false);
  });
});
