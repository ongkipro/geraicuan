import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  createShipmentDraft,
  OutletUnavailableError,
} from "@/db/shipment-draft-repository";
import { withTenantContext } from "@/db/tenant-context";
import * as schema from "@/db/schema";
import { validateShipmentDraft } from "@/lib/shipment-draft";

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

const tenantA = "00000000-0000-0000-0000-000000000101";
const tenantB = "00000000-0000-0000-0000-000000000102";
const outletA = "00000000-0000-0000-0000-000000000111";
const outletB = "00000000-0000-0000-0000-000000000112";

function submission(values: Record<string, string> = {}) {
  const formData = new FormData();
  const defaults: Record<string, string> = {
    declaredValue: "150.000",
    destinationAreaId: "3171010",
    destinationAreaLabel: "Gambir, Jakarta Pusat",
    outletId: outletA,
    packageContent: "Pakaian",
    packageHeightCm: "",
    packageLengthCm: "",
    packageQuantity: "1",
    packageWeightGrams: "500",
    packageWidthCm: "",
    paymentType: "NON_COD",
    recipientAddress: "Jl. Medan Merdeka Barat 1",
    recipientName: "Penerima",
    recipientPhone: "+62 812-3456-7890",
    senderAddress: "Jl. Asia Afrika 8",
    senderName: "Pengirim",
    senderPhone: "0812 1234 5678",
    ...values,
  };

  for (const [key, value] of Object.entries(defaults)) formData.set(key, value);
  return formData;
}

beforeAll(async () => {
  await adminPool.query("DROP ROLE IF EXISTS geraicuan_test_runtime");
  await adminPool.query(
    "CREATE ROLE geraicuan_test_runtime LOGIN INHERIT IN ROLE geraicuan_app",
  );
  await adminPool.query(
    "TRUNCATE shipment_parties, shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE",
  );
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)",
    ["draft-user-a", "Draft User A", "draft-a@example.test", "draft-user-b", "Draft User B", "draft-b@example.test"],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, $2, 'ACTIVE'), ($3, $4, 'ACTIVE')",
    [tenantA, "Draft Tenant A", tenantB, "Draft Tenant B"],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR'), ($3, $4, 'OPERATOR')",
    [tenantA, "draft-user-a", tenantB, "draft-user-b"],
  );
  await adminPool.query(
    "INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)",
    [outletA, tenantA, "Draft Outlet A", "pickup-a", "origin-a", outletB, tenantB, "Draft Outlet B", "pickup-b", "origin-b"],
  );
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("tenant shipment drafts", () => {
  it("persists a valid tenant-scoped draft and immutable parties", async () => {
    const validated = validateShipmentDraft(submission());
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const shipmentId = await withTenantContext(appDb, "draft-user-a", tenantA, (tx, context) =>
      createShipmentDraft(tx, context, validated.input),
    );

    const [draft] = await adminDb
      .select()
      .from(schema.shipmentDrafts)
      .where(eq(schema.shipmentDrafts.shipmentId, shipmentId));
    const parties = await adminDb
      .select({ phone: schema.shipmentParties.phone, role: schema.shipmentParties.role })
      .from(schema.shipmentParties)
      .where(eq(schema.shipmentParties.shipmentId, shipmentId));

    expect(draft).toMatchObject({
      declaredValueIdr: 150000,
      destinationAreaId: "3171010",
      isCod: false,
      packageHeightCm: null,
      packageWeightGrams: 500,
      tenantId: tenantA,
    });
    expect(parties).toHaveLength(2);
    expect(parties).toEqual(expect.arrayContaining([
      { phone: "081212345678", role: "SENDER" },
      { phone: "+6281234567890", role: "RECIPIENT" },
    ]));

    await expect(
      withTenantContext(appDb, "draft-user-a", tenantA, (tx) =>
        tx
          .update(schema.shipmentParties)
          .set({ address: "Tidak boleh berubah" })
          .where(eq(schema.shipmentParties.shipmentId, shipmentId)),
      ),
    ).rejects.toThrow();

    const blockedCrossTenantUpdate = await withTenantContext(
      appDb,
      "draft-user-b",
      tenantB,
      (tx) =>
        tx
          .update(schema.shipmentDrafts)
          .set({ packageContent: "Tampered" })
          .where(eq(schema.shipmentDrafts.tenantId, tenantA))
          .returning({ shipmentId: schema.shipmentDrafts.shipmentId }),
    );
    expect(blockedCrossTenantUpdate).toEqual([]);

    const otherTenantRows = await withTenantContext(appDb, "draft-user-b", tenantB, (tx) =>
      tx.select().from(schema.shipmentDrafts),
    );
    expect(otherTenantRows).toEqual([]);
  });

  it("rejects invalid input and a cross-tenant outlet without persisting a shipment", async () => {
    const invalid = validateShipmentDraft(
      submission({
        destinationAreaId: "x".repeat(161),
        outletId: "not-a-uuid",
        paymentType: "COD",
        declaredValue: "0",
        recipientPhone: "not-a-phone",
      }),
    );
    expect(invalid).toMatchObject({
      ok: false,
      errors: {
        declaredValue: expect.any(String),
        destinationAreaId: expect.any(String),
        outletId: expect.any(String),
        recipientPhone: expect.any(String),
      },
    });

    const valid = validateShipmentDraft(submission({ outletId: outletB }));
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;

    const before = await adminDb.select({ id: schema.shipments.id }).from(schema.shipments);
    await expect(
      withTenantContext(appDb, "draft-user-a", tenantA, (tx, context) =>
        createShipmentDraft(tx, context, valid.input),
      ),
    ).rejects.toBeInstanceOf(OutletUnavailableError);
    const after = await adminDb.select({ id: schema.shipments.id }).from(schema.shipments);

    expect(after).toEqual(before);
  });
});
