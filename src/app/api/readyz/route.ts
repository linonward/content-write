import { checkDatabase } from "@/server/db/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const database = await checkDatabase();
  return Response.json(
    { status: database ? "ready" : "unavailable", database },
    { status: database ? 200 : 503 },
  );
}
