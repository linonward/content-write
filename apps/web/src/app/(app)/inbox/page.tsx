import Link from "next/link";
import { ui } from "@/lib/styles";
import { MaterialWorkspace } from "@/modules/materials/client/material-workspace";
import { AppHeader } from "@/modules/shell/client/app-header";

export default function InboxPage() {
  return (
    <main className={ui.shell}>
      <AppHeader />
      <section className={ui.pageIntro}>
        <p className={ui.stage}>素材箱</p>
        <h1 className={ui.pageTitle}>先保存你的想法。</h1>
        <p className={ui.lead}>
          收集文字素材，随时回来修改。打开素材后可主动整理当前版本。
        </p>
        <Link href="/ideas" className={ui.textLink}>
          从已整理素材找选题
        </Link>
      </section>
      <MaterialWorkspace />
    </main>
  );
}
