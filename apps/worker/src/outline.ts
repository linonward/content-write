import { citesOnlySourceEvidence } from "@content-write/db/article-sources";
import {
  type FrameworkSnapshot,
  slotsMatch,
} from "@content-write/db/framework";
import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
export const outlineSchema = z.strictObject({
  workingTitle: text(200),
  audience: text(200),
  thesis: text(500),
  sections: z
    .array(
      z.strictObject({
        heading: text(200),
        purpose: text(500),
        keyPoints: z.array(text(500)).min(1).max(8),
        evidenceIds: z.array(text(200)).max(12),
        missingEvidence: z.array(text(300)).max(8),
        slotId: text(40).optional(),
      }),
    )
    .min(2)
    .max(10),
});

export type Outline = z.infer<typeof outlineSchema>;
export type OutlineSource = {
  id: string;
  title: string;
  summary: string;
  evidenceIds: string[];
  /** Span quotes for model prompts; validation only needs the ids. */
  evidence?: { id: string; quote: string }[];
};
export type Brief = Pick<Outline, "workingTitle" | "audience" | "thesis">;

/**
 * Evidence must come from the article's own sources. With a framework, a
 * generated outline fills every slot once, in order (gaps stay as sections).
 */
export function validateOutline(
  input: unknown,
  sources: OutlineSource[],
  framework: FrameworkSnapshot | null = null,
) {
  const parsed = outlineSchema.safeParse(input);
  if (!parsed.success) return parsed;
  if (!citesOnlySourceEvidence(parsed.data.sections, sources)) {
    return {
      success: false as const,
      error: new Error("Outline cites unknown evidence"),
    };
  }
  if (!slotsMatch(parsed.data.sections, framework, { complete: true })) {
    return {
      success: false as const,
      error: new Error(
        framework
          ? "sections 必须与框架槽位一一对应、按顺序排列，每节填写 slotId"
          : "Outline names slots without a framework",
      ),
    };
  }
  return parsed;
}

/**
 * Deterministic framework outline: one section per slot, citing the sources'
 * spans in turn. Slots left without evidence are marked as gaps, not filled.
 */
export function createMockFrameworkOutline(
  brief: Brief,
  sources: OutlineSource[],
  framework: FrameworkSnapshot,
): Outline {
  const evidence = sources.flatMap((source) =>
    source.evidenceIds.map((id) => `${source.id}:${id}`),
  );
  return {
    ...brief,
    sections: framework.slots.map((slot, index) => ({
      heading: slot.name,
      purpose: slot.purpose,
      keyPoints: [`用你的素材完成：${slot.purpose}`.slice(0, 500)],
      evidenceIds: evidence[index] ? [evidence[index]] : [],
      missingEvidence: evidence[index]
        ? []
        : [`素材中没有支撑「${slot.name}」的内容，可补充素材或删除这一节。`],
      slotId: slot.id,
    })),
  };
}

export function createMockOutline(
  brief: Brief,
  sources: OutlineSource[],
): Outline {
  if (!sources.length) throw new Error("Outline requires sources");
  const first = sources[0];
  return {
    ...brief,
    sections: [
      {
        heading: "读者问题与文章主张",
        purpose: `说明「${brief.audience}」关心的问题，并提出待核对的主张。`,
        keyPoints: [brief.thesis],
        evidenceIds: [],
        missingEvidence: ["补充读者问题的真实场景。"],
      },
      ...sources.map((source) => ({
        heading: `核对素材：${source.title}`.slice(0, 200),
        purpose: `围绕来源摘要核对观点：${source.summary}`.slice(0, 500),
        keyPoints: [`说明「${source.title}」能支持什么，以及不能支持什么。`],
        evidenceIds: source.evidenceIds
          .slice(0, 2)
          .map((id) => `${source.id}:${id}`),
        missingEvidence: ["核对来源说法的适用范围与时效。"],
      })),
      {
        heading: "结论与待补证据",
        purpose: "收束文章，并明确尚未核实的事实。",
        keyPoints: [`回到文章主张：${brief.thesis}`],
        evidenceIds: first.evidenceIds
          .slice(0, 1)
          .map((id) => `${first.id}:${id}`),
        missingEvidence: ["补充作者愿意公开的真实经验或实例。"],
      },
    ].slice(0, 10),
  };
}
