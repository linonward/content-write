import { ui } from "@/lib/styles";
import { BreakdownWorkspace } from "@/modules/breakdowns/client/breakdown-workspace";
import { AppHeader } from "@/modules/shell/client/app-header";

export default function BreakdownsPage() {
  return (
    <main className={ui.wideShell}>
      <AppHeader />
      <section className={ui.pageIntro}>
        <p className={ui.stage}>拆解</p>
        <h1 className={ui.pageTitle}>拆出结构，再用你自己的素材写。</h1>
        <p className={ui.lead}>
          贴入一篇写得好的文章，主动拆解它的标题、开头、段落槽位、节奏和结尾。原文只有你能看到，不会进入你的大纲、初稿或导出。
        </p>
      </section>
      <BreakdownWorkspace />
    </main>
  );
}
