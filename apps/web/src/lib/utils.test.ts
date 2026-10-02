import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps type roles and text colors in separate groups", () => {
    expect(cn("text-body text-ink", "text-meta")).toBe("text-ink text-meta");
    expect(cn("text-ink-2 text-body", "text-danger")).toBe(
      "text-body text-danger",
    );
    expect(cn("shadow-float", "rounded-sm rounded-md")).toBe(
      "shadow-float rounded-md",
    );
  });
});
