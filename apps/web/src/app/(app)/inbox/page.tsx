import Link from "next/link";
import { ui } from "@/lib/styles";
import { LogoutButton } from "@/modules/identity/client/logout-button";
import { MaterialWorkspace } from "@/modules/materials/client/material-workspace";

export default function InboxPage() {
  return (
    <main className={ui.shell}>
      <header className={`${ui.header} justify-between`}>
        <Link className={ui.brand} href="/home">
          <span className={ui.mark}>文</span>
          <span>公众号内容工作台</span>
        </Link>
        <LogoutButton />
      </header>
      <section className="pt-20 pb-12 max-[680px]:pt-[70px]">
        <p className={ui.stage}>素材箱</p>
        <h1 className="text-[clamp(36px,5vw,54px)] leading-[1.18] tracking-[-0.04em]">
          先保存你的想法。
        </h1>
        <p className="mt-[18px] max-w-[570px] text-base leading-[1.8] text-[#66716c]">
          收集文字素材，随时回来修改。AI 整理将在后续开放。
        </p>
      </section>
      <MaterialWorkspace />
    </main>
  );
}
