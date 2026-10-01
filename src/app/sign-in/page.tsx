import { redirect } from "next/navigation";
import { SignInForm } from "@/modules/identity/client/sign-in-form";
import { getCurrentSession } from "@/modules/identity/server/session";

export default async function SignInPage() {
  const session = await getCurrentSession();
  if (session) redirect("/home");

  return (
    <main className="shell narrow-shell">
      <header className="masthead">
        <span className="mark">文</span>
        <span>公众号内容工作台</span>
      </header>
      <section className="form-intro">
        <p className="stage">受邀访问</p>
        <h1>登录工作台</h1>
        <p className="lead">使用管理员为你创建的邮箱和密码登录。</p>
      </section>
      <SignInForm />
    </main>
  );
}
