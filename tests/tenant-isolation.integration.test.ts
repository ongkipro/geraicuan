import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { listTenantOutlets, listTenantShipments } from "@/db/tenant-repository";
import {
  TenantContextDeniedError,
  withTenantContext,
} from "@/db/tenant-context";
import * as schema from "@/db/schema";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;

if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required for integration tests.");
}

if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const adminDb = drizzle({ client: adminPool, schema });

const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-0000-0000-000000000001";
const tenantB = "00000000-0000-0000-0000-000000000002";
const outletA = "00000000-0000-0000-0000-000000000011";
const outletB = "00000000-0000-0000-0000-000000000012";
const shipmentA = "00000000-0000-0000-0000-000000000021";
const shipmentB = "00000000-0000-0000-0000-000000000022";

beforeAll(async () => {
  await adminPool.query("DROP ROLE IF EXISTS geraicuan_test_runtime");
  await adminPool.query(
    "CREATE ROLE geraicuan_test_runtime LOGIN INHERIT IN ROLE geraicuan_app",
  );

  await adminPool.query("TRUNCATE shipments, outlets, memberships, tenants, users CASCADE");
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)",
    ["user-a", "User A", "user-a@example.test", "user-b", "User B", "user-b@example.test"],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, $2, 'ACTIVE'), ($3, $4, 'ACTIVE')",
    [tenantA, "Tenant A", tenantB, "Tenant B"],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR'), ($3, $4, 'OPERATOR')",
    [tenantA, "user-a", tenantB, "user-b"],
  );
  await adminPool.query(
    "INSERT INTO outlets (id, tenant_id, name) VALUES ($1, $2, $3), ($4, $5, $6)",
    [outletA, tenantA, "Outlet A", outletB, tenantB, "Outlet B"],
  );
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id) VALUES ($1, $2, $3), ($4, $5, $6)",
    [shipmentA, tenantA, outletA, shipmentB, tenantB, outletB],
  );
});

afterAll(async () => {
  await adminPool.query("TRUNCATE shipments, outlets, memberships, tenants, users CASCADE");
  await adminPool.query("DROP ROLE geraicuan_test_runtime");
  await Promise.all([adminPool.end(), appPool.end()]);
});

describe("tenant-scoped query boundary", () => {
  it("returns only the authenticated member's outlet and shipment rows", async () => {
    await expect(appPool.query("SELECT id FROM outlets")).resolves.toMatchObject({ rows: [] });

    const result = await withTenantContext(appDb, "user-a", tenantA, async (tx, context) => ({
      outlets: await listTenantOutlets(tx, context),
      shipments: await listTenantShipments(tx, context),
      rlsVisibleOutlets: await tx.select({ id: schema.outlets.id }).from(schema.outlets),
      blockedCrossTenantUpdate: await tx
        .update(schema.outlets)
        .set({ name: "blocked" })
        .where(eq(schema.outlets.id, outletB))
        .returning({ id: schema.outlets.id }),
    }));

    expect(result.outlets).toEqual([{ id: outletA, name: "Outlet A" }]);
    expect(result.shipments).toEqual([
      { id: shipmentA, outletId: outletA, status: "DRAFT" },
    ]);
    expect(result.rlsVisibleOutlets).toEqual([{ id: outletA }]);
    expect(result.blockedCrossTenantUpdate).toEqual([]);
  });

  it("revokes tenant context immediately for a suspended membership", async () => {
    await adminPool.query("UPDATE memberships SET status = 'SUSPENDED' WHERE user_id = $1", ["user-a"]);
    await expect(
      withTenantContext(appDb, "user-a", tenantA, async (tx, context) =>
        listTenantOutlets(tx, context),
      ),
    ).rejects.toBeInstanceOf(TenantContextDeniedError);
  });

  it("rejects a client-supplied tenant candidate without a matching membership", async () => {
    await expect(
      withTenantContext(appDb, "user-a", tenantB, async (tx, context) =>
        listTenantOutlets(tx, context),
      ),
    ).rejects.toBeInstanceOf(TenantContextDeniedError);
  });

  it("rejects malformed tenant candidates without issuing a database error", async () => {
    await expect(
      withTenantContext(appDb, "user-a", "not-a-uuid", async (tx, context) =>
        listTenantOutlets(tx, context),
      ),
    ).rejects.toBeInstanceOf(TenantContextDeniedError);
  });

  it("rejects a migration-role database connection", async () => {
    await expect(
      withTenantContext(adminDb, "user-a", tenantA, async (tx, context) =>
        listTenantOutlets(tx, context),
      ),
    ).rejects.toBeInstanceOf(TenantContextDeniedError);
  });
});
