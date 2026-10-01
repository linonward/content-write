import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

export type { PoolClient } from "pg";

export type Database = NodePgDatabase;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run a query: the pool-backed database or an open transaction. */
export type Executor = Database | Transaction;

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

export function getDb(): Database {
  return drizzle(getPool());
}

/**
 * Runs Drizzle queries inside a transaction already opened on a raw pg client.
 * Transitional: only for modules not yet migrated to getDb().transaction() (T027b/c).
 */
export function fromClient(client: PoolClient): Database {
  return drizzle(client);
}
