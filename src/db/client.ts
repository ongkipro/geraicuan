import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

const appDatabaseUrl = process.env.APP_DATABASE_URL;

if (!appDatabaseUrl) {
  throw new Error("APP_DATABASE_URL is required.");
}

if (appDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error("APP_DATABASE_URL must not use the migration role.");
}

const pool = new Pool({ connectionString: appDatabaseUrl });

export const db = drizzle({ client: pool, schema });
