import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/modules/identity/server/auth";

export const runtime = "nodejs";
const handler = toNextJsHandler(auth);
export const GET = handler.GET;

export function POST(request: Request) {
  const expectedOrigin = new URL(
    process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "",
  ).origin;
  if (request.headers.get("origin") !== expectedOrigin) {
    return Response.json(
      { code: "INVALID_ORIGIN", message: "请求来源不受信任。" },
      { status: 403 },
    );
  }
  return handler.POST(request);
}
