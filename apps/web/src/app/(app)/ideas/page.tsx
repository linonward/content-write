import Link from "next/link";
import { ui } from "@/lib/styles";
import { IdeasWorkspace } from "@/modules/ideas/client/ideas-workspace";
import { AppPage } from "@/modules/shell/client/app-shell";

export default function IdeasPage() {
  return (
    <AppPage
      title="选题"
      description="选择已整理素材，生成有来源和证据缺口的选题。"
      actions={
        <Link href="/inbox" className={ui.textLink}>
          素材箱
        </Link>
      }
    >
      <IdeasWorkspace />
    </AppPage>
  );
}
