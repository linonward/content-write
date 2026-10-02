const DEVELOPMENT_WEB_ORIGIN = "http://localhost:3000";

// Read lazily so tests and scripts can set the environment before the first request.
export function webOrigin() {
  return process.env.WEB_ORIGIN ?? DEVELOPMENT_WEB_ORIGIN;
}

export function assertRuntimeConfig() {
  if (process.env.NODE_ENV === "production" && !process.env.WEB_ORIGIN) {
    throw new Error("WEB_ORIGIN is required in production");
  }
}

export type AiMode = "mock" | "deepseek";

/** Configured generation mode, or null when generation is unavailable. */
export function aiMode(): AiMode | null {
  const mode = process.env.AI_MODE;
  if (mode === "mock") return "mock";
  if (mode === "deepseek" && process.env.AI_API_KEY) return "deepseek";
  return null;
}

export function aiAvailable() {
  return aiMode() !== null;
}

/** Real providers need the author's consent before materials leave the system. */
export function aiProvider() {
  return aiMode() === "deepseek" ? "deepseek" : null;
}

export function positiveIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
