import { setTimeout } from "node:timers/promises";
import { getPool } from "@content-write/db/client";
import { checkDatabase } from "@content-write/db/health";
import { processOneJob } from "./jobs";

const shutdown = new AbortController();
process.on("SIGINT", () => shutdown.abort());
process.on("SIGTERM", () => shutdown.abort());

async function main() {
  try {
    while (!shutdown.signal.aborted) {
      const ready = await checkDatabase();
      if (!ready) console.error("worker: database unavailable");
      if (ready) {
        try {
          if (await processOneJob()) continue;
        } catch {
          console.error("worker: job processing failed");
        }
      }
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
