import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  calculateCodAmounts,
  CodTotalsUnavailableError,
} from "@/db/cod-totals-repository";
import * as schema from "@/db/schema";
import { loadShipmentDetail } from "@/db/shipment-queue-repository";
import {
  TenantContextDeniedError,
  withTenantContext,
} from "@/db/tenant-context";
import type {
  MengantarOrderTransportBinding,
  MengantarOrderTransportLookup,
} from "@/lib/mengantar-order";
import { resolveSanctionedOrderFixtureTransport } from "@/lib/sanctioned-order-fixture";
import { confirmFixtureBackedShipmentIssuance } from "@/lib/shipment-issuance";
import { shipmentLifecycleActions } from "@/lib/shipment-queue";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
}
if (
  new URL(adminDatabaseUrl).pathname !== "/geraicuan_test" ||
  new URL(appDatabaseUrl).pathname !== "/geraicuan_test"
) {
  throw new Error("T22 requires the isolated geraicuan_test database.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const adminDb = drizzle({ client: adminPool, schema });
const appDb = drizzle({ client: appPool, schema });
const tenantA = randomUUID();
const tenantB = randomUUID();
const outletA = randomUUID();
const outletB = randomUUID();
const shipmentId = randomUUID();
const snapshotId = randomUUID();
const eligibleServiceId = randomUUID();
const blockedServiceId = randomUUID();
const operatorA = `t22-operator-${randomUUID()}`;
const operatorB = `t22-operator-${randomUUID()}`;
const outsider = `t22-outsider-${randomUUID()}`;
const tenantIds = [tenantA, tenantB];
const userIds = [operatorA, operatorB, outsider];
const previousFixtureFlag = process.env.GERAICUAN_ENABLE_SANCTIONED_ORDER_FIXTURE;

async function deleteFixtureLedgerEntries() {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      "DELETE FROM ledger_entries WHERE tenant_id = ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function cleanup() {
  await deleteFixtureLedgerEntries();
  await adminPool.query("DELETE FROM shipment_rate_limits WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM provider_order_snapshots WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM provider_batches WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM shipment_cod_totals WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM shipment_estimate_services WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM shipment_estimate_snapshots WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM shipment_parties WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM shipment_drafts WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM shipments WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM outlets WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [userIds]);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await cleanup();
  process.env.GERAICUAN_ENABLE_SANCTIONED_ORDER_FIXTURE = "1";
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, 'T22 Operator A', $2), ($3, 'T22 Operator B', $4), ($5, 'T22 Outsider', $6)",
    [operatorA, `${operatorA}@example.test`, operatorB, `${operatorB}@example.test`, outsider, `${outsider}@example.test`],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'T22 Tenant A', 'ACTIVE'), ($2, 'T22 Tenant B', 'ACTIVE')",
    tenantIds,
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR'), ($3, $4, 'OPERATOR')",
    [tenantA, operatorA, tenantB, operatorB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
     VALUES ($1, $2, 'T22 Outlet A', 'fixture-pickup-a', 'fixture-origin-a'),
            ($3, $4, 'T22 Outlet B', 'fixture-pickup-b', 'fixture-origin-b')`,
    [outletA, tenantA, outletB, tenantB],
  );
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, 'ESTIMATED')",
    [shipmentId, tenantA, outletA],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
       shipment_id, tenant_id, destination_area_id, destination_area_label,
       package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod,
       destination_area_verified_at
     ) VALUES ($1, $2, 'fixture-destination', 'Tujuan sintetis',
       'Paket sintetis T22', 1000, 1, 100000, true, now())`,
    [shipmentId, tenantA],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
     VALUES ($1, $2, 'SENDER', 'Pengirim Sintetis', '0800000000', 'Alamat sintetis asal', NULL, NULL),
            ($1, $2, 'RECIPIENT', 'Penerima Sintetis', '0800000000', 'Alamat sintetis tujuan', 'fixture-destination', 'Tujuan sintetis')`,
    [tenantA, shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
       id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
       destination_area_label, weight_grams, is_cod_requested, credential_source
     ) VALUES ($1, $2, $3, $4, 'fixture-origin-a', 'fixture-destination', 'Tujuan sintetis', 1000, true, 'platform_default')`,
    [snapshotId, tenantA, shipmentId, outletA],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
       id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
       insurance_amount_idr, shipping_source_field, insurance_source_field,
       delivery_estimate, cod_eligible
     ) VALUES
       ($1, $2, $3, 'JNE REG', 'IDR', 10000, 500, 'price', 'insurance_fee', '1-2 hari', true),
       ($4, $2, $3, 'JNE OKE', 'IDR', 8000, NULL, 'price', NULL, '2-3 hari', false)`,
    [eligibleServiceId, tenantA, snapshotId, blockedServiceId],
  );
});

afterAll(async () => {
  try {
    await cleanup();
  } finally {
    if (previousFixtureFlag === undefined) {
      delete process.env.GERAICUAN_ENABLE_SANCTIONED_ORDER_FIXTURE;
    } else {
      process.env.GERAICUAN_ENABLE_SANCTIONED_ORDER_FIXTURE = previousFixtureFlag;
    }
    await Promise.all([adminPool.end(), appPool.end()]);
  }
});

describe("T22 guarded queue-detail issuance", () => {
  it("issues one eligible estimate from the sanctioned fixture and denies duplicate, unauthorized, and cross-tenant effects", async () => {
    const before = await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      loadShipmentDetail(tx, context, shipmentId),
    );
    expect(before?.estimate).toMatchObject({
      snapshotId,
      services: expect.arrayContaining([
        expect.objectContaining({
          estimateServiceId: eligibleServiceId,
          providerService: "JNE REG",
          shippingAmountIdr: 10000,
          insuranceAmountIdr: 500,
          codEligible: true,
        }),
        expect.objectContaining({
          estimateServiceId: blockedServiceId,
          codEligible: false,
        }),
      ]),
    });
    expect(calculateCodAmounts(100000, 10000)).toEqual({
      goodsValueIdr: 100000,
      shippingAmountIdr: 10000,
      serviceFeeIdr: 3414,
      vatAmountIdr: 376,
      providerCodAmountIdr: 113790,
      codFormulaVersion: 2,
    });

    let submissions = 0;
    const countingResolver: MengantarOrderTransportLookup = async (...args) => {
      const binding = await resolveSanctionedOrderFixtureTransport(...args);
      const counted: MengantarOrderTransportBinding = {
        ...binding,
        transport: {
          async submit(orders) {
            submissions += 1;
            return binding.transport.submit(orders);
          },
        },
      };
      return counted;
    };
    const command = (principalId: string, tenantId: string, estimateServiceId: string) =>
      confirmFixtureBackedShipmentIssuance({
        db: appDb,
        lockPool: appPool,
        principalId,
        tenantId,
        confirmation: { shipmentId, estimateSnapshotId: snapshotId, estimateServiceId },
        resolveTransport: countingResolver,
      });

    await expect(command(operatorA, tenantA, blockedServiceId)).rejects.toBeInstanceOf(
      CodTotalsUnavailableError,
    );
    await expect(command(operatorB, tenantB, eligibleServiceId)).rejects.toBeInstanceOf(
      CodTotalsUnavailableError,
    );
    await expect(command(outsider, tenantA, eligibleServiceId)).rejects.toBeInstanceOf(
      TenantContextDeniedError,
    );
    expect(submissions).toBe(0);

    const first = await command(operatorA, tenantA, eligibleServiceId);
    // PR-44: the label link is the tenant's shipment number, never the UUID.
    const { rows: [{ tenant_number: issuedNumber }] } = await adminPool.query("SELECT tenant_number FROM shipments WHERE id = $1", [shipmentId]);
    expect(first).toEqual({
      awb: "SANITIZED-CNOTE-0001",
      duplicate: false,
      labelHref: `/app/label/${issuedNumber}`,
      shipmentId,
      status: "ISSUED",
    });
    const duplicate = await command(operatorA, tenantA, eligibleServiceId);
    expect(duplicate).toMatchObject({
      awb: "SANITIZED-CNOTE-0001",
      duplicate: true,
      status: "ISSUED",
    });
    expect(submissions).toBe(1);

    const totals = await adminDb
      .select()
      .from(schema.shipmentCodTotals)
      .where(eq(schema.shipmentCodTotals.shipmentId, shipmentId));
    expect(totals).toHaveLength(1);
    expect(totals[0]).toMatchObject({
      estimateServiceId: eligibleServiceId,
      goodsValueIdr: 100000,
      shippingAmountIdr: 10000,
      serviceFeeIdr: 3414,
      vatAmountIdr: 376,
      providerCodAmountIdr: 113790,
      codFormulaVersion: 2,
    });
    const providerRows = await adminDb
      .select({ cnoteNo: schema.providerOrderSnapshots.cnoteNo, status: schema.providerOrderSnapshots.status })
      .from(schema.providerOrderSnapshots)
      .where(
        and(
          eq(schema.providerOrderSnapshots.tenantId, tenantA),
          eq(schema.providerOrderSnapshots.shipmentId, shipmentId),
        ),
      );
    expect(providerRows).toEqual([{ cnoteNo: "SANITIZED-CNOTE-0001", status: "ISSUED" }]);

    const after = await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      loadShipmentDetail(tx, context, shipmentId),
    );
    expect(after).toMatchObject({
      status: "ISSUED",
      provider: { awb: "SANITIZED-CNOTE-0001", providerCodAmountIdr: 113790 },
    });
    expect(shipmentLifecycleActions("ISSUED", "OPERATOR", shipmentId)).toEqual([
      expect.objectContaining({ href: `/app/label/${shipmentId}`, id: "open-label", kind: "link" }),
    ]);
  });
});
