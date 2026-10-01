import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { getDb, getPool } from "../../src/server/db/client";
import { serviceState } from "../../src/server/db/schema";

describe("PostgreSQL baseline", () => {
  afterAll(async () => {
    await getPool().end();
  });

  it("persists and reads a row after migration", async () => {
    const db = getDb();
    await db
      .insert(serviceState)
      .values({ key: "test-readiness", value: 1 })
      .onConflictDoUpdate({
        target: serviceState.key,
        set: { value: 1 },
      });
    const rows = await db
      .select()
      .from(serviceState)
      .where(eq(serviceState.key, "test-readiness"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(1);
    await db.delete(serviceState).where(eq(serviceState.key, "test-readiness"));
  });
});
