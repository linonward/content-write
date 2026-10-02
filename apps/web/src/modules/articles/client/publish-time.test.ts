import { describe, expect, it } from "vitest";
import { formatLocalTime, parseLocalTime } from "./publish-time";

describe("publish time", () => {
  it("round-trips the form format in local time", () => {
    const date = new Date(2026, 9, 2, 20, 30);
    expect(formatLocalTime(date)).toBe("2026/10/02 20:30");
    expect(parseLocalTime("2026/10/02 20:30")?.getTime()).toBe(date.getTime());
    expect(parseLocalTime(" 2026-10-2 8:05 ")?.getTime()).toBe(
      new Date(2026, 9, 2, 8, 5).getTime(),
    );
  });

  it("rejects other formats and impossible dates", () => {
    for (const text of [
      "",
      "2026/10/02",
      "20:30",
      "2026/02/30 10:00",
      "2026/10/02 24:00",
      "昨天晚上",
    ])
      expect(parseLocalTime(text)).toBeNull();
  });
});
