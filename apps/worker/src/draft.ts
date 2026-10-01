import { z } from "zod";
import type { Brief, Outline } from "./outline";

const text = (max: number) => z.string().trim().min(1).max(max);
export const draftSchema = z.strictObject({
  title: text(200),
  markdown: z.string().trim().min(1).max(50_000),
  sourceMap: z
    .array(
      z.strictObject({
        claim: text(500),
        materialId: text(200),
        materialVersion: z.int().positive(),
        evidenceIds: z.array(text(200)).min(1).max(12),
      }),
    )
    .max(60),
  evidenceGaps: z.array(text(300)).max(30),
});

export type Draft = z.infer<typeof draftSchema>;
export type DraftSource = {
  id: string;
  version: number;
  title: string;
  summary: string;
  evidence: { id: string; quote: string }[];
};
export type DraftContext = {
  brief: Brief;
  outline: Outline;
  sources: DraftSource[];
};

/** Structure plus provenance: every mapping must point at a pinned source revision and its spans. */
export function validateDraft(input: unknown, sources: DraftSource[]) {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return parsed;
  const pinned = new Map(sources.map((source) => [source.id, source]));
  const traceable = parsed.data.sourceMap.every((entry) => {
    const source = pinned.get(entry.materialId);
    const spans = new Set(source?.evidence.map((span) => span.id));
    return (
      source?.version === entry.materialVersion &&
      entry.evidenceIds.every((id) => spans.has(id))
    );
  });
  if (!traceable)
    return {
      success: false as const,
      error: new Error("Draft maps claims to unknown sources"),
    };
  return parsed;
}

/**
 * Deterministic stand-in for a model: arranges the confirmed outline and quoted
 * source spans into prose without adding facts, and lists every open gap.
 */
export function createMockDraft({
  brief,
  outline,
  sources,
}: DraftContext): Draft {
  const pinned = new Map(sources.map((source) => [source.id, source]));
  const sourceMap: Draft["sourceMap"] = [];
  const parts = [
    `这篇文章写给${brief.audience}。核心主张是：${brief.thesis}`,
    "以下内容按已确认的大纲整理，引用部分来自素材原文，其余判断仍需作者核对。",
  ];
  for (const section of outline.sections) {
    parts.push(`## ${section.heading}`, section.purpose);
    parts.push(...section.keyPoints);
    for (const evidenceId of section.evidenceIds) {
      const [materialId, spanId] = evidenceId.split(":");
      const source = pinned.get(materialId);
      const span = source?.evidence.find((item) => item.id === spanId);
      if (!source || !span) continue;
      parts.push(`> ${span.quote}\n>\n> ——《${source.title}》`);
      sourceMap.push({
        claim: section.keyPoints[0] ?? section.heading,
        materialId,
        materialVersion: source.version,
        evidenceIds: [spanId],
      });
    }
    for (const gap of section.missingEvidence)
      parts.push(`（待补证据：${gap}）`);
  }
  return {
    title: outline.workingTitle,
    markdown: parts.join("\n\n"),
    sourceMap: sourceMap.slice(0, 60),
    evidenceGaps: [
      ...new Set(
        outline.sections.flatMap((section) => section.missingEvidence),
      ),
    ].slice(0, 30),
  };
}
