import { hydrateSiteLlmFromDatabase } from "./assistant/llm-secret-db.js";
import { buildApp } from "./app.js";
import { pool } from "./db/pool.js";
import { ensureDemoAccounts } from "./lib/ensure-demo-accounts.js";
import { isDevToolsEnabled } from "./lib/dev-tools.js";

const port = Number(process.env.PORT ?? process.env.API_PORT ?? "3001");

await hydrateSiteLlmFromDatabase(pool);
if (isDevToolsEnabled()) {
  await ensureDemoAccounts().catch((err) => {
    console.warn("[ensureDemoAccounts]", err);
  });
}
const app = await buildApp();
await app.listen({ port, host: "0.0.0.0" });
