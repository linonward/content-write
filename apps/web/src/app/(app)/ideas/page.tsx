import Link from "next/link";
import { ui } from "@/lib/styles";
import { IdeasWorkspace } from "@/modules/ideas/client/ideas-workspace";
import { AppHeader } from "@/modules/shell/client/app-header";

export default function IdeasPage() {
  return (
    <main className={ui.shell}>
      <AppHeader />
      <section className="pt-20 pb-12 max-[680px]:pt-[70px]">
        <p className={ui.stage}>选题</p>
        <h1 className="text-[clamp(36px,5vw,54px)] leading-[1.18] tracking-[-0.04em]">
          从素材找到下一篇。
        </h1>
        <p className="mt-[18px] max-w-[680px] text-base leading-[1.8] text-muted-foreground">
          选择 1～10 条已整理素材，主动生成有来源和证据缺口的选题。
        </p>
        <Link
          href="/inbox"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          返回素材箱
        </Link>
      </section>
      <IdeasWorkspace />
    </main>
  );
}
