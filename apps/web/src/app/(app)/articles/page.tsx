import Link from "next/link";
import { ui } from "@/lib/styles";
import { ArticleList } from "@/modules/articles/client/article-list";
import { AppPage } from "@/modules/shell/client/app-shell";

export default function ArticlesPage() {
  return (
    <AppPage
      title="文章"
      description="从选题创建文章，编辑并确认大纲。"
      actions={
        <Link href="/ideas" className={ui.textLink}>
          从选题创建文章
        </Link>
      }
    >
      <ArticleList />
    </AppPage>
  );
}
