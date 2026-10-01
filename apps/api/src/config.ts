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

export function aiAvailable() {
  return process.env.AI_MODE === "mock";
}

export function positiveIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
