import Link from "next/link";
import { notFound } from "next/navigation";
import { ui } from "@/lib/styles";
import { InviteUserForm } from "@/modules/identity/client/invite-user-form";
import { requireSession } from "@/modules/identity/server/session";

export default async function InviteUsersPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") notFound();

  return (
    <main className={ui.narrowShell}>
      <header className={ui.header}>
        <Link className={ui.brand} href="/home">
          <span className={ui.mark}>文</span>
          <span>返回工作台</span>
        </Link>
      </header>
      <section className={ui.formIntro}>
        <p className={ui.stage}>管理员</p>
        <h1 className={ui.formTitle}>创建受邀账号</h1>
        <p className="mt-[18px] max-w-[570px] text-base leading-[1.8] text-[#66716c]">
          填写作者信息与初始密码。创建后，请通过可信渠道将邮箱、密码和登录地址交给受邀者。
        </p>
      </section>
      <InviteUserForm />
    </main>
  );
}
