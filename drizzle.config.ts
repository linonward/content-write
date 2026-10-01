import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/server/db/schema.ts",
    "./src/modules/identity/server/schema.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://app:app@localhost:5432/content_write",
  },
});
