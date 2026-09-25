import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { takePgQueryOverlaps } from "./pg-query-overlap-guard";

const adminDatabaseUrl = process.env.DATABASE_URL;
if (!adminDatabaseUrl || new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}
const pool = new Pool({ connectionString: adminDatabaseUrl, max: 2 });
const db = drizzle({ client: pool, schema });

afterAll(() => pool.end());

describe("pg query overlap guard (T-197)", () => {
  it("records queries sent concurrently inside one transaction", async () => {
    await db.transaction(async (tx) => {
      await Promise.all([tx.execute(sql`select 1`), tx.execute(sql`select 2`)]);
    });
    // Taken here so this deliberate overlap does not fail the test through the setup hook.
    expect(takePgQueryOverlaps()).toEqual(["select 2"]);
  });

  it("records nothing for queries awaited in turn, or run on separate pool connections", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select 1`);
      await tx.execute(sql`select 2`);
    });
    await Promise.all([db.execute(sql`select 1`), db.execute(sql`select 2`)]);
    expect(takePgQueryOverlaps()).toEqual([]);
  });
});
