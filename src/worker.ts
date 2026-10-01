import { setTimeout } from "node:timers/promises";
import { getPool } from "./server/db/client";
import { checkDatabase } from "./server/db/health";

const shutdown = new AbortController();
process.on("SIGINT", () => shutdown.abort());
process.on("SIGTERM", () => shutdown.abort());

async function main() {
  try {
    while (!shutdown.signal.aborted) {
      const ready = await checkDatabase();
      if (!ready) console.error("worker: database unavailable");
      try {
        await setTimeout(5000, undefined, { signal: shutdown.signal });
      } catch (error) {
        if (!shutdown.signal.aborted) throw error;
      }
    }
  } finally {
    await getPool().end();
  }
}

main().catch((error: unknown) => {
  console.error("worker: stopped", error);
  process.exitCode = 1;
});
