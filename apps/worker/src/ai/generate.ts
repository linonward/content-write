import type { AuthorProfile } from "@content-write/db/author-profile";
import type { FrameworkSnapshot } from "@content-write/db/framework";
import type { ConfirmedMemory } from "@content-write/db/memories";
import type { BreakdownResult } from "@content-write/db/schema";
import type { StyleSample } from "@content-write/db/writing-samples";
import {
  createMockAnalysis,
  type MaterialAnalysis,
  validateAnalysis,
} from "../analysis";
import {
  createMockBreakdown,
  locateBreakdown,
  validateBreakdown,
} from "../breakdown";
import {
  createMockDraft,
  type Draft,
  type DraftContext,
  validateDraft,
} from "../draft";
import {
  createMockEdit,
  type Edit,
  type EditContext,
  validateEdit,
} from "../edit";
import { TerminalJobError } from "../failures";
import {
  createMockIdeas,
  type GeneratedIdea,
  type IdeaSource,
  validateIdeas,
} from "../ideas";
import {
  createMockMemories,
  locateMemories,
  type MemoryExtraction,
  sampleLabel,
  validateMemories,
} from "../memories";
import {
  type Brief,
  createMockFrameworkOutline,
  createMockOutline,
  type Outline,
  type OutlineSource,
  validateOutline,
} from "../outline";
import { avoidingBannedWords, withProfile } from "../profile";
import {
  copiedRun,
  REFERENCE_COPIED,
  type ReferenceText,
  withoutReferenceCopy,
} from "../reference-copy";
import { type AiMode, aiMode } from "./config";
import {
  type DeepSeekDeps,
  generateJson,
  type ParseResult,
  type Usage,
} from "./deepseek";
import {
  analysisMessages,
  breakdownMessages,
  draftMessages,
  editMessages,
  ideasMessages,
  memoryMessages,
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

/** Mock output is deterministic and cannot be repaired: a copied run fails the job. */
function refuseReferenceCopy(
  reference: ReferenceText | null,
  texts: string[],
  allowed: string[] = [],
) {
  if (reference && copiedRun(reference, texts, allowed))
    throw new TerminalJobError(REFERENCE_COPIED);
}

/** Every text of an outline: with a framework, none may carry the reference original. */
const outlineTexts = (outline: Outline) => [
  outline.workingTitle,
  outline.audience,
  outline.thesis,
  ...outline.sections.flatMap((section) => [
    section.heading,
    section.purpose,
    ...section.keyPoints,
    ...section.missingEvidence,
  ]),
];

const draftTexts = (draft: Draft) => [
  draft.title,
  draft.markdown,
  ...draft.sourceMap.map((entry) => entry.claim),
  ...draft.evidenceGaps,
];

const editTexts = (edit: Edit) => [
  edit.replacement,
  edit.explanation,
  ...edit.evidenceGaps,
];

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
  profile: AuthorProfile | null = null,
  deps?: DeepSeekDeps,
  samples: StyleSample[] = [],
  memories: ConfirmedMemory[] = [],
): Promise<Generated<GeneratedIdea[]>> {
  const mode = requireMode();
  if (mode === "mock")
    return { output: createMockIdeas(sources), meta: { mode, usage: null } };
  const { data, usage } = await generateJson(
    "idea_generation",
    withProfile(ideasMessages(sources), profile, samples, memories),
    avoidingBannedWords(
      (value) =>
        asParse(
          validateIdeas((value as { ideas?: unknown } | null)?.ideas, sources),
        ),
      profile,
      (ideas) => ideas.flatMap((idea) => [idea.title, idea.thesis]),
    ),
    deps,
  );
  return { output: data, meta: { mode, usage } };
}

