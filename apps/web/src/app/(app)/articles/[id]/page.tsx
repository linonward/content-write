import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ui } from "@/lib/styles";
import { OutlineWorkspace } from "@/modules/articles/client/outline-workspace";
import { AppHeader } from "@/modules/shell/client/app-header";

export default async function ArticlePage({
  params,
}: PageProps<"/articles/[id]">) {
  const { id } = await params;
  return (
    <main className={ui.shell}>
      <AppHeader />
      <section className={ui.pageIntro}>
        <p className={ui.stage}>文章</p>
        <h1 className={ui.pageTitle}>从结构到初稿。</h1>
        <div className="flex items-center gap-4">
          <Link href="/articles" className={ui.textLink}>
            返回文章列表
          </Link>
          <Link
            href={`/articles/${id}/preview`}
            className={buttonVariants({ variant: "secondary" })}
          >
            预览
          </Link>
        </div>
      </section>
      <OutlineWorkspace id={id} />
    </main>
  );
}
