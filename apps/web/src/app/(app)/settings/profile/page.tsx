import { ui } from "@/lib/styles";
import { ProfileForm } from "@/modules/profile/client/profile-form";
import { AppHeader } from "@/modules/shell/client/app-header";

export default function ProfileSettingsPage() {
  return (
    <main className={ui.shell}>
      <AppHeader />
      {/* Form pages keep their content at the form width; the header spans the shell. */}
      <div className="max-w-form">
        <section className={ui.pageIntro}>
          <p className={ui.stage}>作者设置</p>
          <h1 className={ui.pageTitle}>作者画像</h1>
          <p className={ui.lead}>
            保存后，之后的选题、大纲和初稿会参考这些设置。它们只用来把握视角和语气，不会被当作事实或经历写进文章。
          </p>
        </section>
        <ProfileForm />
      </div>
    </main>
  );
}
