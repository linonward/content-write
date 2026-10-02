import { ArticlePreview } from "@/modules/articles/client/article-preview";
import { AppPage } from "@/modules/shell/client/app-shell";

export default async function ArticlePreviewPage({
  params,
}: PageProps<"/articles/[id]/preview">) {
  const { id } = await params;
  return (
    <AppPage
      title="预览与导出"
      description="检查正文与样式，下载 Markdown 或 HTML。"
    >
      <ArticlePreview id={id} />
    </AppPage>
  );
}
