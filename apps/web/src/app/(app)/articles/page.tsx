import Link from "next/link";
import { ui } from "@/lib/styles";
import { ArticleList } from "@/modules/articles/client/article-list";
import { AppHeader } from "@/modules/shell/client/app-header";

export default function ArticlesPage() {
  return (
    <main className={ui.shell}>
      <AppHeader />
      <section className={ui.pageIntro}>
        <p className={ui.stage}>文章</p>
        <h1 className={ui.pageTitle}>先把结构想清楚。</h1>
        <p className="mt-4 text-ink-2">从选题创建文章，编辑并确认大纲。</p>
        <Link href="/ideas" className={ui.textLink}>
          从选题创建文章
        </Link>
      </section>
      <ArticleList />
    </main>
  );
}
