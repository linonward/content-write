import {
  createMockAnalysis,
  type MaterialAnalysis,
  validateAnalysis,
} from "../analysis";
import {
  createMockDraft,
  type Draft,
  type DraftContext,
  validateDraft,
} from "../draft";
import { TerminalJobError } from "../failures";
import {
  createMockIdeas,
  type GeneratedIdea,
  type IdeaSource,
  validateIdeas,
} from "../ideas";
import {
  type Brief,
  createMockOutline,
  type Outline,
  type OutlineSource,
  validateOutline,
} from "../outline";
import { type AiMode, aiMode } from "./config";
import {
  type DeepSeekDeps,
  generateJson,
  type ParseResult,
  type Usage,
} from "./deepseek";
import {
  analysisMessages,
  draftMessages,
  ideasMessages,
  outlineMessages,
} from "./prompts";

export type RunMeta = { mode: AiMode; usage: Usage | null };
export type Generated<T> = { output: T; meta: RunMeta };

function requireMode(): AiMode {
  const mode = aiMode();
  if (!mode) throw new TerminalJobError("AI_NOT_CONFIGURED");
  return mode;
}

function asParse<T>(
  result: { success: true; data: T } | { success: false; error: unknown },
): ParseResult<T> {
  return result.success
    ? { success: true, data: result.data }
    : {
        success: false,
        error:
          result.error instanceof Error
            ? result.error.message.slice(0, 300)
            : "结构不符合要求",
      };
}

/**
 * The model copies quotes but cannot count UTF-16 offsets, so positions are
 * located here. Quotes that are not verbatim are dropped instead of guessed,
 * and claims lose references to dropped spans.
 */
export function locateAnalysis(content: string, value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const raw = value as {
    evidenceSpans?: { id?: unknown; quote?: unknown }[];
    claims?: { text?: unknown; kind?: unknown; evidenceIds?: unknown }[];
  };
  const spans = (Array.isArray(raw.evidenceSpans) ? raw.evidenceSpans : [])
    .map((span) => {
      if (typeof span?.id !== "string" || typeof span.quote !== "string")
        return null;
      const quote = span.quote.trim();
      const start = quote ? content.indexOf(quote) : -1;
      return start < 0
        ? null
        : { id: span.id, quote, start, end: start + quote.length };
    })
    .filter((span) => span !== null)
    .slice(0, 12);
  const ids = new Set(spans.map((span) => span.id));
  const claims = (Array.isArray(raw.claims) ? raw.claims : [])
    .map((claim) => ({
      ...claim,
      evidenceIds: (Array.isArray(claim?.evidenceIds)
        ? claim.evidenceIds
        : []
      ).filter((id): id is string => typeof id === "string" && ids.has(id)),
    }))
    .filter((claim) => claim.evidenceIds.length > 0);
  return { ...value, evidenceSpans: spans, claims };
}

export async function generateAnalysis(
  content: string,
  deps?: DeepSeekDeps,
): Promise<Generated<MaterialAnalysis>> {
  const mode = requireMode();
  if (mode === "mock")
    return { output: createMockAnalysis(content), meta: { mode, usage: null } };
  const { data, usage } = await generateJson(
    "material_analysis",
    analysisMessages(content),
    (value) =>
      asParse(validateAnalysis(content, locateAnalysis(content, value))),
    deps,
  );
  return { output: data, meta: { mode, usage } };
}

export async function generateIdeas(
  sources: IdeaSource[],
  deps?: DeepSeekDeps,
): Promise<Generated<GeneratedIdea[]>> {
  const mode = requireMode();
  if (mode === "mock")
    return { output: createMockIdeas(sources), meta: { mode, usage: null } };
  const { data, usage } = await generateJson(
    "idea_generation",
    ideasMessages(sources),
    (value) =>
      asParse(
        validateIdeas((value as { ideas?: unknown } | null)?.ideas, sources),
      ),
    deps,
  );
  return { output: data, meta: { mode, usage } };
}

export async function generateOutline(
  brief: Brief,
  sources: OutlineSource[],
  deps?: DeepSeekDeps,
): Promise<Generated<Outline>> {
  const mode = requireMode();
  if (mode === "mock")
    return {
      output: createMockOutline(brief, sources),
      meta: { mode, usage: null },
    };
  const { data, usage } = await generateJson(
    "outline_generation",
    outlineMessages(
      brief,
      sources.map((source) => ({
        ...source,
        evidence:
          source.evidence ??
          source.evidenceIds.map((id) => ({ id, quote: "" })),
      })),
    ),
    (value) => asParse(validateOutline(value, sources)),
    deps,
  );
  return { output: data, meta: { mode, usage } };
}

export async function generateDraft(
  context: DraftContext,
  deps?: DeepSeekDeps,
): Promise<Generated<Draft>> {
  const mode = requireMode();
  if (mode === "mock")
    return { output: createMockDraft(context), meta: { mode, usage: null } };
  const { data, usage } = await generateJson(
    "draft_generation",
    draftMessages(context),
    (value) => asParse(validateDraft(value, context.sources)),
    deps,
  );
  return { output: data, meta: { mode, usage } };
}
