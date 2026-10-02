import { ui } from "@/lib/styles";
import { ProfileForm } from "@/modules/profile/client/profile-form";
import { AppHeader } from "@/modules/shell/client/app-header";

export default function ProfileSettingsPage() {
  return (
    <main className={ui.shell}>
      <AppHeader />
      <section className="pt-16 pb-8 max-[680px]:pt-12">
        <p className={ui.stage}>作者设置</p>
        <h1 className="text-[clamp(32px,5vw,48px)] leading-[1.18] tracking-[-0.04em]">
          让生成更像你。
        </h1>
        <p className="mt-[18px] max-w-[640px] text-base leading-[1.8] text-muted-foreground">
          保存后，之后的选题、大纲和初稿会参考这些设置。它们只用来把握视角和语气，不会被当作事实或经历写进文章。
        </p>
      </section>
      <ProfileForm />
    </main>
  );
}
