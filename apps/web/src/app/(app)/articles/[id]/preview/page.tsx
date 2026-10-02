import { ui } from "@/lib/styles";
import { ArticlePreview } from "@/modules/articles/client/article-preview";
import { AppHeader } from "@/modules/shell/client/app-header";

export default async function ArticlePreviewPage({
  params,
}: PageProps<"/articles/[id]/preview">) {
  const { id } = await params;
  return (
    <main className={ui.wideShell}>
      <AppHeader />
      <ArticlePreview id={id} />
    </main>
  );
}
