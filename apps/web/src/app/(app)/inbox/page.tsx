import Link from "next/link";
import { ui } from "@/lib/styles";
import { MaterialWorkspace } from "@/modules/materials/client/material-workspace";
import { AppPage } from "@/modules/shell/client/app-shell";

export default function InboxPage() {
  return (
    <AppPage
      title="素材箱"
      description="收集文字素材，随时回来修改。"
      actions={
        <Link href="/ideas" className={ui.textLink}>
          找选题
        </Link>
      }
    >
      <MaterialWorkspace />
    </AppPage>
  );
}
