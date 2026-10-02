import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/identity/server/session";
import { LandingPage } from "@/modules/landing/landing-page";

const description =
  "贴入一篇爆款，拆出它的结构与写法；再用你自己的素材按这个结构写，每一句都标出出处。邀请制试用准备中。";

export const metadata: Metadata = {
  title: "拆写 · 看懂一篇爆款，写出你自己的那篇",
  description,
  openGraph: {
    title: "拆写",
    description,
    type: "website",
    locale: "zh_CN",
  },
};

// 未登录显示落地页；已登录直接进入首页。
export default async function IndexPage() {
  const session = await getCurrentSession();
  if (session) redirect("/home");
  return <LandingPage />;
}
