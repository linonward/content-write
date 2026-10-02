import Link from "next/link";
import { ui } from "@/lib/styles";
import { IdeasWorkspace } from "@/modules/ideas/client/ideas-workspace";
import { AppHeader } from "@/modules/shell/client/app-header";

export default function IdeasPage() {
  return (
    <main className={ui.shell}>
      <AppHeader />
      <section className={ui.pageIntro}>
        <p className={ui.stage}>选题</p>
        <h1 className={ui.pageTitle}>从素材找到下一篇。</h1>
        <p className={ui.lead}>
          选择 1～10 条已整理素材，主动生成有来源和证据缺口的选题。
        </p>
        <Link href="/inbox" className={ui.textLink}>
          返回素材箱
        </Link>
      </section>
      <IdeasWorkspace />
    </main>
  );
}