export async function generateOutline(
  brief: Brief,
  sources: OutlineSource[],
  framework: FrameworkSnapshot | null = null,
  profile: AuthorProfile | null = null,
  deps?: DeepSeekDeps,
  samples: StyleSample[] = [],
  memories: ConfirmedMemory[] = [],
  reference: ReferenceText | null = null,
): Promise<Generated<Outline>> {
  const mode = requireMode();
  if (mode === "mock") {
    const output = framework
      ? createMockFrameworkOutline(brief, sources, framework)
      : createMockOutline(brief, sources);
    refuseReferenceCopy(reference, outlineTexts(output));
    return { output, meta: { mode, usage: null } };
  }
  const { data, usage } = await generateJson(
    "outline_generation",
    withProfile(
      outlineMessages(
        brief,
        sources.map((source) => ({
          ...source,
          evidence:
            source.evidence ??
            source.evidenceIds.map((id) => ({ id, quote: "" })),
        })),
        framework,
      ),
      profile,
      samples,
      memories,
    ),
    avoidingBannedWords(
      withoutReferenceCopy(
        (value) => asParse(validateOutline(value, sources, framework)),
        reference,
        outlineTexts,
      ),
      profile,
      (outline) => [
        outline.workingTitle,
        outline.thesis,
        ...outline.sections.flatMap((section) => [
          section.heading,
          ...section.keyPoints,
        ]),
      ],
    ),
    deps,
  );
  return { output: data, meta: { mode, usage } };
}

export async function generateDraft(
  context: DraftContext,
  profile: AuthorProfile | null = null,
  deps?: DeepSeekDeps,
  samples: StyleSample[] = [],
  memories: ConfirmedMemory[] = [],
  reference: ReferenceText | null = null,
): Promise<Generated<Draft>> {
  const mode = requireMode();
  if (mode === "mock") {
    const output = createMockDraft(context);
    refuseReferenceCopy(reference, draftTexts(output));
    return { output, meta: { mode, usage: null } };
  }
  const { data, usage } = await generateJson(
    "draft_generation",
    withProfile(draftMessages(context), profile, samples, memories),
    avoidingBannedWords(
      withoutReferenceCopy(
        (value) => asParse(validateDraft(value, context.sources)),
        reference,
        draftTexts,
      ),
      profile,
      (draft) => [draft.title, draft.markdown],
    ),
    deps,
  );
  return { output: data, meta: { mode, usage } };
}

export async function generateBreakdown(
  title: string,
  content: string,
  deps?: DeepSeekDeps,
): Promise<Generated<BreakdownResult>> {
  const mode = requireMode();
  if (mode === "mock")
    return {
      output: createMockBreakdown(content),
      meta: { mode, usage: null },
    };
  const { data, usage } = await generateJson(
    "reference_breakdown",
    breakdownMessages(title, content),
    (value) =>
      asParse(validateBreakdown(content, locateBreakdown(content, value))),
    deps,
  );
  return { output: data, meta: { mode, usage } };
}

export async function generateEdit(
  context: EditContext,
  deps?: DeepSeekDeps,
  samples: StyleSample[] = [],
  profile: AuthorProfile | null = null,
  memories: ConfirmedMemory[] = [],
  reference: ReferenceText | null = null,
): Promise<Generated<Edit>> {
  const mode = requireMode();
  // Runs already in the selection are the author's own text, not the model's doing.
  const own = [context.selectionText];
  if (mode === "mock") {
    const output = createMockEdit(context);
    refuseReferenceCopy(reference, editTexts(output), own);
    return { output, meta: { mode, usage: null } };
  }
  const { data, usage } = await generateJson(
    "edit_suggestion",
    withProfile(editMessages(context), profile, samples, memories),
    avoidingBannedWords(
      withoutReferenceCopy(
        (value) => asParse(validateEdit(value, context.selectionText)),
        reference,
        editTexts,
        own,
      ),
      profile,
      (edit) => [edit.replacement],
    ),
    deps,
  );
  return { output: data, meta: { mode, usage } };
}

export async function generateMemories(
  samples: StyleSample[],
  deps?: DeepSeekDeps,
): Promise<Generated<MemoryExtraction>> {
  const mode = requireMode();
  if (mode === "mock")
    return { output: createMockMemories(samples), meta: { mode, usage: null } };
  const { data, usage } = await generateJson(
    "memory_extraction",
    memoryMessages(
      samples.map((sample, index) => ({
        label: sampleLabel(index),
        title: sample.title,
        content: sample.content,
      })),
    ),
    (value) =>
      asParse(validateMemories(samples, locateMemories(samples, value))),
    deps,
  );
  return { output: data, meta: { mode, usage } };
}
