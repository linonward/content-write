import { z } from "zod";
import type { Brief } from "./outline";

const text = (max: number) => z.string().trim().min(1).max(max);
export const editSchema = z.strictObject({
  replacement: z.string().trim().min(1).max(20_000),
  explanation: text(500),
  evidenceGaps: z.array(text(300)).max(8),
});

export type Edit = z.infer<typeof editSchema>;
export type EditContext = {
  scope: "selection" | "full";
  instruction: string;
  selectionText: string;
  /** Body text around the selection so the replacement reads on; empty for full-text edits. */
  before: string;
  after: string;
  brief: Brief;
  sources: {
    id: string;
    title: string;
    evidence: { id: string; quote: string }[];
  }[];
};

/** Characters of surrounding body sent with a selection. */
export const CONTEXT_CHARS = 600;

/**
 * Structure check plus whitespace: the selection's leading and trailing
 * whitespace (paragraph breaks around it) is kept, so a trimmed model answer
 * does not glue paragraphs together when applied.
 */
export function validateEdit(input: unknown, selectionText: string) {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return parsed;
  const lead = /^\s*/.exec(selectionText)?.[0] ?? "";
  const trail = /\s*$/.exec(selectionText)?.[0] ?? "";
  return {
    success: true as const,
    data: {
      ...parsed.data,
      replacement: lead + parsed.data.replacement + trail,
    },
  };
}

/**
 * Deterministic stand-in for a model: keeps the selected text and appends the
 * instruction as a visible marker, so diff, apply and reject can be exercised
 * without claiming any real rewriting.
 */
export function createMockEdit({
  instruction,
  selectionText,
}: EditContext): Edit {
  return {
    replacement: `${selectionText.trim()}（模拟修改：${instruction}）`,
    explanation:
      "模拟模式未调用模型：只在原文后标注修改要求，用于演示差异、应用与拒绝。",
    evidenceGaps: [],
  };
}
