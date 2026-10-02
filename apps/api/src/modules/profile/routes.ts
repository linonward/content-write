import { Hono } from "hono";
import { z } from "zod";
import { type AuthedEnv, apiError, readJson, requireUser } from "../../http";
import { getProfile, ProfileError, saveProfile } from "./service";

/** Trimmed, non-empty, unique entries; blank lines from the form are dropped. */
const list = (max: number, length: number) =>
  z
    .array(z.string().trim().max(length))
    .transform((items) => [...new Set(items.filter(Boolean))])
    .pipe(z.array(z.string()).max(max));

const profileInput = z.strictObject({
  expectedVersion: z.int().nonnegative(),
  bio: z.string().trim().max(1000),
  topics: list(10, 30),
  audience: z.string().trim().max(200),
  preferences: z.string().trim().max(1000),
  bannedWords: list(50, 20),
});

export const profileRoutes = new Hono<AuthedEnv>();
profileRoutes.use("/profile", requireUser);

profileRoutes.get("/profile", async (context) =>
  context.json({ profile: await getProfile(context.get("userId")) }),
);
profileRoutes.put("/profile", async (context) => {
  const body = await readJson(context.req.raw, 32_768);
  if (body.status === "large")
    return apiError("PROFILE_TOO_LARGE", "作者设置内容过长。", 413);
  if (body.status === "invalid")
    return apiError("INVALID_JSON", "请求内容不是有效 JSON。", 400);
  const parsed = profileInput.safeParse(body.value);
  if (!parsed.success)
    return apiError(
      "INVALID_PROFILE",
      "简介与表达偏好最多 1000 字，目标读者最多 200 字；写作主题最多 10 个、每个 30 字以内；禁用词最多 50 个、每个 20 字以内。",
      422,
    );
  const { expectedVersion, ...profile } = parsed.data;
  try {
    const version = await saveProfile(
      context.get("userId"),
      expectedVersion,
      profile,
    );
    return context.json({ version });
  } catch (error) {
    if (!(error instanceof ProfileError)) throw error;
    return apiError(
      "PROFILE_VERSION_CONFLICT",
      "作者设置已在别处修改，请刷新后再保存。",
      409,
    );
  }
});
