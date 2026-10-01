import { randomBytes, randomUUID } from "node:crypto";
import { user } from "@content-write/db/auth-schema";
import { getDb, getPool } from "@content-write/db/client";
import { eq } from "drizzle-orm";
import { auth } from "../../apps/api/src/modules/identity/auth";

// Creates a throwaway invited user per run and removes it afterwards; no fixed test password.
export default async function globalSetup() {
  const email = `e2e-${randomUUID()}@example.test`;
  const password = randomBytes(18).toString("base64url");
  const created = await auth.api.createUser({
    body: { email, name: "E2E 作者", password, role: "user" },
  });
  process.env.E2E_EMAIL = email;
  process.env.E2E_PASSWORD = password;
  return async () => {
    await getDb().delete(user).where(eq(user.id, created.user.id));
    await getPool().end();
  };
}
