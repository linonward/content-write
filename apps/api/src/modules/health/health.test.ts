import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BETTER_AUTH_SECRET ??=
    "unit-test-only-secret-at-least-32-characters";
  process.env.DATABASE_URL ??=
    "postgresql://app:app@localhost:5432/content_write_test";
});

vi.mock("@content-write/db/health", () => ({ checkDatabase: vi.fn() }));

import { checkDatabase } from "@content-write/db/health";
import { app } from "../../app";

const database = vi.mocked(checkDatabase);

describe("Hono API health module", () => {
  it("reports the API process separately from database readiness", async () => {
    const response = await app.request("/api/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("reports PostgreSQL readiness", async () => {
    database.mockResolvedValueOnce(true);
    const response = await app.request("/api/readyz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready", database: true });
  });

  it("returns 503 when PostgreSQL is unavailable", async () => {
    database.mockResolvedValueOnce(false);
    const response = await app.request("/api/readyz");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "unavailable",
      database: false,
    });
  });

  it("allows the configured Web origin only", async () => {
    const allowed = await app.request("/api/healthz", {
      headers: { Origin: "http://localhost:3000" },
    });
    const denied = await app.request("/api/healthz", {
      headers: { Origin: "http://other.example" },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns a structured error for unknown routes", async () => {
    const response = await app.request("/api/missing");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND", retryable: false },
    });
  });
});
