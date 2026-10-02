import { getDb } from "@content-write/db/client";
import { aiConsents } from "@content-write/db/schema";
import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { aiMode, aiProvider } from "../../config";
import { type AuthedEnv, apiError } from "../../http";

export async function consentRequired(userId: string) {
  const provider = aiProvider();
  if (!provider) return false;
  const [row] = await getDb()
    .select({ userId: aiConsents.userId })
    .from(aiConsents)
    .where(
      and(eq(aiConsents.userId, userId), eq(aiConsents.provider, provider)),
    )
    .limit(1);
  return !row;
}

export async function recordConsent(userId: string) {
  const provider = aiProvider();
  if (!provider) return false;
  await getDb()
    .insert(aiConsents)
    .values({ userId, provider })
    .onConflictDoUpdate({
      target: aiConsents.userId,
      set: { provider, consentedAt: new Date() },
    });
  return true;
}

export async function aiSettings(userId: string) {
  return {
    mode: aiMode(),
    provider: aiProvider(),
    consentRequired: await consentRequired(userId),
  };
}

/** Blocks generation routes until the author has accepted the provider notice. */
export const requireAiConsent: MiddlewareHandler<AuthedEnv> = async (
  context,
  next,
) => {
  if (await consentRequired(context.get("userId")))
    return apiError(
      "AI_CONSENT_REQUIRED",
      "首次使用真实模型前，请先确认素材会发送给模型服务。",
      428,
    );
  await next();
};
