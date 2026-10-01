import Link from "next/link";
import { LogoutButton } from "@/modules/identity/client/logout-button";
import { MaterialWorkspace } from "@/modules/materials/client/material-workspace";

export default function InboxPage() {
  return (
    <main className="shell">
      <header className="masthead app-header">
        <Link className="brand" href="/home">
          <span className="mark">文</span>
          <span>公众号内容工作台</span>
        </Link>
        <LogoutButton />
      </header>
      <section className="inbox-intro">
        <p className="stage">素材箱</p>
        <h1>先保存你的想法。</h1>
        <p className="lead">
          收集文字素材，随时回来修改。AI 整理将在后续开放。
        </p>
      </section>
      <MaterialWorkspace />
    </main>
  );
}
