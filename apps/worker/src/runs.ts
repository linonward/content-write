import type { RunMeta } from "./ai/generate";

/** ai_runs columns for one job; mock runs have no token usage. */
export function runUsage(meta: RunMeta) {
  return {
    mode: meta.mode,
    inputTokens: meta.usage?.inputTokens ?? null,
    outputTokens: meta.usage?.outputTokens ?? null,
    reasoningTokens: meta.usage?.reasoningTokens ?? null,
  };
}

export const mockRun: RunMeta = { mode: "mock", usage: null };
