import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Same local settings as `pnpm dev`; variables already set in the shell win.
if (existsSync("../.env.local")) process.loadEnvFile("../.env.local");

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const apiURL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const webPort = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "tests",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "zh-CN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Reuses servers that are already running locally; CI starts fresh ones.
  webServer: [
    {
      command: "pnpm --filter @content-write/api start",
      url: `${apiURL}/api/healthz`,
      // Browser tests use the deterministic mock adapter, never a real model.
      env: { AI_MODE: "mock" },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @content-write/web exec next dev --port ${webPort}`,
      url: `${baseURL}/sign-in`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
