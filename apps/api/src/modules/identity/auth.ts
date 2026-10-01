import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as authSchema from "@content-write/db/auth-schema";
import { getDb } from "@content-write/db/client";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
const secret = process.env.BETTER_AUTH_SECRET;

if (!baseURL || !secret) {
  throw new Error("BETTER_AUTH_URL and BETTER_AUTH_SECRET are required");
}

export const auth = betterAuth({
  appName: "公众号内容工作台",
  baseURL,
  secret,
  trustedOrigins: [process.env.WEB_ORIGIN ?? "http://localhost:3000"],
  advanced: { ipAddress: { ipAddressHeaders: ["x-direct-client-ip"] } },
  database: drizzleAdapter(getDb(), { provider: "pg", schema: authSchema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  plugins: [admin()],
});
