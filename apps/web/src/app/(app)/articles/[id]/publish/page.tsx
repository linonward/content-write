import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PublishWorkspace } from "@/modules/articles/client/publish-workspace";
import { AppPage } from "@/modules/shell/client/app-shell";

export default async function ArticlePublishPage({
  params,
}: PageProps<"/articles/[id]/publish">) {
  const { id } = await params;
  return (
    <AppPage
      title="发布"
      description="在公众号后台手动发布，再回来记录链接。"
      actions={
        <Link
          href={`/articles/${id}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          返回编辑
        </Link>
      }
    >
      <PublishWorkspace articleId={id} />
    </AppPage>
  );
}
