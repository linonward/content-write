import Image from "next/image";
import { redirect } from "next/navigation";
import { ui } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { SignInForm } from "@/modules/identity/client/sign-in-form";
import { getCurrentSession } from "@/modules/identity/server/session";
import deskPhoto from "@/modules/identity/sign-in-desk.jpg";

// 设计稿画框 15：左栏品牌、写作台配图、一句产品说明与试用状态；右侧 400 宽登录面板。
// 移动端单列，隐藏配图，说明放在面板之后。
export default async function SignInPage() {
  const session = await getCurrentSession();
  if (session) redirect("/home");

  return (
    <main className="flex min-h-dvh bg-canvas max-md:flex-col">
      <section
        aria-label="拆写"
        className="flex min-w-0 flex-1 flex-col gap-8 border-r border-line bg-sidebar p-12 max-md:contents"
      >
        <header
          className={cn(ui.header, "max-md:order-1 max-md:px-4 max-md:pt-6")}
        >
          <span className={ui.mark}>拆</span>
          <span>拆写</span>
        </header>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-line max-md:hidden">
          <Image
            src={deskPhoto}
            alt="木桌上摊开的笔记本、钢笔、一杯茶和几张写满字的卡片"
            fill
            sizes="(max-width: 767px) 0px, (max-width: 1279px) calc(50vw - 96px), calc(100vw - 736px)"
            placeholder="blur"
            loading="eager"
            fetchPriority="high"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col gap-3 max-md:order-3 max-md:px-4">
          <p className="font-serif text-title-article text-ink max-md:text-title-page">
            看懂一篇爆款，写出你自己的那篇。
          </p>
          <p className="text-copy text-ink-2 max-md:text-body">
            拆出爆款的结构与写法，再用你自己的素材写；每一句标出出处，由你决定是否采用。
          </p>
        </div>
        <p className="text-meta text-ink-2 max-md:order-4 max-md:px-4 max-md:pt-3 max-md:pb-8">
          邀请制试用 · Phase 0
        </p>
      </section>
      <div className="flex w-160 shrink-0 items-center justify-center p-12 max-xl:w-auto max-xl:flex-1 max-md:order-2 max-md:flex-none max-md:w-full max-md:px-4 max-md:py-8">
        <section
          aria-labelledby="sign-in-title"
          className="flex w-100 flex-col gap-6 rounded-md border border-line bg-surface p-8 max-md:w-full max-md:p-6"
        >
          <div className="flex flex-col gap-2">
            <h1
              id="sign-in-title"
              className="font-serif text-headline-sm text-ink"
            >
              登录
            </h1>
            <p className="text-body text-ink-2">
              使用管理员为你创建的邮箱和密码。
            </p>
          </div>
          <SignInForm />
        </section>
      </div>
    </main>
  );
}
