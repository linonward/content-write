import Link from "next/link";
import { ui } from "@/lib/styles";
import { OutlineWorkspace } from "@/modules/articles/client/outline-workspace";
import { LogoutButton } from "@/modules/identity/client/logout-button";

export default async function ArticlePage({
  params,
}: PageProps<"/articles/[id]">) {
  const { id } = await params;
  return (
    <main className={ui.shell}>
      <header className={`${ui.header} justify-between`}>
        <Link className={ui.brand} href="/home">
          <span className={ui.mark}>文</span>
          <span>公众号内容工作台</span>
        </Link>
        <LogoutButton />
      </header>
      <section className="pt-16 pb-8 max-[680px]:pt-[60px]">
        <p className={ui.stage}>文章大纲</p>
        <h1 className="text-[clamp(32px,5vw,48px)] leading-[1.18] tracking-[-0.04em]">
          从想法到结构。
        </h1>
        <Link
          href="/articles"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          返回文章列表
        </Link>
      </section>
      <OutlineWorkspace id={id} />
    </main>
  );
}
