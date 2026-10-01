import Link from "next/link";
import { notFound } from "next/navigation";
import { InviteUserForm } from "@/modules/identity/client/invite-user-form";
import { requireSession } from "@/modules/identity/server/session";

export default async function InviteUsersPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") notFound();

  return (
    <main className="shell narrow-shell">
      <header className="masthead">
        <Link className="brand" href="/home">
          <span className="mark">文</span>
          <span>返回工作台</span>
        </Link>
      </header>
      <section className="form-intro">
        <p className="stage">管理员</p>
        <h1>创建受邀账号</h1>
        <p className="lead">
          填写作者信息与初始密码。创建后，请通过可信渠道将邮箱、密码和登录地址交给受邀者。
        </p>
      </section>
      <InviteUserForm />
    </main>
  );
}
