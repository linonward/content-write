import { requireSession } from "@/modules/identity/server/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireSession();
  return children;
}
