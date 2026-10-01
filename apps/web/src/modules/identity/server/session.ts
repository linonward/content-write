import { headers } from "next/headers";
import { redirect } from "next/navigation";

type Session = {
  user: { id: string; name: string; email: string; role: string };
};

export async function getCurrentSession(): Promise<Session | null> {
  const requestHeaders = await headers();
  const apiOrigin =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001";
  const response = await fetch(`${apiOrigin}/api/me`, {
    headers: { cookie: requestHeaders.get("cookie") ?? "" },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("API session lookup failed");
  return (await response.json()) as Session;
}

export async function requireSession(): Promise<Session> {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  return session;
}
