import { randomUUID } from "node:crypto";
import { auth } from "@/modules/identity/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "请先登录。",
          requestId: randomUUID(),
          retryable: false,
        },
      },
      { status: 401 },
    );
  }
  return Response.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role ?? "user",
    },
  });
}
