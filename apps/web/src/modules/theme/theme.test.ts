import { describe, expect, it } from "vitest";
import { parseTheme, THEME_STORAGE_KEY, themeScript } from "./theme";

describe("theme", () => {
  it("falls back to system for missing or unknown values", () => {
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("sepia")).toBe("system");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
  });

  it("head script reads the same storage key and only applies explicit choices", () => {
    expect(themeScript).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(themeScript).toContain('t==="light"||t==="dark"');
  });
});
