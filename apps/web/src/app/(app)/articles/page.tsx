import Link from "next/link";
import { ui } from "@/lib/styles";
import { ArticleList } from "@/modules/articles/client/article-list";
import { AppHeader } from "@/modules/shell/client/app-header";

export default function ArticlesPage() {
  return (
    <main className={ui.shell}>
      <AppHeader />
      <section className="pt-20 pb-10 max-[680px]:pt-[70px]">
        <p className={ui.stage}>文章</p>
        <h1 className="text-[clamp(36px,5vw,54px)] leading-[1.18] tracking-[-0.04em]">
          先把结构想清楚。
        </h1>
        <p className="mt-4 text-muted-foreground">
          从选题创建文章，编辑并确认大纲。
        </p>
        <Link
          href="/ideas"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          从选题创建文章
        </Link>
      </section>
      <ArticleList />
    </main>
  );
}
