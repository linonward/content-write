import { randomUUID } from "node:crypto";
import { getPool } from "@content-write/db/client";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { cleanup, origin, signIn } from "./helpers";

// Real PostgreSQL, real HTTP through the Hono app; no model is called because no worker runs here.
const prior = { mode: process.env.AI_MODE, key: process.env.AI_API_KEY };

async function material(cookie: string) {
  const response = await app.request("/api/materials", {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({
      title: "同意测试",
      content: "作者记录了一个待验证的观点。",
    }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { material: { id: string } }).material.id;
}

const settings = async (cookie: string) =>
  (await (
    await app.request("/api/ai/settings", { headers: { cookie } })
  ).json()) as {
    mode: string | null;
    provider: string | null;
    consentRequired: boolean;
  };

describe("real model consent", () => {
  afterEach(() => {
    process.env.AI_MODE = prior.mode ?? "mock";
    if (prior.key === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = prior.key;
  });
  afterAll(cleanup);

  it("requires consent before the first DeepSeek job and reports the real mode", async () => {
    const owner = await signIn("consent-owner");
    const other = await signIn("consent-other");
    const id = await material(owner);
    process.env.AI_MODE = "deepseek";
    process.env.AI_API_KEY = "test-key-not-used";
    expect(await settings(owner)).toEqual({
      mode: "deepseek",
      provider: "deepseek",
      consentRequired: true,
    });
    const blocked = await app.request(`/api/materials/${id}/process`, {
      method: "POST",
      headers: { cookie: owner, origin, "idempotency-key": randomUUID() },
    });
    expect(blocked.status).toBe(428);
    expect(
      ((await blocked.json()) as { error: { code: string } }).error.code,
    ).toBe("AI_CONSENT_REQUIRED");
    expect(
      (
        await app.request("/api/ai/consent", {
          method: "POST",
          headers: { cookie: owner, origin: "https://evil.example" },
        })
      ).status,
    ).toBe(403);
    const accepted = await app.request("/api/ai/consent", {
      method: "POST",
      headers: { cookie: owner, origin },
    });
    expect(accepted.status).toBe(200);
    expect((await settings(owner)).consentRequired).toBe(false);
    expect((await settings(other)).consentRequired).toBe(true);
    const started = await app.request(`/api/materials/${id}/process`, {
      method: "POST",
      headers: { cookie: owner, origin, "idempotency-key": randomUUID() },
    });
    expect(started.status).toBe(202);
    expect(((await started.json()) as { mode: string }).mode).toBe("deepseek");
    const analysis = await app.request(`/api/materials/${id}/analysis`, {
      headers: { cookie: owner },
    });
    expect(((await analysis.json()) as { aiMode: string }).aiMode).toBe(
      "deepseek",
    );
    await getPool().query("DELETE FROM ai_jobs WHERE material_id = $1", [id]);
  });

  it("treats deepseek without a key as unavailable and needs no consent in mock mode", async () => {
    const owner = await signIn("consent-unconfigured");
    process.env.AI_MODE = "deepseek";
    delete process.env.AI_API_KEY;
    expect(await settings(owner)).toEqual({
      mode: null,
      provider: null,
      consentRequired: false,
    });
    process.env.AI_MODE = "mock";
    expect(await settings(owner)).toMatchObject({
      mode: "mock",
      consentRequired: false,
    });
  });
});
