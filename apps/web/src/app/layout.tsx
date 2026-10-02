import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "拆写",
  description: "看懂一篇爆款，写出你自己的那篇。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="[color-scheme:light]">
      <body>{children}</body>
    </html>
  );
}
