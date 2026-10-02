import { ui } from "@/lib/styles";
import { BreakdownWorkspace } from "@/modules/breakdowns/client/breakdown-workspace";
import { AppHeader } from "@/modules/shell/client/app-header";

export default function BreakdownsPage() {
  return (
    <main className={ui.wideShell}>
      <AppHeader />
      <section className="pt-16 pb-10 max-[680px]:pt-12">
        <p className={ui.stage}>拆解</p>
        <h1 className="text-[clamp(36px,5vw,54px)] leading-[1.18] tracking-[-0.04em]">
          拆出结构，再用你自己的素材写。
        </h1>
        <p className="mt-[18px] max-w-[680px] text-base leading-[1.8] text-muted-foreground">
          贴入一篇写得好的文章，主动拆解它的标题、开头、段落槽位、节奏和结尾。原文只有你能看到，不会进入你的大纲、初稿或导出。
        </p>
      </section>
      <BreakdownWorkspace />
    </main>
  );
}
