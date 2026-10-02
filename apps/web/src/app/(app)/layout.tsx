import { requireSession } from "@/modules/identity/server/session";
import { AppShell } from "@/modules/shell/client/app-shell";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  return <AppShell user={session.user}>{children}</AppShell>;
}
