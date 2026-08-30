import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  CodTotalsUnavailableError,
  loadCodTotalsForShipment,
  persistCodTotalsForEstimate,
} from "@/db/cod-totals-repository";
import {
  appendEstimateSnapshot,
  type EstimateRequestMetadata,
  type SupportedEstimateService,
} from "@/db/estimate-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";

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

const tenantA = "00000000-0000-0000-0000-000000000701";
const tenantB = "00000000-0000-0000-0000-000000000702";
const outletA = "00000000-0000-0000-0000-000000000711";
const outletB = "00000000-0000-0000-0000-000000000712";
const eligibleShipment = "00000000-0000-0000-0000-000000000721";
const nonCodShipment = "00000000-0000-0000-0000-000000000722";
const nonAppendableShipment = "00000000-0000-0000-0000-000000000723";

const codRequest = {
  originAreaId: "origin-a",
  destinationAreaId: "destination-a",
  weightGrams: 1_000,
  isCodRequested: true,
  credentialSource: "platform_default",
} satisfies EstimateRequestMetadata;

const services = [
  {
    providerService: "JNE-COD",
    currency: "IDR",
    shippingAmountIdr: 10_000,
    shippingSourceField: "price",
    insuranceAmountIdr: null,
    insuranceSourceField: null,
    deliveryEstimate: "2 - 3 days",
    codEligible: true,
  },
  {
    providerService: "NO-COD",
    currency: "IDR",
    shippingAmountIdr: 9_000,
    shippingSourceField: "price",
    insuranceAmountIdr: null,
    insuranceSourceField: null,
    deliveryEstimate: "1 - 2 days",
    codEligible: false,
  },
] satisfies readonly SupportedEstimateService[];

beforeAll(async () => {
  await adminPool.query("DROP ROLE IF EXISTS geraicuan_test_runtime");
  await adminPool.query(
    "CREATE ROLE geraicuan_test_runtime LOGIN INHERIT IN ROLE geraicuan_app",
  );
});

