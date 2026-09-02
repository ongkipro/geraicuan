import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import {
  ShipmentReconciliationDeniedError,
  ShipmentReconciliationUnavailableError,
} from "@/db/shipment-reconciliation-repository";
import { TenantContextDeniedError } from "@/db/tenant-context";
import {
  type OrderConfirmation,
} from "@/db/order-batch-repository";
import {
  orchestrateFixtureBackedMengantarOrders,
  type MengantarOrderTransportBinding,
  type MengantarOrderTransportLookup,
} from "@/lib/mengantar-order";
import { resolveSanctionedReconciliationFixture } from "@/lib/sanctioned-reconciliation-fixture";
import {
  reconcileFixtureBackedShipment,
  type ShipmentReconciliationLookup,
} from "@/lib/shipment-reconciliation";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

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

const tenantA = "00000000-0000-0000-0000-000000000c01";
const tenantB = "00000000-0000-0000-0000-000000000c02";
const outletA = "00000000-0000-0000-0000-000000000c11";
const outletB = "00000000-0000-0000-0000-000000000c12";
const shipmentId = "00000000-0000-0000-0001-000000000c01";
const estimateSnapshotId = "00000000-0000-0000-0002-000000000c01";
const estimateServiceId = "00000000-0000-0000-0003-000000000c01";
const adminA = "reconciliation-admin-a";
const operatorA = "reconciliation-operator-a";
const adminB = "reconciliation-admin-b";
const previousFixtureFlag =
  process.env.GERAICUAN_ENABLE_SANCTIONED_RECONCILIATION_FIXTURE;

const confirmation: OrderConfirmation = {
  shipmentId,
  estimateSnapshotId,
  estimateServiceId,
};

function transportBinding(
  scope: Parameters<MengantarOrderTransportLookup>[0],
  submit: MengantarOrderTransportBinding["transport"]["submit"],
): MengantarOrderTransportBinding {
  return {
    tenantId: scope.tenantId,
    outletId: scope.outletId,
    pickupAddressId: scope.pickupAddressId,
    credentialSource: scope.credentialSource,
    accountIdentity: "platform_default",
    transport: { submit },
  };
}

async function seedUnknownShipment(onSubmit: () => void) {
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, 'ESTIMATED')",
    [shipmentId, tenantA, outletA],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod
    ) VALUES ($1, $2, 'fixture-destination', 'Fixture destination',
      'Sanitized fixture parcel', 1000, 1, 100000, false)`,
    [shipmentId, tenantA],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
      VALUES
      ($1, $2, 'SENDER', 'Synthetic Sender', '0000000000', 'Synthetic origin', NULL, NULL),
      ($1, $2, 'RECIPIENT', 'Synthetic Recipient', '0000000000', 'Synthetic destination', 'fixture-destination', 'Fixture destination')`,
    [tenantA, shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
      destination_area_label, weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'fixture-origin', 'fixture-destination', 'Fixture destination',
      1000, false, 'platform_default')`,
    [estimateSnapshotId, tenantA, shipmentId, outletA],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency,
      shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'JNE REG', 'IDR', 8000, 'price',
      'sanitized estimate', true)`,
    [estimateServiceId, tenantA, estimateSnapshotId],
  );

  await orchestrateFixtureBackedMengantarOrders({
    db: appDb,
    lockPool: appPool,
    principalId: adminA,
    tenantId: tenantA,
    confirmations: [confirmation],
    resolveTransport: async (scope) =>
      transportBinding(scope, async () => {
        onSubmit();
        return { success: true, data: [] };
      }),
  });
}

beforeAll(async () => {
  process.env.GERAICUAN_ENABLE_SANCTIONED_RECONCILIATION_FIXTURE = "1";
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await adminPool.query(
    "TRUNCATE shipment_rate_limits, rate_limits, ledger_entries, provider_order_snapshots, provider_batches, shipment_estimate_services, shipment_estimate_snapshots, shipment_parties, shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE",
  );
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Reconciliation Admin A', 'reconciliation-admin-a@example.test'),
      ($2, 'Reconciliation Operator A', 'reconciliation-operator-a@example.test'),
      ($3, 'Reconciliation Admin B', 'reconciliation-admin-b@example.test')`,
    [adminA, operatorA, adminB],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'Reconciliation Tenant A', 'ACTIVE'), ($2, 'Reconciliation Tenant B', 'ACTIVE')",
    [tenantA, tenantB],
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'TENANT_ADMIN'),
      ($1, $3, 'OPERATOR'),
      ($4, $5, 'TENANT_ADMIN')`,
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
  await adminPool.query(
    `INSERT INTO outlets (
      id, tenant_id, name, default_pickup_address_id, default_origin_area_id
    ) VALUES
      ($1, $2, 'Reconciliation Outlet A', 'fixture-pickup', 'fixture-origin'),
      ($3, $4, 'Reconciliation Outlet B', 'fixture-pickup-b', 'fixture-origin-b')`,
    [outletA, tenantA, outletB, tenantB],
  );
});

