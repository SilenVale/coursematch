import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "migrations", "001_initial.sql"), "utf8");

async function main() {
  await pool.query(sql);
  console.log("Migration 001 applied.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
