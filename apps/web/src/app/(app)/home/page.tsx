import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ui } from "@/lib/styles";
import { LogoutButton } from "@/modules/identity/client/logout-button";
import { requireSession } from "@/modules/identity/server/session";

export default async function HomePage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "admin";

  return (
    <main className={ui.shell}>
      <header className={`${ui.header} justify-between`}>
        <Link className={ui.brand} href="/home">
          <span className={ui.mark}>文</span>
          <span>公众号内容工作台</span>
        </Link>
        <LogoutButton />
      </header>
      <section className="max-w-[760px] pt-[110px] pb-[100px] max-[680px]:pt-20 max-[680px]:pb-[70px]">
        <p className={ui.stage}>写作空间</p>
        <h1 className={ui.heroTitle}>你好，{session.user.name}。</h1>
        <p className={ui.lead}>
          你的账号已可以使用。现在可以保存、整理素材并寻找选题。
        </p>
      </section>
      <section
        className="flex items-center justify-between gap-6 border-y py-7 max-[680px]:flex-col max-[680px]:items-start"
        aria-labelledby="account-heading"
      >
        <div>
          <h2 id="account-heading" className="mb-2 text-xl">
            当前账号
          </h2>
          <p className="text-sm text-muted-foreground">{session.user.email}</p>
        </div>
        {isAdmin ? (
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/admin/users"
          >
            创建受邀账号
          </Link>
        ) : (
          <Badge variant="secondary">受邀作者</Badge>
        )}
      </section>
      <p className="mt-[22px]">
        <Link className={buttonVariants({ variant: "outline" })} href="/inbox">
          打开素材箱
        </Link>
        <Link
          className={`${buttonVariants({ variant: "outline" })} ml-3`}
          href="/ideas"
        >
          从素材找选题
        </Link>
      </p>
      <p className="mt-[22px] text-sm text-muted-foreground">
        选题需要作者主动生成；文章写作流程将在后续开放。打开首页不会自动调用模型。
      </p>
    </main>
  );
}
