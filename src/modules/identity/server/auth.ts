import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { getDb } from "@/server/db/client";
import * as authSchema from "./schema";

const baseURL = process.env.BETTER_AUTH_URL ?? process.env.APP_URL;
const secret = process.env.BETTER_AUTH_SECRET;

if (!baseURL || !secret) {
  throw new Error("BETTER_AUTH_URL and BETTER_AUTH_SECRET are required");
}

export const auth = betterAuth({
  appName: "公众号内容工作台",
  baseURL,
  secret,
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
