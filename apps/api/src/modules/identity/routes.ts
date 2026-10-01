import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { auth } from "./auth";

export const identityRoutes = new Hono();

identityRoutes.on(["GET", "POST"], "/auth/*", async (context) => {
  if (context.req.method === "POST") {
    const expectedOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
    if (context.req.header("origin") !== expectedOrigin) {
      return context.json(
        {
          error: {
            code: "INVALID_ORIGIN",
            message: "请求来源不受信任。",
            requestId: randomUUID(),
            retryable: false,
          },
        },
        403,
      );
    }
  }
  return auth.handler(context.req.raw);
});

identityRoutes.get("/me", async (context) => {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  if (!session) {
    return context.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "请先登录。",
          requestId: randomUUID(),
          retryable: false,
        },
      },
      401,
    );
  }
  return context.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role ?? "user",
    },
  });
});
