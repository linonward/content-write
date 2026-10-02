import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ui } from "@/lib/styles";
import { requireSession } from "@/modules/identity/server/session";
import { AppPage } from "@/modules/shell/client/app-shell";

export default async function HomePage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "admin";

  return (
    <AppPage
      title="首页"
      description="从你的素材与观点开始写作。"
      actions={
        <>
          <Link
            className={buttonVariants({ variant: "secondary" })}
            href="/breakdowns?new=1"
          >
            拆解一篇爆款
          </Link>
          <Link className={buttonVariants()} href="/inbox?new=1">
            添加素材
          </Link>
        </>
      }
    >
      <section className="flex max-w-paper flex-col gap-2 py-6">
        <p className={ui.stage}>写作空间</p>
        <h2 className="font-serif text-title-article">
          你好，{session.user.name}。
        </h2>
        <p className={ui.lead}>
          你的账号已可以使用。现在可以保存、整理素材，寻找选题并确认文章大纲。
        </p>
      </section>
      <section
        className="flex items-center justify-between gap-6 border-y py-6 max-md:flex-col max-md:items-start"
        aria-labelledby="account-heading"
      >
        <div>
          <h2 id="account-heading" className="pb-1 text-title-section">
            当前账号
          </h2>
          <p className="text-body text-ink-2 wrap-anywhere">
            {session.user.email}
          </p>
        </div>
        {isAdmin ? (
          <Link
            className={buttonVariants({ variant: "secondary" })}
            href="/admin/users"
          >
            创建受邀账号
          </Link>
        ) : (
          <Badge variant="muted">受邀作者</Badge>
        )}
      </section>
      <div className="grid gap-6 md:grid-cols-3">
        {(
          [
            {
              href: "/inbox",
              title: "素材箱",
              description: "收集经历、观点与证据，整理成自己的写作来源。",
              action: "打开素材箱",
            },
            {
              href: "/ideas",
              title: "选题",
              description: "选择已整理素材，找到值得写的主张与证据缺口。",
              action: "从素材找选题",
            },
            {
              href: "/articles",
              title: "文章",
              description: "从选题确认大纲，再把自己的素材写成文章。",
              action: "查看文章大纲",
            },
          ] as const
        ).map((item) => (
          <Card key={item.href}>
            <CardHeader>
              <CardTitle>{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-body text-ink-2">{item.description}</p>
              <Link
                href={item.href}
                className={buttonVariants({ variant: "secondary" })}
              >
                {item.action}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="pt-6 text-body text-ink-2">
        选题、大纲和初稿需要作者主动生成。打开首页不会自动调用模型。
      </p>
    </AppPage>
  );
}
