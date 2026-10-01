import { z } from "zod";

const spanSchema = z.strictObject({
  id: z.string().min(1).max(40),
  quote: z.string().min(1),
  start: z.int().nonnegative(),
  end: z.int().positive(),
});

export const analysisSchema = z.strictObject({
  summary: z.string().min(1).max(500),
  tags: z.array(z.string().min(1).max(30)).max(8),
  claims: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(500),
        kind: z.enum(["source_claim", "author_opinion"]),
        evidenceIds: z.array(z.string()).min(1).max(12),
      }),
    )
    .max(10),
  angles: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(120),
        rationale: z.string().min(1).max(500),
      }),
    )
    .max(5),
  evidenceSpans: z.array(spanSchema).max(12),
});

export type MaterialAnalysis = z.infer<typeof analysisSchema>;

export function validateAnalysis(content: string, input: unknown) {
  const parsed = analysisSchema.safeParse(input);
  if (!parsed.success) return parsed;
  const spans = parsed.data.evidenceSpans;
  const ids = new Set(spans.map((span) => span.id));
  if (
    ids.size !== spans.length ||
    spans.some(
      (span) =>
        span.end <= span.start ||
        content.slice(span.start, span.end) !== span.quote,
    ) ||
    parsed.data.claims.some((claim) =>
      claim.evidenceIds.some((id) => !ids.has(id)),
    )
  ) {
    return {
      success: false as const,
      error: new Error("Analysis evidence does not match the source"),
    };
  }
  return parsed;
}

// Deterministic development adapter. It copies source text; no factual inference is claimed.
export function createMockAnalysis(content: string): MaterialAnalysis {
  const trimmed = content.trim();
  const start = content.indexOf(trimmed);
  const sentenceEnd = trimmed.search(/[。！？.!?\n]/);
  const length = Math.min(
    sentenceEnd >= 0 ? sentenceEnd + 1 : trimmed.length,
    180,
  );
  const quote = trimmed.slice(0, length);
  return {
    summary: trimmed.slice(0, 500),
    tags: [],
    claims: [{ text: quote, kind: "source_claim", evidenceIds: ["e1"] }],
    angles: [
      {
        title: "从这条素材展开写作",
        rationale: `围绕来源片段「${quote.slice(0, 80)}」展开，并补充事实核验。`,
      },
    ],
    evidenceSpans: [{ id: "e1", quote, start, end: start + quote.length }],
  };
}
