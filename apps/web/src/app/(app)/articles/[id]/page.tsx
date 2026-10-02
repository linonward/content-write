import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ui } from "@/lib/styles";
import { OutlineWorkspace } from "@/modules/articles/client/outline-workspace";
import { AppPage } from "@/modules/shell/client/app-shell";

export default async function ArticlePage({
  params,
}: PageProps<"/articles/[id]">) {
  const { id } = await params;
  return (
    <AppPage
      title="文章工作区"
      description="从结构到初稿。"
      actions={
        <>
          <Link href="/articles" className={ui.textLink}>
            文章列表
          </Link>
          <Link
            href={`/articles/${id}/preview`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            预览
          </Link>
        </>
      }
    >
      <OutlineWorkspace id={id} />
    </AppPage>
  );
}
