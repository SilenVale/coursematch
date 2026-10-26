import { hydrateSiteLlmFromDatabase } from "./assistant/llm-secret-db.js";
import { buildApp } from "./app.js";
import { pool } from "./db/pool.js";

const port = Number(process.env.PORT ?? process.env.API_PORT ?? "3001");

await hydrateSiteLlmFromDatabase(pool);
const app = await buildApp();
await app.listen({ port, host: "0.0.0.0" });
