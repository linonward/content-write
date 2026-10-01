/** A failure that another attempt cannot fix, such as missing model configuration. */
export class TerminalJobError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "TerminalJobError";
  }
}

const failureCodes: Record<string, string> = {
  material_analysis: "ANALYSIS_FAILED",
  idea_generation: "IDEA_GENERATION_FAILED",
  outline_generation: "OUTLINE_GENERATION_FAILED",
  draft_generation: "DRAFT_GENERATION_FAILED",
};

// `reason` is only a category for logs; messages may quote model output and are never logged.
export function describeFailure(kind: string, error: unknown) {
  if (error instanceof TerminalJobError)
    return { code: error.code, terminal: true, reason: "terminal" };
  return {
    code: failureCodes[kind] ?? "JOB_FAILED",
    terminal: false,
    reason: error instanceof Error ? error.name : typeof error,
  };
}
