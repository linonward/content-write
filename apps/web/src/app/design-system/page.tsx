import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Showcase } from "./showcase";

export const metadata: Metadata = { title: "设计系统 · 拆写" };

// 只在开发环境用于与设计稿“01 组件”逐项比对；生产环境不存在这个页面。
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Showcase />;
}
