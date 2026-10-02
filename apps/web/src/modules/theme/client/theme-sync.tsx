"use client";

import { useLayoutEffect } from "react";
import { reapplyStoredTheme, useTheme } from "./theme-store";

/** 根布局中挂载：保持 html[data-theme] 与本机选择一致（含其他标签页的修改）。 */
export function ThemeSync() {
  useTheme();
  useLayoutEffect(() => {
    reapplyStoredTheme();
  }, []);
  return null;
}
