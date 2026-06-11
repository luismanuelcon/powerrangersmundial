import pg from "pg";
import { loadEnv } from "./config.mjs";

loadEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está configurada");
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});
