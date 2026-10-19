import pg from "pg";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new pg.Pool({ connectionString: databaseUrl });
