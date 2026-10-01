import { describe, expect, it } from "vitest";
import { describeFailure, TerminalJobError } from "./failures";

describe("job failures", () => {
  it("marks configuration errors terminal and keeps the kind's code otherwise", () => {
    expect(
      describeFailure(
        "material_analysis",
        new TerminalJobError("AI_NOT_CONFIGURED"),
      ),
    ).toEqual({
      code: "AI_NOT_CONFIGURED",
      terminal: true,
      reason: "terminal",
    });
    expect(
      describeFailure("idea_generation", new Error("Invalid output")),
    ).toEqual({
      code: "IDEA_GENERATION_FAILED",
      terminal: false,
      reason: "Error",
    });
    expect(describeFailure("unknown_kind", "boom")).toEqual({
      code: "JOB_FAILED",
      terminal: false,
      reason: "string",
    });
  });
});
