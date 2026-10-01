import { sql } from "drizzle-orm";
import { getDb } from "./client";

export async function checkDatabase(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
