"use client";

import { useSyncExternalStore } from "react";
import {
  applyTheme,
  parseTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "../theme";

const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // 其他标签页改了主题时同步本页。
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyTheme(document.documentElement, readTheme());
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 存储不可用时仍切换本页，只是不记住。
  }
  applyTheme(document.documentElement, theme);
  for (const listener of listeners) listener();
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "system");
}

/** 开发模式下 Strict Mode 重挂载会清掉 html 上脚本写入的属性，这里在绘制前补回；生产环境无变化。 */
export function reapplyStoredTheme() {
  applyTheme(document.documentElement, readTheme());
}