afterAll(async () => {
  if (previousFixtureFlag === undefined) {
    delete process.env.GERAICUAN_ENABLE_SANCTIONED_RECONCILIATION_FIXTURE;
  } else {
    process.env.GERAICUAN_ENABLE_SANCTIONED_RECONCILIATION_FIXTURE =
      previousFixtureFlag;
  }
  await Promise.all([adminPool.end(), appPool.end()]);
});

describe("fixture-backed unknown submission reconciliation", () => {
  it("denies role and tenant mismatches before lookup, then resolves without retrying POST order", async () => {
    let submitCalls = 0;
    let lookupCalls = 0;
    await seedUnknownShipment(() => { submitCalls += 1; });
    const lookup: ShipmentReconciliationLookup = async (key) => {
      lookupCalls += 1;
      return resolveSanctionedReconciliationFixture(key);
    };
    const reconcileAs = (principalId: string, tenantId: string) =>
      reconcileFixtureBackedShipment({
        db: appDb,
        principalId,
        tenantId,
        shipmentId,
        resolveAuthoritativeResult: lookup,
      });

    await expect(reconcileAs(operatorA, tenantA)).rejects.toBeInstanceOf(
      ShipmentReconciliationDeniedError,
    );
    await expect(reconcileAs(adminB, tenantA)).rejects.toBeInstanceOf(
      TenantContextDeniedError,
    );
    await expect(reconcileAs(adminB, tenantB)).rejects.toBeInstanceOf(
      ShipmentReconciliationUnavailableError,
    );
    expect({ lookupCalls, submitCalls }).toEqual({ lookupCalls: 0, submitCalls: 1 });

    await expect(reconcileAs(adminA, tenantA)).resolves.toEqual({
      awb: "SANITIZED-CNOTE-0001",
      shipmentId,
      status: "ISSUED",
    });
    expect({ lookupCalls, submitCalls }).toEqual({ lookupCalls: 1, submitCalls: 1 });

    const [state] = await adminDb
      .select({
        awb: schema.providerOrderSnapshots.cnoteNo,
        batchStatus: schema.providerBatches.status,
        orderStatus: schema.providerOrderSnapshots.status,
        shipmentStatus: schema.shipments.status,
      })
      .from(schema.providerOrderSnapshots)
      .innerJoin(
        schema.providerBatches,
        and(
          eq(schema.providerBatches.id, schema.providerOrderSnapshots.batchId),
          eq(schema.providerBatches.tenantId, schema.providerOrderSnapshots.tenantId),
        ),
      )
      .innerJoin(
        schema.shipments,
        and(
          eq(schema.shipments.id, schema.providerOrderSnapshots.shipmentId),
          eq(schema.shipments.tenantId, schema.providerOrderSnapshots.tenantId),
        ),
      );
    expect(state).toEqual({
      awb: "SANITIZED-CNOTE-0001",
      batchStatus: "COMPLETED",
      orderStatus: "ISSUED",
      shipmentStatus: "ISSUED",
    });

    const ledger = await adminDb
      .select({
        amountIdr: schema.ledgerEntries.amountIdr,
        entryType: schema.ledgerEntries.entryType,
      })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.shipmentId, shipmentId));
    expect(ledger).toEqual([
      { amountIdr: 8000, entryType: "MENGANTAR_SHIPPING_COST" },
    ]);

    await expect(reconcileAs(adminA, tenantA)).rejects.toBeInstanceOf(
      ShipmentReconciliationUnavailableError,
    );
    expect({ lookupCalls, submitCalls }).toEqual({ lookupCalls: 1, submitCalls: 1 });
    expect(
      await adminDb
        .select({ id: schema.ledgerEntries.id })
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.shipmentId, shipmentId)),
    ).toHaveLength(1);
  });
});
