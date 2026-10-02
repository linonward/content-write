import { BreakdownWorkspace } from "@/modules/breakdowns/client/breakdown-workspace";
import { AppPage } from "@/modules/shell/client/app-shell";

export default function BreakdownsPage() {
  return (
    <AppPage title="拆解" description="只拆结构，用你自己的素材写。">
      <BreakdownWorkspace />
    </AppPage>
  );
}
