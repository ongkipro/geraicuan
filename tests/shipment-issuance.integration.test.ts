import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  calculateCodAmounts,
  CodTotalsFormulaRetiredError,
  CodTotalsUnavailableError,
  shipmentCodFormulaRetired,
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
// T-193: a COD shipment estimated and given a version 1 totals row before the deploy.
const legacyShipmentId = randomUUID();
const legacySnapshotId = randomUUID();
const legacyServiceId = randomUUID();
const legacyBatchId = randomUUID();
const legacyOrderId = randomUUID();
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
    // T-193: the issuance books the fee Mengantar keeps on 113 790 (3 789, not the
    // stored 3 414 + 376) and no VAT liability row.
    const ledger = await adminDb
      .select({ amountIdr: schema.ledgerEntries.amountIdr, entryType: schema.ledgerEntries.entryType })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.shipmentId, shipmentId));
    expect(ledger.filter((entry) => entry.entryType === "MENGANTAR_COD_FEE_COST")).toEqual([
      { amountIdr: 3789, entryType: "MENGANTAR_COD_FEE_COST" },
    ]);
    expect(ledger.filter((entry) => entry.entryType === "COD_SERVICE_FEE_VAT_PAYABLE")).toEqual([]);

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

  it("never submits a version 1 COD amount recorded before the deploy, and still answers a retry of one already sent (T-193)", async () => {
    await adminPool.query(
      "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, 'ESTIMATED')",
      [legacyShipmentId, tenantA, outletA],
    );
    await adminPool.query(
      `INSERT INTO shipment_drafts (
         shipment_id, tenant_id, destination_area_id, destination_area_label,
         package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod,
         destination_area_verified_at
       ) VALUES ($1, $2, 'fixture-destination', 'Tujuan sintetis',
         'Paket sintetis T193', 1000, 1, 100000, true, now())`,
      [legacyShipmentId, tenantA],
    );
    await adminPool.query(
      `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
       VALUES ($1, $2, 'SENDER', 'Pengirim Sintetis', '0800000000', 'Alamat sintetis asal', NULL, NULL),
              ($1, $2, 'RECIPIENT', 'Penerima Sintetis', '0800000000', 'Alamat sintetis tujuan', 'fixture-destination', 'Tujuan sintetis')`,
      [tenantA, legacyShipmentId],
    );
    await adminPool.query(
      `INSERT INTO shipment_estimate_snapshots (
         id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
         destination_area_label, weight_grams, is_cod_requested, credential_source
       ) VALUES ($1, $2, $3, $4, 'fixture-origin-a', 'fixture-destination', 'Tujuan sintetis', 1000, true, 'platform_default')`,
      [legacySnapshotId, tenantA, legacyShipmentId, outletA],
    );
    await adminPool.query(
      `INSERT INTO shipment_estimate_services (
         id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
         insurance_amount_idr, shipping_source_field, insurance_source_field,
         delivery_estimate, cod_eligible
       ) VALUES ($1, $2, $3, 'JNE REG', 'IDR', 10000, NULL, 'price', NULL, '1-2 hari', true)`,
      [legacyServiceId, tenantA, legacySnapshotId],
    );
    // Written the way the previous release wrote it: the additive formula, version 1.
    await adminPool.query(
      `INSERT INTO shipment_cod_totals (
         tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
         goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
         provider_cod_amount_idr, cod_formula_version
       ) VALUES ($1, $2, $3, $4, 'IDR', 100000, 10000, 3300, 363, 113663, 1)`,
      [tenantA, legacyShipmentId, legacySnapshotId, legacyServiceId],
    );
    const totalsRow = async () => (await adminPool.query(
      "SELECT row_to_json(total)::text AS row FROM shipment_cod_totals total WHERE shipment_id = $1",
      [legacyShipmentId],
    )).rows.map((row: { row: string }) => row.row);
    const totalsBefore = await totalsRow();
    expect(totalsBefore).toHaveLength(1);

    let submissions = 0;
    const countingResolver: MengantarOrderTransportLookup = async (...args) => {
      const binding = await resolveSanctionedOrderFixtureTransport(...args);
      return {
        ...binding,
        transport: {
          async submit(orders) {
            submissions += 1;
            return binding.transport.submit(orders);
          },
        },
      } satisfies MengantarOrderTransportBinding;
    };
    // The first test spent this tenant's order rate limit; each step here is one confirmation.
    const resetRateLimit = () => adminPool.query("DELETE FROM shipment_rate_limits WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    const confirm = async () => (await resetRateLimit(), confirmFixtureBackedShipmentIssuance({
      db: appDb,
      lockPool: appPool,
      principalId: operatorA,
      tenantId: tenantA,
      confirmation: { shipmentId: legacyShipmentId, estimateSnapshotId: legacySnapshotId, estimateServiceId: legacyServiceId },
      resolveTransport: countingResolver,
    }));
    const orderRows = async () => (await adminPool.query(
      "SELECT status FROM provider_order_snapshots WHERE shipment_id = $1",
      [legacyShipmentId],
    )).rows;

    // T-199: the detail page reads the same decision before rendering the confirm button.
    const retired = () => withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      shipmentCodFormulaRetired(tx, context, legacyShipmentId));

    // 1. Estimated before the deploy, confirmed after: refused, nothing queued or sent.
    expect(await retired()).toBe(true);
    await expect(confirm()).rejects.toBeInstanceOf(CodTotalsFormulaRetiredError);
    expect(submissions).toBe(0);
    expect(await orderRows()).toEqual([]);
    expect(await totalsRow()).toEqual(totalsBefore);
    const { rows: [{ status: legacyStatus }] } = await adminPool.query("SELECT status FROM shipments WHERE id = $1", [legacyShipmentId]);
    expect(legacyStatus).toBe("ESTIMATED");

    // 2. Queued by the previous release and never attempted: resuming would send
    //    the old amount, so it is refused too.
    await adminPool.query(
      `INSERT INTO provider_batches (
         id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
         provider_account_key, idempotency_key, status
       ) VALUES ($1, $2, $3, 'fixture-pickup-a', 'JNE', 'platform_default', $4, $5, 'SUBMISSION_QUEUED')`,
      [legacyBatchId, tenantA, outletA, "b".repeat(64), "c".repeat(64)],
    );
    await adminPool.query(
      `INSERT INTO provider_order_snapshots (
         id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position,
         provider_service, destination_area_id, destination_area_label, currency,
         shipping_amount_idr, is_cod, provider_cod_amount_idr
       ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', 'fixture-destination', 'Tujuan sintetis', 'IDR', 10000, true, 113663)`,
      [legacyOrderId, tenantA, legacyBatchId, legacyShipmentId, legacySnapshotId, legacyServiceId],
    );
    await adminPool.query("UPDATE shipments SET status = 'SUBMISSION_QUEUED' WHERE id = $1", [legacyShipmentId]);
    expect(await retired()).toBe(true);
    await expect(confirm()).rejects.toBeInstanceOf(CodTotalsFormulaRetiredError);
    expect(submissions).toBe(0);
    expect(await orderRows()).toEqual([{ status: "SUBMISSION_QUEUED" }]);

    // 3. Already sent and issued with the old amount: Mengantar holds it, so a
    //    retry reads the recorded result back and submits nothing.
    await adminPool.query(
      "UPDATE provider_batches SET status = 'COMPLETED', submission_attempted_at = now(), completed_at = now() WHERE id = $1",
      [legacyBatchId],
    );
    await adminPool.query(
      `UPDATE provider_order_snapshots
       SET status = 'ISSUED', cnote_no = 'SANITIZED-CNOTE-T193', provider_order_id = 'provider-t193',
           is_paid = true, resolved_at = now()
       WHERE id = $1`,
      [legacyOrderId],
    );
    await adminPool.query("UPDATE shipments SET status = 'ISSUED' WHERE id = $1", [legacyShipmentId]);
    expect(await retired()).toBe(false);
    await expect(confirm()).resolves.toMatchObject({
      awb: "SANITIZED-CNOTE-T193",
      duplicate: true,
      status: "ISSUED",
    });
    expect(submissions).toBe(0);
    expect(await totalsRow()).toEqual(totalsBefore);
  });
  it("keeps the COD fee basis equal in shipment_cod_totals and provider_order_snapshots (T-199, spec 19)", async () => {
    // Spec 19: shipment_cod_totals.provider_cod_amount_idr is the canonical basis of
    // Mengantar's COD fee; the submitted order carries a copy. Every COD order issued
    // above through the application role must hold exactly the recorded amount.
    const parity = async (client: { query: Pool["query"] }) => (await client.query(
      `SELECT order_row.shipment_id,
              order_row.provider_cod_amount_idr::bigint AS order_amount,
              totals.provider_cod_amount_idr::bigint AS totals_amount
       FROM provider_order_snapshots AS order_row
       JOIN shipment_cod_totals AS totals
         ON totals.shipment_id = order_row.shipment_id AND totals.tenant_id = order_row.tenant_id
       WHERE order_row.tenant_id = ANY($1::uuid[]) AND order_row.is_cod`,
      [tenantIds],
    )).rows as Array<{ order_amount: string; shipment_id: string; totals_amount: string }>;
    const rows = await parity(adminPool);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.filter((row) => row.order_amount !== row.totals_amount)).toEqual([]);
    // No COD order exists without its totals row.
    const { rows: [{ orphans }] } = await adminPool.query(
      `SELECT count(*)::int AS orphans FROM provider_order_snapshots AS order_row
       WHERE order_row.tenant_id = ANY($1::uuid[]) AND order_row.is_cod
         AND NOT EXISTS (SELECT 1 FROM shipment_cod_totals AS totals
                         WHERE totals.shipment_id = order_row.shipment_id AND totals.tenant_id = order_row.tenant_id)`,
      [tenantIds],
    );
    expect(orphans).toBe(0);

    // The check detects drift: one order amount changed inside a rolled-back transaction.
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query(
        "UPDATE provider_order_snapshots SET provider_cod_amount_idr = provider_cod_amount_idr + 1 WHERE shipment_id = $1",
        [shipmentId],
      );
      expect((await parity(client)).filter((row) => row.order_amount !== row.totals_amount)).toEqual([
        { order_amount: "113791", shipment_id: shipmentId, totals_amount: "113790" },
      ]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }

    // Row-level security is what keeps them equal: the order INSERT policy requires it.
    const { rows: [policy] } = await adminPool.query(
      `SELECT with_check FROM pg_policies
       WHERE tablename = 'provider_order_snapshots' AND policyname = 'provider_order_snapshots_active_tenant_insert'`,
    );
    expect(String(policy?.with_check).replace(/\s+/g, " ")).toContain(
      "provider_order_snapshots.provider_cod_amount_idr = shipment_cod_totals.provider_cod_amount_idr",
    );
  });
});
