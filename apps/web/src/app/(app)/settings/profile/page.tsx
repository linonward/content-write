import { Memories } from "@/modules/profile/client/memories";
import { ProfileForm } from "@/modules/profile/client/profile-form";
import { WritingSamples } from "@/modules/profile/client/writing-samples";
import { AppPage } from "@/modules/shell/client/app-shell";

export default function ProfileSettingsPage() {
  return (
    <AppPage
      title="作者设置"
      description="把握视角与语气，不作为事实或经历。"
      narrow
    >
      <div className="grid gap-6">
        <ProfileForm />
        <WritingSamples />
        <Memories />
      </div>
    </AppPage>
  );
}
