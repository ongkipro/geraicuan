import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { auditEventActions } from "@/db/schema";

// T-259 (DATA-23, migration 0069): CHECK audit_events_tenant_recorded, NOT VALID.
const adminUrl = process.env.DATABASE_URL;
if (!adminUrl || new URL(adminUrl).hostname !== "127.0.0.1" || new URL(adminUrl).pathname !== "/geraicuan_test") {
  throw new Error("Isolated local test database required.");
}
const admin = new Pool({ connectionString: adminUrl });
afterAll(() => admin.end());

const LIFECYCLE = ["TENANT_CREATED", "TENANT_SUSPENDED", "TENANT_REACTIVATED", "TENANT_ARCHIVED"];

/** Everything runs in one transaction that is rolled back: no audit row is left behind. */
async function inRolledBack(work: (client: PoolClient) => Promise<void>) {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await work(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

/** One INSERT under a savepoint; returns "ok" or the SQLSTATE. Runs as the owner/superuser, so RLS is not what decides. */
async function tryInsert(
  client: PoolClient,
  row: { action: string; outcome?: string; targetType: string; tenantId: string | null },
) {
  await client.query("SAVEPOINT probe");
  try {
    await client.query(
      "INSERT INTO audit_events (action, outcome, target_type, target_id, tenant_id) VALUES ($1, $2, $3, $4, $5)",
      [row.action, row.outcome ?? "SUCCESS", row.targetType, row.tenantId ?? "GLOBAL", row.tenantId],
    );
    await client.query("RELEASE SAVEPOINT probe");
    return "ok";
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT probe");
    return (error as { code?: string }).code ?? String(error);
  }
}

describe("T-259 audit rows about a gerai carry its tenant_id (CHECK audit_events_tenant_recorded)", () => {
  it("exists NOT VALID, so rows written before 0069 are not re-checked", async () => {
    const { rows } = await admin.query<{ convalidated: boolean; def: string }>(
      "SELECT convalidated, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.audit_events'::regclass AND conname = 'audit_events_tenant_recorded'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].convalidated).toBe(false);
    expect(rows[0].def).toContain("NOT VALID");
  });

  it("refuses a tenantless row for every action on a gerai target, for the owner too; the same row with its tenant is accepted", async () => {
    await inRolledBack(async (client) => {
      const tenantId = randomUUID();
      await client.query("INSERT INTO tenants (id, name, status) VALUES ($1, 'Audit guard fixture', 'ACTIVE')", [tenantId]);
      for (const action of auditEventActions) {
        for (const targetType of ["TENANT", "MEMBERSHIP", "OUTLET"]) {
          expect(await tryInsert(client, { action, targetType, tenantId: null }), `${action} ${targetType}`).toBe("23514");
          expect(await tryInsert(client, { action, targetType, tenantId }), `${action} ${targetType} with tenant`).toBe("ok");
        }
      }
      // A refused member action still names its gerai (the context tenant is always known).
      expect(await tryInsert(client, { action: "MEMBER_INVITED", outcome: "DENIED", targetType: "MEMBERSHIP", tenantId: null })).toBe("23514");
      // A refused prefix or registration action is not a lifecycle attempt either.
      expect(await tryInsert(client, { action: "SHIPMENT_PREFIX_LOCKED", outcome: "DENIED", targetType: "TENANT", tenantId: null })).toBe("23514");
    });
  });

  it("still accepts platform-wide rows and a refused lifecycle attempt on an unverified gerai", async () => {
    await inRolledBack(async (client) => {
      for (const action of ["ANNOUNCEMENT_SAVED", "ANNOUNCEMENT_PUBLISHED", "ANNOUNCEMENT_UNPUBLISHED", "PLATFORM_MONITORING_VIEWED"]) {
        expect(await tryInsert(client, { action, targetType: "PLATFORM", tenantId: null }), action).toBe("ok");
      }
      for (const action of LIFECYCLE) {
        expect(await tryInsert(client, { action, outcome: "DENIED", targetType: "TENANT", tenantId: null }), action).toBe("ok");
        expect(await tryInsert(client, { action, outcome: "SUCCESS", targetType: "TENANT", tenantId: null }), `${action} success`).toBe("23514");
      }
    });
  });

  it("leaves an existing tenantless gerai row untouched when the 0069 statement is applied, and refuses the next one", async () => {
    const migration = await readFile(new URL("../drizzle/0069_audit_tenant_recorded.sql", import.meta.url), "utf8");
    const statement = migration.split("--> statement-breakpoint").map((part) => part.trim()).find((part) => part.startsWith("ALTER TABLE"));
    expect(statement).toMatch(/ADD CONSTRAINT "audit_events_tenant_recorded" CHECK [^;]+ NOT VALID;$/);
    await inRolledBack(async (client) => {
      const tenantId = randomUUID();
      await client.query("INSERT INTO tenants (id, name, status) VALUES ($1, 'Audit guard legacy fixture', 'ACTIVE')", [tenantId]);
      // Recreate the pre-0069 state inside this transaction: no guard, one implicit lock stored the old way.
      await client.query("ALTER TABLE audit_events DROP CONSTRAINT audit_events_tenant_recorded");
      const legacy = await client.query<{ id: string }>(
        `INSERT INTO audit_events (action, outcome, target_type, target_id, tenant_id, metadata)
         VALUES ('SHIPMENT_PREFIX_LOCKED', 'SUCCESS', 'TENANT', $1, NULL, '{"implicit": true, "prefix": "GC"}') RETURNING id`,
        [tenantId],
      );
      const before = await client.query("SELECT to_jsonb(a) AS row FROM audit_events a WHERE id = $1", [legacy.rows[0].id]);
      await client.query(statement!);
      const after = await client.query("SELECT to_jsonb(a) AS row FROM audit_events a WHERE id = $1", [legacy.rows[0].id]);
      expect(after.rows).toEqual(before.rows);
      expect(after.rows[0].row).toMatchObject({ tenant_id: null, target_id: tenantId });
      expect(await tryInsert(client, { action: "SHIPMENT_PREFIX_LOCKED", targetType: "TENANT", tenantId: null })).toBe("23514");
    });
  });
});
