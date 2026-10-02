import { describe, expect, it } from "vitest";
import { editMessages } from "./ai/prompts";
import { createMockEdit, type EditContext, validateEdit } from "./edit";

const context: EditContext = {
  scope: "selection",
  instruction: "更精简",
  selectionText: "\n这是一段需要修改的文字。\n\n",
  before: "前文",
  after: "后文",
  brief: { workingTitle: "题目", audience: "读者", thesis: "主张" },
  sources: [
    { id: "m1", title: "素材", evidence: [{ id: "e1", quote: "素材原文" }] },
  ],
};

describe("edit suggestions", () => {
  it("keeps the selection's surrounding whitespace around the replacement", () => {
    const result = validateEdit(
      {
        replacement: "  改好的文字。 ",
        explanation: "删去重复。",
        evidenceGaps: [],
      },
      context.selectionText,
    );
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.replacement).toBe("\n改好的文字。\n\n");
  });

  it("rejects extra fields, blank replacements and long explanations", () => {
    const base = { replacement: "改好", explanation: "说明", evidenceGaps: [] };
    expect(validateEdit({ ...base, rewritten: "x" }, "原文").success).toBe(
      false,
    );
    expect(validateEdit({ ...base, replacement: "  " }, "原文").success).toBe(
      false,
    );
    expect(
      validateEdit({ ...base, explanation: "长".repeat(501) }, "原文").success,
    ).toBe(false);
    expect(
      validateEdit({ ...base, evidenceGaps: Array(9).fill("缺") }, "原文")
        .success,
    ).toBe(false);
  });

  it("mock output passes validation and marks itself as a mock", () => {
    const mock = createMockEdit(context);
    expect(mock.replacement).toContain("模拟修改：更精简");
    expect(validateEdit(mock, context.selectionText).success).toBe(true);
  });

  it("sends only the selection and its context, not the reference or other text", () => {
    const [system, user] = editMessages(context);
    expect(system.content).toContain("json");
    expect(user.content).toContain("<选区>\n\n这是一段需要修改的文字。");
    expect(user.content).toContain("<选区前文>\n前文");
    expect(user.content).toContain("素材原文");
    const full = editMessages({ ...context, scope: "full" })[1].content;
    expect(full).toContain("<全文>");
    expect(full).not.toContain("<选区前文>");
  });
});
