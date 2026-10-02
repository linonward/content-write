import { describe, expect, it } from "vitest";
import { editDiff } from "./edit-diff";

describe("editDiff", () => {
  it("marks removed and added characters and keeps the rest", () => {
    const parts = editDiff("我们今天要讨论写作。", "今天讨论写作习惯。");
    expect(parts).not.toBeNull();
    const removed = parts
      ?.filter((part) => part.kind === "removed")
      .map((part) => part.text)
      .join("");
    const added = parts
      ?.filter((part) => part.kind === "added")
      .map((part) => part.text)
      .join("");
    expect(removed).toContain("我们");
    expect(added).toContain("习惯");
    // Reassembling either side gives back the original texts.
    expect(
      parts
        ?.filter((part) => part.kind !== "added")
        .map((part) => part.text)
        .join(""),
    ).toBe("我们今天要讨论写作。");
    expect(
      parts
        ?.filter((part) => part.kind !== "removed")
        .map((part) => part.text)
        .join(""),
    ).toBe("今天讨论写作习惯。");
  });

  it("reports identical text as a single unchanged part", () => {
    expect(editDiff("不变", "不变")).toEqual([
      { kind: "same", text: "不变", key: "same:0:0" },
    ]);
  });
});
