import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ui } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { OutlineWorkspace } from "@/modules/articles/client/outline-workspace";
import { AppHeader } from "@/modules/shell/client/app-header";

export default async function ArticlePage({
  params,
}: PageProps<"/articles/[id]">) {
  const { id } = await params;
  return (
    <main className={ui.shell}>
      <AppHeader />
      <section className="pt-16 pb-8 max-[680px]:pt-[60px]">
        <p className={ui.stage}>文章</p>
        <h1 className="text-[clamp(32px,5vw,48px)] leading-[1.18] tracking-[-0.04em]">
          从结构到初稿。
        </h1>
        <Link
          href="/articles"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          返回文章列表
        </Link>
        <Link
          href={`/articles/${id}/preview`}
          className={cn(buttonVariants({ variant: "outline" }), "mt-4 ml-4")}
        >
          预览
        </Link>
      </section>
      <OutlineWorkspace id={id} />
    </main>
  );
}
