import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/identity/server/session";

export default async function IndexPage() {
  const session = await getCurrentSession();
  redirect(session ? "/home" : "/sign-in");
}
