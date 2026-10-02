/**
 * 颜色主题：用户可选跟随系统、浅色、深色，按设备存本地。
 * 跟随系统时 html 不带 data-theme，由 CSS 的 color-scheme: light dark 交给浏览器；
 * 选了浅色或深色时写入 html[data-theme]（见 app/globals.css）。
 */
export const THEME_STORAGE_KEY = "content-write:theme";

export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];

export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/** 在 <head> 中同步执行，首次绘制前写入用户选择；与 applyTheme 的规则保持一致。 */
export const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function applyTheme(root: HTMLElement, theme: Theme) {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
