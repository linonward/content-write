import type { Metadata } from "next";
import { Noto_Serif_SC } from "next/font/google";
import "./globals.css";

// 宋体只用于标题与阅读区：自托管、按 unicode-range 分片、不预加载，
// 首屏可能先以系统宋体显示，换来不阻塞的加载（docs/design-system.md 第 3 节）。
const serif = Noto_Serif_SC({
  weight: ["400", "600"],
  display: "swap",
  preload: false,
  variable: "--font-noto-serif-sc",
});

export const metadata: Metadata = {
  title: "拆写",
  description: "看懂一篇爆款，写出你自己的那篇。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={serif.variable}>
      <body>{children}</body>
    </html>
  );
}