beforeEach(async () => {
  await adminPool.query(
    "TRUNCATE shipment_cod_totals, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties, shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE",
  );
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)",
    [
      "cod-user-a",
      "COD User A",
      "cod-a@example.test",
      "cod-user-b",
      "COD User B",
      "cod-b@example.test",
    ],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, $2, 'ACTIVE'), ($3, $4, 'ACTIVE')",
    [tenantA, "COD Tenant A", tenantB, "COD Tenant B"],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR'), ($3, $4, 'OPERATOR')",
    [tenantA, "cod-user-a", tenantB, "cod-user-b"],
  );
  await adminPool.query(
    "INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)",
    [
      outletA,
      tenantA,
      "COD Outlet A",
      "pickup-a",
      codRequest.originAreaId,
      outletB,
      tenantB,
      "COD Outlet B",
      "pickup-b",
      "origin-b",
    ],
  );
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id) VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)",
    [
      eligibleShipment,
      tenantA,
      outletA,
      nonCodShipment,
      tenantA,
      outletA,
      nonAppendableShipment,
      tenantA,
      outletA,
    ],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod
    ) VALUES
      ($1, $2, $3, $4, $5, $6, 1, 100000, true),
      ($7, $8, $9, $10, $11, $12, 1, 100000, false),
      ($13, $14, $15, $16, $17, $18, 1, 100000, true)`,
    [
      eligibleShipment,
      tenantA,
      codRequest.destinationAreaId,
      "Destination A",
      "COD package",
      codRequest.weightGrams,
      nonCodShipment,
      tenantA,
      codRequest.destinationAreaId,
      "Destination A",
      "Non-COD package",
      codRequest.weightGrams,
      nonAppendableShipment,
      tenantA,
      codRequest.destinationAreaId,
      "Destination A",
      "Queued package",
      codRequest.weightGrams,
    ],
  );
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("shipment COD totals", () => {
  it("persists exact whole-IDR components and reads the immutable values", async () => {
    const snapshotId = await withTenantContext(
      appDb,
      "cod-user-a",
      tenantA,
      (tx, context) =>
        appendEstimateSnapshot(tx, context, eligibleShipment, codRequest, services),
    );

    const persisted = await withTenantContext(
      appDb,
      "cod-user-a",
      tenantA,
      (tx, context) =>
        persistCodTotalsForEstimate(tx, context, {
          shipmentId: eligibleShipment,
          snapshotId,
          providerService: "JNE-COD",
        }),
    );

    expect(persisted).toMatchObject({
      shipmentId: eligibleShipment,
      snapshotId,
      currency: "IDR",
      goodsValueIdr: 100_000,
      shippingAmountIdr: 10_000,
      serviceFeeIdr: 3_300,
      vatAmountIdr: 363,
      providerCodAmountIdr: 113_663,
    });

    const stored = await adminDb
      .select()
      .from(schema.shipmentCodTotals)
      .where(eq(schema.shipmentCodTotals.id, persisted.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject(persisted);

    await expect(
      withTenantContext(appDb, "cod-user-a", tenantA, (tx) =>
        tx
          .update(schema.shipmentCodTotals)
          .set({ serviceFeeIdr: 1 })
          .where(eq(schema.shipmentCodTotals.id, persisted.id)),
      ),
    ).rejects.toThrow();
    await expect(
      withTenantContext(appDb, "cod-user-a", tenantA, (tx) =>
        tx
          .delete(schema.shipmentCodTotals)
          .where(eq(schema.shipmentCodTotals.id, persisted.id)),
      ),
    ).rejects.toThrow();

    await adminDb
      .update(schema.shipmentDrafts)
      .set({ declaredValueIdr: 200_000 })
      .where(eq(schema.shipmentDrafts.shipmentId, eligibleShipment));

    const loaded = await withTenantContext(
      appDb,
      "cod-user-a",
      tenantA,
      (tx, context) => loadCodTotalsForShipment(tx, context, eligibleShipment),
    );
    expect(loaded).toMatchObject({
      id: persisted.id,
      goodsValueIdr: 100_000,
      shippingAmountIdr: 10_000,
      serviceFeeIdr: 3_300,
      vatAmountIdr: 363,
      providerCodAmountIdr: 113_663,
    });
  });

  it("denies unsupported COD, cross-tenant, non-COD, and non-appendable selections", async () => {
    const snapshotId = await withTenantContext(
      appDb,
      "cod-user-a",
      tenantA,
      (tx, context) =>
        appendEstimateSnapshot(tx, context, eligibleShipment, codRequest, services),
    );

    await expect(
      withTenantContext(appDb, "cod-user-a", tenantA, (tx, context) =>
        persistCodTotalsForEstimate(tx, context, {
          shipmentId: eligibleShipment,
          snapshotId,
          providerService: "NO-COD",
        }),
      ),
    ).rejects.toBeInstanceOf(CodTotalsUnavailableError);

    await expect(
      withTenantContext(appDb, "cod-user-b", tenantB, (tx, context) =>
        persistCodTotalsForEstimate(tx, context, {
          shipmentId: eligibleShipment,
          snapshotId,
          providerService: "JNE-COD",
        }),
      ),
    ).rejects.toBeInstanceOf(CodTotalsUnavailableError);

    const selectedService = await adminDb
      .select({ id: schema.shipmentEstimateServices.id })
      .from(schema.shipmentEstimateServices)
      .where(
        eq(schema.shipmentEstimateServices.providerService, "JNE-COD"),
      );
    await expect(
      adminDb.insert(schema.shipmentCodTotals).values({
        tenantId: tenantB,
        shipmentId: eligibleShipment,
        snapshotId,
        estimateServiceId: selectedService[0]!.id,
        currency: "IDR",
        goodsValueIdr: 100_000,
        shippingAmountIdr: 10_000,
        serviceFeeIdr: 3_300,
        vatAmountIdr: 363,
        providerCodAmountIdr: 113_663,
      }),
    ).rejects.toThrow();

    const nonCodSnapshotId = await withTenantContext(
      appDb,
      "cod-user-a",
      tenantA,
      (tx, context) =>
        appendEstimateSnapshot(
          tx,
          context,
          nonCodShipment,
          { ...codRequest, isCodRequested: false },
          [services[0]],
        ),
    );
    await expect(
      withTenantContext(appDb, "cod-user-a", tenantA, (tx, context) =>
        persistCodTotalsForEstimate(tx, context, {
          shipmentId: nonCodShipment,
          snapshotId: nonCodSnapshotId,
          providerService: "JNE-COD",
        }),
      ),
    ).rejects.toBeInstanceOf(CodTotalsUnavailableError);

    const nonAppendableSnapshotId = await withTenantContext(
      appDb,
      "cod-user-a",
      tenantA,
      (tx, context) =>
        appendEstimateSnapshot(
          tx,
          context,
          nonAppendableShipment,
          codRequest,
          [services[0]],
        ),
    );
    await adminDb
      .update(schema.shipments)
      .set({ status: "SUBMISSION_QUEUED" })
      .where(eq(schema.shipments.id, nonAppendableShipment));
    await expect(
      withTenantContext(appDb, "cod-user-a", tenantA, (tx, context) =>
        persistCodTotalsForEstimate(tx, context, {
          shipmentId: nonAppendableShipment,
          snapshotId: nonAppendableSnapshotId,
          providerService: "JNE-COD",
        }),
      ),
    ).rejects.toBeInstanceOf(CodTotalsUnavailableError);

    const rows = await adminDb.select().from(schema.shipmentCodTotals);
    expect(rows).toEqual([]);
  });
});
