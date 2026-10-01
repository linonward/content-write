import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { webOrigin } from "./config";
import { auth } from "./modules/identity/auth";

export type ErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 409
  | 413
  | 422
  | 429
  | 500
  | 503;

export function apiError(
  code: string,
  message: string,
  status: ErrorStatus,
  retryable = status === 500 || status === 503,
) {
  return new Response(
    JSON.stringify({
      error: { code, message, requestId: randomUUID(), retryable },
    }),
    {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}

export async function readJson(request: Request, maxBytes: number) {
  if (Number(request.headers.get("content-length")) > maxBytes)
    return { status: "large" as const };
  const body = await request.text();
  if (body.length > maxBytes) return { status: "large" as const };
  try {
    return { status: "ok" as const, value: JSON.parse(body) as unknown };
  } catch {
    return { status: "invalid" as const };
  }
}

export function idempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key");
  return key && key.length <= 128 && /^[\x21-\x7e]+$/.test(key) ? key : null;
}

export const invalidIdempotencyKey = () =>
  apiError("INVALID_IDEMPOTENCY_KEY", "请提供有效的 Idempotency-Key。", 422);

export function isTrustedOrigin(request: Request) {
  return request.headers.get("origin") === webOrigin();
}

export type AuthedEnv = { Variables: { userId: string } };

// Session first, then Origin for every state-changing method.
export const requireUser: MiddlewareHandler<AuthedEnv> = async (
  context,
  next,
) => {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  if (!session) return apiError("UNAUTHORIZED", "请先登录。", 401);
  context.set("userId", session.user.id);
  if (
    !["GET", "HEAD", "OPTIONS"].includes(context.req.method) &&
    !isTrustedOrigin(context.req.raw)
  ) {
    return apiError("INVALID_ORIGIN", "请求来源不受信任。", 403);
  }
  await next();
};
