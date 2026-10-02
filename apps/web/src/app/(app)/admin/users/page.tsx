import { notFound } from "next/navigation";
import { InviteUserForm } from "@/modules/identity/client/invite-user-form";
import { requireSession } from "@/modules/identity/server/session";
import { AppPage } from "@/modules/shell/client/app-shell";

export default async function InviteUsersPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") notFound();

  return (
    <AppPage title="账号管理" description="创建受邀作者账号。" narrow>
      <p className="text-body text-ink-2">
        填写作者信息与初始密码。创建后，请通过可信渠道将邮箱、密码和登录地址交给受邀者。
      </p>
      <InviteUserForm />
    </AppPage>
  );
}
