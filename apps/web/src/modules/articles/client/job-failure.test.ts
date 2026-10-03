import { describe, expect, it } from "vitest";
import { jobFailureMessage } from "./job-failure";

describe("jobFailureMessage", () => {
  it("explains a result dropped for carrying the reference original", () => {
    const message = jobFailureMessage(
      "REFERENCE_COPIED",
      "初稿生成失败，请重试。",
    );
    expect(message).toContain("参考文章的原文");
    expect(message).toContain("没有保存");
  });

  it("keeps the caller's wording for other failures", () => {
    for (const code of ["AI_OUTPUT_INVALID", "DRAFT_GENERATION_FAILED", null])
      expect(jobFailureMessage(code, "初稿生成失败，请重试。")).toBe(
        "初稿生成失败，请重试。",
      );
  });
});
