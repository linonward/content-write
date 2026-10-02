import { Hono } from "hono";
import { cors } from "hono/cors";
import { webOrigin } from "./config";
import { apiError } from "./http";
import { aiRoutes, jobRoutes } from "./modules/ai-jobs/routes";
import { articleEditRoutes } from "./modules/article-edits/routes";
import { articleExportRoutes } from "./modules/article-export/routes";
import { articleRoutes } from "./modules/articles/routes";
import { breakdownRoutes } from "./modules/breakdowns/routes";
import { healthRoutes } from "./modules/health/routes";
import { ideaRoutes } from "./modules/ideas/routes";
import { identityRoutes } from "./modules/identity/routes";
import { materialRoutes } from "./modules/materials/routes";
import { profileRoutes } from "./modules/profile/routes";

import { writingSampleRoutes } from "./modules/writing-samples/routes";

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: (origin) => (origin === webOrigin() ? origin : null),
    credentials: true,
  }),
);
app.route("/api", healthRoutes);
app.route("/api", identityRoutes);
app.route("/api", materialRoutes);
app.route("/api", profileRoutes);
app.route("/api", writingSampleRoutes);
app.route("/api", jobRoutes);
app.route("/api", aiRoutes);
app.route("/api", ideaRoutes);
app.route("/api", articleRoutes);
app.route("/api", articleExportRoutes);
app.route("/api", articleEditRoutes);
app.route("/api", breakdownRoutes);

app.notFound(() => apiError("NOT_FOUND", "接口不存在。", 404));

app.onError((error) => {
  console.error("api: request failed", error);
  return apiError("INTERNAL_ERROR", "服务暂时不可用，请稍后重试。", 500);
});
