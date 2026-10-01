import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import { apiError, isTrustedOrigin } from "../../http";
import { auth } from "./auth";

export const identityRoutes = new Hono();

identityRoutes.on(["GET", "POST"], "/auth/*", async (context) => {
  if (context.req.method === "POST" && !isTrustedOrigin(context.req.raw)) {
    return apiError("INVALID_ORIGIN", "请求来源不受信任。", 403);
  }
  const headers = new Headers(context.req.raw.headers);
  headers.delete("x-direct-client-ip");
  try {
    const address = getConnInfo(context).remote.address;
    if (address) headers.set("x-direct-client-ip", address);
  } catch {
    // In-process tests have no socket; never trust a caller-supplied IP header.
  }
  return auth.handler(new Request(context.req.raw, { headers }));
});

identityRoutes.get("/me", async (context) => {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  if (!session) return apiError("UNAUTHORIZED", "请先登录。", 401);
  return context.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role ?? "user",
    },
  });
});
