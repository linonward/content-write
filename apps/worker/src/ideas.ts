import { z } from "zod";

export type IdeaSource = {
  id: string;
  title: string;
  version: number;
  summary: string;
  angle: string;
  claim: string;
};

const ideaSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  audience: z.string().trim().min(1).max(200),
  thesis: z.string().trim().min(1).max(500),
  rationale: z.string().trim().min(1).max(2000),
  materialIds: z.array(z.string()).min(1).max(10),
  evidenceGaps: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
  suggestedStructure: z.array(z.string().trim().min(1).max(200)).min(2).max(8),
});

export const ideaBatchSchema = z.array(ideaSchema).min(3).max(5);
export type GeneratedIdea = z.infer<typeof ideaSchema>;

export function validateIdeas(input: unknown, sources: IdeaSource[]) {
  const parsed = ideaBatchSchema.safeParse(input);
  if (!parsed.success) return parsed;
  const ids = new Set(sources.map((source) => source.id));
  if (
    parsed.data.some(
      (idea) =>
        new Set(idea.materialIds).size !== idea.materialIds.length ||
        idea.materialIds.some((id) => !ids.has(id)),
    )
  ) {
    return {
      success: false as const,
      error: new Error("Idea references an unselected source"),
    };
  }
  return parsed;
}

// Development adapter: reorganizes user-provided summaries without adding factual claims.
export function createMockIdeas(sources: IdeaSource[]): GeneratedIdea[] {
  if (sources.length < 1 || sources.length > 10)
    throw new Error("Expected 1–10 analyzed sources");
  const titles = [
    "从素材出发的写作角度",
    "值得进一步验证的问题",
    "给读者的实践线索",
  ];
  return titles.map((prefix, index) => {
    const source = sources[index % sources.length];
    const materialIds = sources.map((item) => item.id);
    return {
      title: `${prefix}：${source.angle || source.title}`.slice(0, 200),
      audience: "希望从这些素材获得可核对经验的读者",
      thesis:
        `可以围绕「${source.claim || source.summary}」提出待验证的观点。`.slice(
          0,
          500,
        ),
      rationale: `选定素材提供了以下写作起点：${sources
        .map(
          (item) =>
            `「${item.title}」（版本 ${item.version}）记录“${item.summary.slice(0, 80)}”`,
        )
        .join("；")}。这些是来源摘要，发布前仍需核对。`.slice(0, 2000),
      materialIds,
      evidenceGaps: [
        "核对来源说法的事实依据、适用范围和时间。",
        "补充作者愿意公开的真实经历或实例。",
      ],
      suggestedStructure: [
        "提出读者关心的问题",
        "逐条对照来源材料",
        "说明证据缺口与下一步验证",
      ],
    };
  });
}
