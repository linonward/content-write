import { checkDatabase } from "@content-write/db/health";
import { Hono } from "hono";

export const healthRoutes = new Hono()
  .get("/healthz", (context) => context.json({ status: "ok" }))
  .get("/readyz", async (context) => {
    const database = await checkDatabase();
    return context.json(
      { status: database ? "ready" : "unavailable", database },
      database ? 200 : 503,
    );
  });
