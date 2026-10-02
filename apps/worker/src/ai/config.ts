export type AiMode = "mock" | "deepseek";
export type GenerationKind =
  | "material_analysis"
  | "idea_generation"
  | "outline_generation"
  | "draft_generation"
  | "reference_breakdown"
  | "edit_suggestion"
  | "memory_extraction";

/** Configured generation mode; anything else means generation is unavailable. */
export function aiMode(): AiMode | null {
  const mode = process.env.AI_MODE;
  if (mode === "mock") return "mock";
  if (mode === "deepseek" && process.env.AI_API_KEY) return "deepseek";
  return null;
}

export type ThinkingSetting =
  | { reasoning_effort: "low" | "high" | "max" }
  | { thinking: { type: "disabled" } };

export type KindSettings = {
  thinking: ThinkingSetting;
  /** Includes the reasoning budget: thinking tokens count against max_tokens. */
  maxTokens: number;
  /** Budget used for the single repair attempt after empty or truncated output. */
  repairMaxTokens: number;
};

/**
 * One place for per-kind model settings. Structured extraction benefits from
 * low-effort reasoning; long-form drafting disables it to bound latency.
 */
export const kindSettings: Record<GenerationKind, KindSettings> = {
  material_analysis: {
    thinking: { reasoning_effort: "low" },
    maxTokens: 8_000,
    repairMaxTokens: 16_000,
  },
  idea_generation: {
    thinking: { reasoning_effort: "low" },
    maxTokens: 8_000,
    repairMaxTokens: 16_000,
  },
  outline_generation: {
    thinking: { reasoning_effort: "low" },
    maxTokens: 8_000,
    repairMaxTokens: 16_000,
  },
  // Long reference articles and up to ten slots with quotes need more room than material analysis.
  reference_breakdown: {
    thinking: { reasoning_effort: "low" },
    maxTokens: 12_000,
    repairMaxTokens: 20_000,
  },
  draft_generation: {
    thinking: { thinking: { type: "disabled" } },
    maxTokens: 6_000,
    repairMaxTokens: 10_000,
  },
  // Three 2,000-character excerpts in, at most eight short preferences with quotes out.
  memory_extraction: {
    thinking: { reasoning_effort: "low" },
    maxTokens: 8_000,
    repairMaxTokens: 16_000,
  },
  // A selection is at most 8,000 characters; the replacement may be somewhat longer.
  edit_suggestion: {
    thinking: { thinking: { type: "disabled" } },
    maxTokens: 12_000,
    repairMaxTokens: 16_000,
  },
};

export function deepseekModel() {
  return process.env.AI_MODEL || "deepseek-flash";
}

export function deepseekBaseUrl() {
  return process.env.AI_BASE_URL || "https://api.deepseek.com";
}

export function requestTimeoutMs() {
  const value = Number(process.env.AI_REQUEST_TIMEOUT_MS);
  return Number.isSafeInteger(value) && value > 0 ? value : 120_000;
}
