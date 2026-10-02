import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app";
import { auth } from "../../src/modules/identity/auth";
import { cleanup, signIn, write } from "./helpers";

const missing = "00000000-0000-0000-0000-000000000000";

describe("session checks", () => {
  afterEach(() => vi.restoreAllMocks());
  afterAll(cleanup);

  it("looks the session up once per request where route groups overlap", async () => {
    const cookie = await signIn("session-once");
    const lookups = vi.spyOn(auth.api, "getSession");
    // Collection paths match both `/x` and `/x/*`; preview and export match two modules.
    for (const path of [
      "/api/materials",
      "/api/articles",
      "/api/breakdowns",
      `/api/articles/${missing}`,
      `/api/articles/${missing}/preview`,
      `/api/articles/${missing}/export?format=markdown`,
    ]) {
      lookups.mockClear();
      const response = await app.request(path, { headers: { cookie } });
      expect(response.status, path).toBeLessThan(500);
      expect(lookups, path).toHaveBeenCalledTimes(1);
    }
  });

  it("still rejects missing sessions and untrusted origins", async () => {
    const cookie = await signIn("session-once-guard");
    expect((await app.request("/api/breakdowns")).status).toBe(401);
    expect((await app.request(`/api/articles/${missing}/preview`)).status).toBe(
      401,
    );
    expect(
      (
        await write(
          cookie,
          "/breakdowns",
          { content: "正文" },
          { source: "https://untrusted.example" },
        )
      ).status,
    ).toBe(403);
  });
});
