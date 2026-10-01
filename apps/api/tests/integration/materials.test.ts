import { randomUUID } from "node:crypto";
import { user } from "@content-write/db/auth-schema";
import { getDb, getPool } from "@content-write/db/client";
import { materialRevisions } from "@content-write/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { auth } from "../../src/modules/identity/auth";

const suffix = randomUUID();
const password = `integration-${suffix}`;
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const users: string[] = [];

async function signIn(email: string) {
  const created = await auth.api.createUser({
    body: { email, name: email, password, role: "user" },
  });
  users.push(created.user.id);
  const response = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function request(
  path: string,
  method: string,
  cookie?: string,
  body?: object,
  source = origin,
) {
  return app.request(`/api/materials${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      origin: source,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("text materials", () => {
  afterAll(async () => {
    for (const id of users) await getDb().delete(user).where(eq(user.id, id));
    await getPool().end();
  });

  it("requires a session, trusted write origin and valid content", async () => {
    expect((await request("", "GET")).status).toBe(401);
    const cookie = await signIn(`writer-${suffix}@example.test`);
    expect(
      (
        await request(
          "",
          "POST",
          cookie,
          { title: "A", content: "B" },
          "https://untrusted.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("", "POST", cookie, { title: "", content: "B" })).status,
    ).toBe(422);
    expect(
      (
        await request("", "POST", cookie, {
          title: "A",
          content: "x".repeat(50_001),
        })
      ).status,
    ).toBe(422);
  });

  it("creates revisions, rejects stale updates, isolates owners and erases deleted content", async () => {
    const owner = await signIn(`owner-${suffix}@example.test`);
    const other = await signIn(`other-${suffix}@example.test`);
    const created = await request("", "POST", owner, {
      title: "初稿",
      content: "第一段",
    });
    expect(created.status).toBe(201);
    const item = (
      (await created.json()) as {
        material: { id: string; currentVersion: number };
      }
    ).material;
    expect(item.currentVersion).toBe(1);
    expect((await request(`/${item.id}`, "GET", other)).status).toBe(404);
    expect(
      (
        await request(`/${item.id}`, "PATCH", other, {
          title: "窃取",
          content: "内容",
          expectedVersion: 1,
        })
      ).status,
    ).toBe(404);
    expect((await request(`/${item.id}`, "DELETE", other)).status).toBe(404);
    const listed = await request("", "GET", owner);
    expect(
      ((await listed.json()) as { materials: { id: string }[] }).materials.some(
        (value) => value.id === item.id,
      ),
    ).toBe(true);
    const changed = await request(`/${item.id}`, "PATCH", owner, {
      title: "改稿",
      content: "第二段",
      expectedVersion: 1,
    });
    expect(changed.status).toBe(200);
    expect(
      ((await changed.json()) as { material: { currentVersion: number } })
        .material.currentVersion,
    ).toBe(2);
    expect(
      (
        await request(`/${item.id}`, "PATCH", owner, {
          title: "旧稿",
          content: "错误",
          expectedVersion: 1,
        })
      ).status,
    ).toBe(409);
    const revisions = await getDb()
      .select()
      .from(materialRevisions)
      .where(eq(materialRevisions.materialId, item.id));
    expect(revisions.map((revision) => revision.version).sort()).toEqual([
      1, 2,
    ]);
    expect((await request(`/${item.id}`, "DELETE", owner)).status).toBe(204);
    expect((await request(`/${item.id}`, "GET", owner)).status).toBe(404);
    expect(
      await getDb()
        .select()
        .from(materialRevisions)
        .where(eq(materialRevisions.materialId, item.id)),
    ).toHaveLength(0);
  });
});
