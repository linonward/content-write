import { serve } from "@hono/node-server";
import { app } from "./app";
import { assertRuntimeConfig } from "./config";

assertRuntimeConfig();

const port = Number(process.env.API_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("API_PORT must be a valid TCP port");
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api: listening on http://localhost:${info.port}`);
});
