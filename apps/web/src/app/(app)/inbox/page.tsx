import Link from "next/link";
import { ui } from "@/lib/styles";
import { MaterialWorkspace } from "@/modules/materials/client/material-workspace";
import { AppHeader } from "@/modules/shell/client/app-header";

export default function InboxPage() {
  return (
    <main className={ui.shell}>
      <AppHeader />
      <section className="pt-20 pb-12 max-[680px]:pt-[70px]">
        <p className={ui.stage}>素材箱</p>
        <h1 className="text-[clamp(36px,5vw,54px)] leading-[1.18] tracking-[-0.04em]">
          先保存你的想法。
        </h1>
        <p className="mt-[18px] max-w-[570px] text-base leading-[1.8] text-[#66716c]">
          收集文字素材，随时回来修改。打开素材后可主动整理当前版本。
        </p>
        <Link
          href="/ideas"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          从已整理素材找选题
        </Link>
      </section>
      <MaterialWorkspace />
    </main>
  );
}
