import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "公众号内容工作台",
  description: "把自己的素材整理成有个人表达的文章。",
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
