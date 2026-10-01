import { Hono } from "hono";
import { cors } from "hono/cors";
import { healthRoutes } from "./modules/health/routes";
import { ideaRoutes } from "./modules/ideas/routes";
import { identityRoutes } from "./modules/identity/routes";
import { jobRoutes, materialRoutes } from "./modules/materials/routes";

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  }),
);
app.route("/api", healthRoutes);
app.route("/api", identityRoutes);
app.route("/api", materialRoutes);
app.route("/api", jobRoutes);
app.route("/api", ideaRoutes);

app.notFound((context) =>
  context.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "接口不存在。",
        requestId: crypto.randomUUID(),
        retryable: false,
      },
    },
    404,
  ),
);

app.onError((error, context) => {
  console.error("api: request failed", error);
  return context.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "服务暂时不可用，请稍后重试。",
        requestId: crypto.randomUUID(),
        retryable: true,
      },
    },
    500,
  );
});
