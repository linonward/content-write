import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type { PoolClient } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) {
    pool = new Pool({ connectionString, max: 10 });
    pool.on("error", () => {
      // Idle connections may fail while PostgreSQL restarts. New requests retry.
      console.error("database: idle connection lost");
    });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool());
}
