import { randomUUID } from "node:crypto";
import { user } from "@content-write/db/auth-schema";
import { getDb, getPool } from "@content-write/db/client";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { auth } from "../../src/modules/identity/auth";

function configuredOrigin(): string {
  const value = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
  if (!value) throw new Error("BETTER_AUTH_URL is required");
  return value;
}
const origin = configuredOrigin();

const suffix = randomUUID();
const adminEmail = `admin-${suffix}@example.test`;
const writerEmail = `writer-${suffix}@example.test`;
const password = `integration-${suffix}`;
const createdIds: string[] = [];

async function request(
  path: string,
  body?: object,
  cookie?: string,
  source = process.env.WEB_ORIGIN ?? "http://localhost:3000",
) {
  const request = new Request(`${origin}/api/auth${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      origin: source,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return app.request(request);
}

function cookieFrom(response: Response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("account access", () => {
  afterAll(async () => {
    for (const id of createdIds) {
      await getDb().delete(user).where(eq(user.id, id));
    }
    await getPool().end();
  });

  it("keeps registration closed and rejects untrusted origins", async () => {
    const signUp = await request("/sign-up/email", {
      email: `public-${suffix}@example.test`,
      name: "Public",
      password,
    });
    expect(signUp.status).toBe(400);
    expect(((await signUp.json()) as { code: string }).code).toBe(
      "EMAIL_PASSWORD_SIGN_UP_DISABLED",
    );
  });

  it("limits account creation to admins and isolates sessions", async () => {
    const admin = await auth.api.createUser({
      body: { email: adminEmail, name: "Admin", password, role: "admin" },
    });
    createdIds.push(admin.user.id);

    const crossOrigin = await request(
      "/sign-in/email",
      { email: adminEmail, password },
      undefined,
      "https://untrusted.example",
    );
    expect(crossOrigin.status).toBe(403);

    const anonymous = await request("/get-session");
    expect(await anonymous.json()).toBeNull();

    const adminLogin = await request("/sign-in/email", {
      email: adminEmail,
      password,
    });
    expect(adminLogin.status).toBe(200);
    const adminCookie = cookieFrom(adminLogin);
    expect(adminCookie).toBeTruthy();

    const createWriter = await request(
      "/admin/create-user",
      { email: writerEmail, name: "Writer", password, role: "user" },
      adminCookie,
    );
    expect(createWriter.status).toBe(200);
    const createdWriter = (await createWriter.json()) as {
      user: { id: string };
    };
    createdIds.push(createdWriter.user.id);

    const writerLogin = await request("/sign-in/email", {
      email: writerEmail,
      password,
    });
    expect(writerLogin.status).toBe(200);
    const writerCookie = cookieFrom(writerLogin);
    const writerSession = await request(
      "/get-session",
      undefined,
      writerCookie,
    );
    expect(
      ((await writerSession.json()) as { user: { email: string } }).user.email,
    ).toBe(writerEmail);

    const denied = await request(
      "/admin/create-user",
      {
        email: `forbidden-${suffix}@example.test`,
        name: "Forbidden",
        password,
        role: "user",
      },
      writerCookie,
    );
    expect(denied.status).toBe(403);

    const signOut = await request("/sign-out", {}, writerCookie);
    expect(signOut.status).toBe(200);
    const expired = await request("/get-session", undefined, writerCookie);
    expect(await expired.json()).toBeNull();
  });
});
