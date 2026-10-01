import { randomUUID } from "node:crypto";
import { rateLimit, user } from "@content-write/db/auth-schema";
import { getDb, getPool } from "@content-write/db/client";
import { materialRevisions } from "@content-write/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/materials/link-fetch", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../src/modules/materials/link-fetch")
    >();
  return { ...original, fetchLink: vi.fn() };
});

import { app } from "../../src/app";
import { auth } from "../../src/modules/identity/auth";
import { fetchLink } from "../../src/modules/materials/link-fetch";

const suffix = randomUUID();
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const createdIds: string[] = [];
const previousFlag = process.env.REMOTE_FETCH_ENABLED;
const mockedFetch = vi.mocked(fetchLink);

async function signIn(email: string) {
  await getDb().delete(rateLimit);
  const created = await auth.api.createUser({
    body: {
      email,
      name: email,
      password: `integration-${suffix}`,
      role: "user",
    },
  });
  createdIds.push(created.user.id);
  const response = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: `integration-${suffix}` }),
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
      origin: source,
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("link materials", () => {
  afterEach(() => {
    if (previousFlag === undefined) delete process.env.REMOTE_FETCH_ENABLED;
    else process.env.REMOTE_FETCH_ENABLED = previousFlag;
    mockedFetch.mockReset();
  });
  afterAll(async () => {
    for (const id of createdIds)
      await getDb().delete(user).where(eq(user.id, id));
    await getPool().end();
  });

  it("saves a URL with fetch disabled and lets the owner paste body as a revision", async () => {
    process.env.REMOTE_FETCH_ENABLED = "false";
    const owner = await signIn(`link-${suffix}@example.test`);
    const other = await signIn(`other-link-${suffix}@example.test`);
    expect(
      (
        await request("/link", "POST", undefined, {
          url: "https://example.com/",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          "/link",
          "POST",
          owner,
          { url: "https://example.com/" },
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    for (const url of [
      "file:///etc/passwd",
      "http://127.0.0.1/",
      "http://example.com:8080/",
    ]) {
      expect(
        (await request("/link", "POST", owner, { url, fetch: false })).status,
      ).toBe(422);
    }
    const created = await request("/link", "POST", owner, {
      url: "https://example.com/post#fragment",
      fetch: true,
    });
    expect(created.status).toBe(201);
    const item = (
      (await created.json()) as {
        material: {
          id: string;
          content: string;
          sourceUrl: string;
          fetchStatus: string;
          kind: string;
        };
      }
    ).material;
    expect(item).toMatchObject({
      kind: "link",
      sourceUrl: "https://example.com/post",
      fetchStatus: "disabled",
      content: "",
    });
    expect(mockedFetch).not.toHaveBeenCalled();
    expect((await request(`/${item.id}`, "GET", other)).status).toBe(404);
    const updated = await request(`/${item.id}`, "PATCH", owner, {
      title: "我的正文",
      content: "粘贴的原文",
      expectedVersion: 1,
    });
    expect(updated.status).toBe(200);
    expect(
      (
        (await updated.json()) as {
          material: { fetchStatus: string; sourceUrl: string };
        }
      ).material,
    ).toMatchObject({
      fetchStatus: "manual",
      sourceUrl: "https://example.com/post",
    });
    const revisions = await getDb()
      .select()
      .from(materialRevisions)
      .where(eq(materialRevisions.materialId, item.id));
    expect(revisions).toHaveLength(2);
    expect(revisions.map((revision) => revision.sourceUrl)).toEqual([
      "https://example.com/post",
      "https://example.com/post",
    ]);
  });

  it("persists fetch failure and enforces a per-user hourly fetch limit", async () => {
    process.env.REMOTE_FETCH_ENABLED = "true";
    const owner = await signIn(`fetch-link-${suffix}@example.test`);
    mockedFetch.mockResolvedValue({ status: "failed" });
    for (let index = 0; index < 10; index++) {
      const result = await request("/link", "POST", owner, {
        url: `https://example.com/${index}`,
        fetch: true,
      });
      expect(result.status).toBe(201);
      expect(
        (
          (await result.json()) as {
            material: { fetchStatus: string; content: string };
          }
        ).material,
      ).toMatchObject({ fetchStatus: "failed", content: "" });
    }
    expect(
      (
        await request("/link", "POST", owner, {
          url: "https://example.com/limit",
          fetch: true,
        })
      ).status,
    ).toBe(429);
    expect(mockedFetch).toHaveBeenCalledTimes(10);
  });

  it("stores fetched text without presenting it as verified fact", async () => {
    process.env.REMOTE_FETCH_ENABLED = "true";
    const owner = await signIn(`fetched-link-${suffix}@example.test`);
    mockedFetch.mockResolvedValue({
      status: "fetched",
      title: "网页标题",
      content: "网页正文",
      finalUrl: "https://example.com/article",
    });
    const response = await request("/link", "POST", owner, {
      url: "https://example.com/article",
      fetch: true,
    });
    expect(response.status).toBe(201);
    expect(
      ((await response.json()) as { material: object }).material,
    ).toMatchObject({
      title: "网页标题",
      content: "网页正文",
      fetchStatus: "fetched",
    });
  });
});
