import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, getPool } from "../src/server/db/client";

try {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Database migrations applied");
} finally {
  await getPool().end();
}
