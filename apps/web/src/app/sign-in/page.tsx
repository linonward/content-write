import { redirect } from "next/navigation";
import { ui } from "@/lib/styles";
import { SignInForm } from "@/modules/identity/client/sign-in-form";
import { getCurrentSession } from "@/modules/identity/server/session";

export default async function SignInPage() {
  const session = await getCurrentSession();
  if (session) redirect("/home");

  return (
    <main className={ui.narrowShell}>
      <header className={ui.header}>
        <span className={ui.mark}>拆</span>
        <span>拆写</span>
      </header>
      <section className={ui.formIntro}>
        <p className={ui.stage}>受邀访问</p>
        <h1 className={ui.formTitle}>登录拆写</h1>
        <p className={ui.lead}>使用管理员为你创建的邮箱和密码登录。</p>
      </section>
      <SignInForm />
    </main>
  );
}
