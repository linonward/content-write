import Link from "next/link";
import { LogoutButton } from "@/modules/identity/client/logout-button";
import { requireSession } from "@/modules/identity/server/session";

export default async function HomePage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "admin";

  return (
    <main className="shell">
      <header className="masthead app-header">
        <Link className="brand" href="/home">
          <span className="mark">文</span>
          <span>公众号内容工作台</span>
        </Link>
        <LogoutButton />
      </header>
      <section className="intro app-intro">
        <p className="stage">写作空间</p>
        <h1>你好，{session.user.name}。</h1>
        <p className="lead">你的账号已可以使用。现在可以保存和整理文字素材。</p>
      </section>
      <section
        className="status account-status"
        aria-labelledby="account-heading"
      >
        <div>
          <h2 id="account-heading">当前账号</h2>
          <p>{session.user.email}</p>
        </div>
        {isAdmin ? (
          <Link className="outline-link" href="/admin/users">
            创建受邀账号
          </Link>
        ) : (
          <span className="status-muted">受邀作者</span>
        )}
      </section>
      <p className="note">
        <Link className="outline-link" href="/inbox">
          打开素材箱
        </Link>
      </p>
      <p className="note">
        选题与写作流程将在后续开放；打开首页不会自动调用模型。
      </p>
    </main>
  );
}
