import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  appendEstimateSnapshot,
  DraftEstimateUnavailableError,
  loadDraftEstimateInput,
  loadLatestEstimateSnapshot,
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

const tenantA = "00000000-0000-0000-0000-000000000601";
const tenantB = "00000000-0000-0000-0000-000000000602";
const outletA = "00000000-0000-0000-0000-000000000611";
const outletB = "00000000-0000-0000-0000-000000000612";
const shipmentA = "00000000-0000-0000-0000-000000000621";
const shipmentB = "00000000-0000-0000-0000-000000000622";

const request = {
  originAreaId: "same-as-origin",
  destinationAreaId: "same-as-origin",
  weightGrams: 1_000,
  isCodRequested: false,
  credentialSource: "platform_default",
} satisfies EstimateRequestMetadata;

// Exact allowlisted values normalized from tests/fixtures/mengantar-estimate.sandbox.json.
const fixtureServices = [
  {
    providerService: "JNE",
    currency: "IDR",
    shippingAmountIdr: 8_000,
    shippingSourceField: "price",
    insuranceAmountIdr: null,
    insuranceSourceField: null,
    deliveryEstimate: "2 - 3 days",
    codEligible: true,
  },
  {
    providerService: "SapCargo",
    currency: "IDR",
    shippingAmountIdr: 22_500,
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
    "TRUNCATE shipment_estimate_services, shipment_estimate_snapshots, shipment_parties, shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE",
  );
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)",
    [
      "estimate-user-a",
      "Estimate User A",
      "estimate-a@example.test",
      "estimate-user-b",
      "Estimate User B",
      "estimate-b@example.test",
    ],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, $2, 'ACTIVE'), ($3, $4, 'ACTIVE')",
    [tenantA, "Estimate Tenant A", tenantB, "Estimate Tenant B"],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR'), ($3, $4, 'OPERATOR')",
    [tenantA, "estimate-user-a", tenantB, "estimate-user-b"],
  );
  await adminPool.query(
    "INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)",
    [
      outletA,
      tenantA,
      "Estimate Outlet A",
      "pickup-a",
      request.originAreaId,
      outletB,
      tenantB,
      "Estimate Outlet B",
      "pickup-b",
      "origin-b",
    ],
  );
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id) VALUES ($1, $2, $3), ($4, $5, $6)",
    [shipmentA, tenantA, outletA, shipmentB, tenantB, outletB],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod
    ) VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, false),
      ($9, $10, $11, $12, $13, $14, $15, $16, false)`,
    [
      shipmentA,
      tenantA,
      request.destinationAreaId,
      "Same area",
      "Fixture package",
      request.weightGrams,
      1,
      100_000,
      shipmentB,
      tenantB,
      "destination-b",
      "Destination B",
      "Other package",
      500,
      1,
      50_000,
    ],
  );
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("shipment estimate snapshots", () => {
  it("loads a draft context and appends immutable fixture-normalized retrievals", async () => {
    const draft = await withTenantContext(
      appDb,
      "estimate-user-a",
      tenantA,
      (tx, context) => loadDraftEstimateInput(tx, context, shipmentA),
    );

    expect(draft).toEqual({
      shipmentId: shipmentA,
      outletId: outletA,
      originAreaId: request.originAreaId,
      destinationAreaId: request.destinationAreaId,
      weightGrams: request.weightGrams,
      isCod: false,
    });

    const firstSnapshotId = await withTenantContext(
      appDb,
      "estimate-user-a",
      tenantA,
      (tx, context) =>
        appendEstimateSnapshot(tx, context, shipmentA, request, fixtureServices),
    );

    const [estimatedShipment] = await adminDb
      .select({ status: schema.shipments.status, updatedAt: schema.shipments.updatedAt })
      .from(schema.shipments)
      .where(eq(schema.shipments.id, shipmentA));
    const [firstHeader] = await adminDb
      .select()
      .from(schema.shipmentEstimateSnapshots)
      .where(eq(schema.shipmentEstimateSnapshots.id, firstSnapshotId));
    const firstServices = await adminDb
      .select({
        providerService: schema.shipmentEstimateServices.providerService,
        currency: schema.shipmentEstimateServices.currency,
        shippingAmountIdr: schema.shipmentEstimateServices.shippingAmountIdr,
        shippingSourceField: schema.shipmentEstimateServices.shippingSourceField,
        insuranceAmountIdr: schema.shipmentEstimateServices.insuranceAmountIdr,
        insuranceSourceField: schema.shipmentEstimateServices.insuranceSourceField,
        deliveryEstimate: schema.shipmentEstimateServices.deliveryEstimate,
        codEligible: schema.shipmentEstimateServices.codEligible,
      })
      .from(schema.shipmentEstimateServices)
      .where(eq(schema.shipmentEstimateServices.snapshotId, firstSnapshotId));

    expect(estimatedShipment?.status).toBe("ESTIMATED");
    expect(firstHeader).toMatchObject({
      id: firstSnapshotId,
      tenantId: tenantA,
      shipmentId: shipmentA,
      outletId: outletA,
      originAreaId: request.originAreaId,
      destinationAreaId: request.destinationAreaId,
      weightGrams: request.weightGrams,
      isCodRequested: false,
      credentialSource: "platform_default",
    });
    expect(firstServices).toEqual(expect.arrayContaining(fixtureServices));

    await expect(
      withTenantContext(appDb, "estimate-user-a", tenantA, (tx, context) =>
        loadDraftEstimateInput(tx, context, shipmentA),
      ),
    ).resolves.toMatchObject({ shipmentId: shipmentA });

    const secondServices = [
      { ...fixtureServices[0], shippingAmountIdr: 9_000 },
    ] satisfies readonly SupportedEstimateService[];
    const secondSnapshotId = await withTenantContext(
      appDb,
      "estimate-user-a",
      tenantA,
      (tx, context) =>
        appendEstimateSnapshot(
          tx,
          context,
          shipmentA,
          { ...request, credentialSource: "private" },
          secondServices,
        ),
    );

    const [shipmentAfterRetrieval] = await adminDb
      .select({ status: schema.shipments.status, updatedAt: schema.shipments.updatedAt })
      .from(schema.shipments)
      .where(eq(schema.shipments.id, shipmentA));
    const oldServiceAfterRetrieval = await adminDb
      .select({
        providerService: schema.shipmentEstimateServices.providerService,
        shippingAmountIdr: schema.shipmentEstimateServices.shippingAmountIdr,
      })
      .from(schema.shipmentEstimateServices)
      .where(eq(schema.shipmentEstimateServices.snapshotId, firstSnapshotId));

    expect(secondSnapshotId).not.toBe(firstSnapshotId);
    expect(shipmentAfterRetrieval).toEqual(estimatedShipment);
    expect(oldServiceAfterRetrieval).toEqual(
      expect.arrayContaining([
        { providerService: "JNE", shippingAmountIdr: 8_000 },
        { providerService: "SapCargo", shippingAmountIdr: 22_500 },
      ]),
    );

    const latest = await withTenantContext(
      appDb,
      "estimate-user-a",
      tenantA,
      (tx, context) => loadLatestEstimateSnapshot(tx, context, shipmentA),
    );
    expect(latest).toMatchObject({
      snapshotId: secondSnapshotId,
      shipmentId: shipmentA,
      outletId: outletA,
      request: { ...request, credentialSource: "private" },
      services: [{ providerService: "JNE", shippingAmountIdr: 9_000 }],
    });

    await expect(
      withTenantContext(appDb, "estimate-user-a", tenantA, (tx) =>
        tx
          .update(schema.shipmentEstimateServices)
          .set({ shippingAmountIdr: 1 })
          .where(eq(schema.shipmentEstimateServices.snapshotId, firstSnapshotId)),
      ),
    ).rejects.toThrow();
    await expect(
      withTenantContext(appDb, "estimate-user-a", tenantA, (tx) =>
        tx
          .delete(schema.shipmentEstimateSnapshots)
          .where(eq(schema.shipmentEstimateSnapshots.id, firstSnapshotId)),
      ),
    ).rejects.toThrow();

    const immutableHeader = await adminDb
      .select({ id: schema.shipmentEstimateSnapshots.id })
      .from(schema.shipmentEstimateSnapshots)
      .where(eq(schema.shipmentEstimateSnapshots.id, firstSnapshotId));
    expect(immutableHeader).toEqual([{ id: firstSnapshotId }]);
  });

  it("denies cross-tenant resolution and snapshot insertion", async () => {
    await expect(
      withTenantContext(appDb, "estimate-user-b", tenantB, (tx, context) =>
        loadDraftEstimateInput(tx, context, shipmentA),
      ),
    ).rejects.toBeInstanceOf(DraftEstimateUnavailableError);

    await expect(
      withTenantContext(appDb, "estimate-user-b", tenantB, (tx, context) =>
        appendEstimateSnapshot(tx, context, shipmentA, request, fixtureServices),
      ),
    ).rejects.toBeInstanceOf(DraftEstimateUnavailableError);

    await expect(
      withTenantContext(appDb, "estimate-user-b", tenantB, (tx) =>
        tx.insert(schema.shipmentEstimateSnapshots).values({
          tenantId: tenantB,
          shipmentId: shipmentA,
          outletId: outletA,
          originAreaId: request.originAreaId,
          destinationAreaId: request.destinationAreaId,
          weightGrams: request.weightGrams,
          isCodRequested: request.isCodRequested,
          credentialSource: request.credentialSource,
        }),
      ),
    ).rejects.toThrow();

    const rows = await adminDb
      .select({ id: schema.shipmentEstimateSnapshots.id })
      .from(schema.shipmentEstimateSnapshots);
    const [shipment] = await adminDb
      .select({ status: schema.shipments.status })
      .from(schema.shipments)
      .where(eq(schema.shipments.id, shipmentA));
    expect(rows).toEqual([]);
    expect(shipment?.status).toBe("DRAFT");

    await withTenantContext(appDb, "estimate-user-a", tenantA, (tx, context) =>
      appendEstimateSnapshot(tx, context, shipmentA, request, fixtureServices),
    );
    const crossTenantLatest = await withTenantContext(
      appDb,
      "estimate-user-b",
      tenantB,
      (tx, context) => loadLatestEstimateSnapshot(tx, context, shipmentA),
    );
    expect(crossTenantLatest).toBeNull();
  });

  it("rolls back snapshots unless request context and shipment status are appendable", async () => {
    await expect(
      withTenantContext(appDb, "estimate-user-a", tenantA, (tx, context) =>
        appendEstimateSnapshot(
          tx,
          context,
          shipmentA,
          { ...request, weightGrams: request.weightGrams + 1 },
          fixtureServices,
        ),
      ),
    ).rejects.toBeInstanceOf(DraftEstimateUnavailableError);

    await expect(
      withTenantContext(appDb, "estimate-user-a", tenantA, (tx, context) =>
        appendEstimateSnapshot(tx, context, shipmentA, request, [
          fixtureServices[0],
          fixtureServices[0],
        ]),
      ),
    ).rejects.toThrow();

    const [draftAfterRollback] = await adminDb
      .select({ status: schema.shipments.status })
      .from(schema.shipments)
      .where(eq(schema.shipments.id, shipmentA));
    const snapshotsAfterRollback = await adminDb
      .select({ id: schema.shipmentEstimateSnapshots.id })
      .from(schema.shipmentEstimateSnapshots)
      .where(
        and(
          eq(schema.shipmentEstimateSnapshots.tenantId, tenantA),
          eq(schema.shipmentEstimateSnapshots.shipmentId, shipmentA),
        ),
      );
    expect(draftAfterRollback?.status).toBe("DRAFT");
    expect(snapshotsAfterRollback).toEqual([]);

    await adminDb
      .update(schema.shipments)
      .set({ status: "SUBMISSION_QUEUED" })
      .where(eq(schema.shipments.id, shipmentA));
    await expect(
      withTenantContext(appDb, "estimate-user-a", tenantA, (tx, context) =>
        appendEstimateSnapshot(tx, context, shipmentA, request, fixtureServices),
      ),
    ).rejects.toBeInstanceOf(DraftEstimateUnavailableError);

    const snapshotsAfterInvalidStatus = await adminDb
      .select({ id: schema.shipmentEstimateSnapshots.id })
      .from(schema.shipmentEstimateSnapshots)
      .where(eq(schema.shipmentEstimateSnapshots.shipmentId, shipmentA));
    expect(snapshotsAfterInvalidStatus).toEqual([]);
  });
});
