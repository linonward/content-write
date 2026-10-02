import { sql } from "drizzle-orm";
import type { Executor } from "./client";

// Serializes a user's enqueue decisions and memory writes across api and worker.
// Drizzle has no advisory-lock builder, hence the raw statement.
export async function lockUserQueue(db: Executor, userId: string) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
}
