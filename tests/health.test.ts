import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/health", () => ({ checkDatabase: vi.fn() }));

import { GET as health } from "../src/app/api/healthz/route";
import { GET as ready } from "../src/app/api/readyz/route";
import { checkDatabase } from "../src/server/db/health";

const database = vi.mocked(checkDatabase);

describe("health routes", () => {
  it("reports the web process separately from database readiness", async () => {
    expect((await health()).status).toBe(200);
    expect(await (await health()).json()).toEqual({ status: "ok" });
  });

  it("returns 200 when PostgreSQL responds", async () => {
    database.mockResolvedValueOnce(true);
    const response = await ready();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready", database: true });
  });

  it("returns 503 when PostgreSQL is unavailable", async () => {
    database.mockResolvedValueOnce(false);
    const response = await ready();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "unavailable",
      database: false,
    });
  });
});
