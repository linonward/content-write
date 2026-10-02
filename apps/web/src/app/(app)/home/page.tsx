import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ui } from "@/lib/styles";
import { requireSession } from "@/modules/identity/server/session";
import { AppPage } from "@/modules/shell/client/app-shell";

export default async function HomePage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "admin";

  return (
    <AppPage title="首页" description="从你的素材与观点开始写作。">
      <section className="flex max-w-paper flex-col gap-2 pt-16 pb-12 max-md:pt-12 max-md:pb-8">
        <p className={ui.stage}>写作空间</p>
        <h2 className={ui.heroTitle}>你好，{session.user.name}。</h2>
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
          <p className="text-body text-ink-2">{session.user.email}</p>
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
      <p className="flex flex-wrap gap-3 pt-6">
        <Link
          className={buttonVariants({ variant: "secondary" })}
          href="/inbox"
        >
          打开素材箱
        </Link>
        <Link
          className={buttonVariants({ variant: "secondary" })}
          href="/ideas"
        >
          从素材找选题
        </Link>
        <Link
          className={buttonVariants({ variant: "secondary" })}
          href="/articles"
        >
          查看文章大纲
        </Link>
      </p>
      <p className="pt-6 text-body text-ink-2">
        选题、大纲和初稿需要作者主动生成。打开首页不会自动调用模型。
      </p>
    </AppPage>
  );
}
