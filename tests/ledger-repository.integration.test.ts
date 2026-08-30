import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  appendLedgerAdjustment,
  listLedgerEntriesForShipment,
  recordLedgerReconciliation,
  summarizeLedger,
} from "@/db/ledger-repository";
import { completeProviderOrder } from "@/db/order-batch-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { completeUnpaidRecovery } from "@/db/unpaid-recovery-repository";

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

const tenantA = "00000000-0000-0000-0000-000000001801";
const tenantB = "00000000-0000-0000-0000-000000001802";
const outletA = "00000000-0000-0000-0000-000000001811";
const outletB = "00000000-0000-0000-0000-000000001812";
const userA = "ledger-admin-a";
const userB = "ledger-admin-b";
const accountKey = "a".repeat(64);
const range = {
  start: new Date("2000-01-01T00:00:00.000Z"),
  end: new Date("2100-01-01T00:00:00.000Z"),
};

type SeededOrder = {
  shipmentId: string;
  snapshotId: string;
  serviceId: string;
  batchId: string;
  orderId: string;
};

function fixtureIds(sequence: number): SeededOrder {
  const suffix = String(sequence).padStart(12, "0");
  return {
    shipmentId: `00000000-0000-0000-0018-${suffix}`,
    snapshotId: `00000000-0000-0000-0028-${suffix}`,
    serviceId: `00000000-0000-0000-0038-${suffix}`,
    batchId: `00000000-0000-0000-0048-${suffix}`,
    orderId: `00000000-0000-0000-0058-${suffix}`,
  };
}

async function seedQueuedOrder(
  sequence: number,
  options: {
    isCod: boolean;
    shippingAmountIdr: number;
    insuranceAmountIdr: number | null;
  },
): Promise<SeededOrder> {
  const ids = fixtureIds(sequence);
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, 'SUBMISSION_QUEUED')",
    [ids.shipmentId, tenantA, outletA],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod
    ) VALUES ($1, $2, 'fixture-area', 'Fixture area', 'Sanitized parcel', 1000, 1, 100000, $3)`,
    [ids.shipmentId, tenantA, options.isCod],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
      weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'fixture-origin', 'fixture-area', 1000, $5, 'platform_default')`,
    [ids.snapshotId, tenantA, ids.shipmentId, outletA, options.isCod],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
      insurance_amount_idr, shipping_source_field, insurance_source_field,
      delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'JNE REG', 'IDR', $4, $5, 'price', $6, 'fixture', true)`,
    [
      ids.serviceId,
      tenantA,
      ids.snapshotId,
      options.shippingAmountIdr,
      options.insuranceAmountIdr,
      options.insuranceAmountIdr === null ? null : "insurance_fee",
    ],
  );
  if (options.isCod) {
    await adminPool.query(
      `INSERT INTO shipment_cod_totals (
        tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
        goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
        provider_cod_amount_idr
      ) VALUES ($1, $2, $3, $4, 'IDR', 100000, 10000, 3300, 363, 113663)`,
      [tenantA, ids.shipmentId, ids.snapshotId, ids.serviceId],
    );
  }
  await adminPool.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
      provider_account_key, idempotency_key, status, submission_attempted_at
    ) VALUES ($1, $2, $3, 'fixture-pickup', 'JNE', 'platform_default', $4, $5, 'SUBMITTING', now())`,
    [ids.batchId, tenantA, outletA, accountKey, String(sequence).padStart(64, "0")],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id,
      estimate_service_id, position, provider_service, currency,
      shipping_amount_idr, insurance_amount_idr, is_cod, provider_cod_amount_idr
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', 'IDR', $7, $8, $9, $10)`,
    [
      ids.orderId,
      tenantA,
      ids.batchId,
      ids.shipmentId,
      ids.snapshotId,
      ids.serviceId,
      options.shippingAmountIdr,
      options.insuranceAmountIdr,
      options.isCod,
      options.isCod ? 113663 : null,
    ],
  );
  return ids;
}

async function issueOrder(
  ids: SeededOrder,
  isPaid = true,
  cnoteNo: string | null = "AWB-FIXTURE",
) {
  return withTenantContext(appDb, userA, tenantA, (tx, context) =>
    completeProviderOrder(tx, context, ids.batchId, {
      shipmentId: ids.shipmentId,
      providerOrderId: `provider-${ids.orderId}`,
      isPaid,
      cnoteNo,
    }));
}

beforeAll(async () => {
  await adminPool.query("DROP ROLE IF EXISTS geraicuan_test_runtime");
  await adminPool.query(
    "CREATE ROLE geraicuan_test_runtime LOGIN INHERIT IN ROLE geraicuan_app",
  );
});

beforeEach(async () => {
  await adminPool.query(
    `TRUNCATE ledger_entries, reconciliation_runs, provider_unpaid_recoveries,
      provider_order_snapshots, provider_batches, shipment_cod_totals,
      shipment_estimate_services, shipment_estimate_snapshots, shipment_parties,
      shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE`,
  );
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Ledger Admin A', 'ledger-a@example.test'),
      ($2, 'Ledger Admin B', 'ledger-b@example.test')`,
    [userA, userB],
  );
  await adminPool.query(
    `INSERT INTO tenants (id, name, status) VALUES
      ($1, 'Ledger Tenant A', 'ACTIVE'),
      ($2, 'Ledger Tenant B', 'ACTIVE')`,
    [tenantA, tenantB],
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'TENANT_ADMIN'),
      ($3, $4, 'TENANT_ADMIN')`,
    [tenantA, userA, tenantB, userB],
  );
  await adminPool.query(
    `INSERT INTO outlets (
      id, tenant_id, name, default_pickup_address_id, default_origin_area_id
    ) VALUES
      ($1, $2, 'Ledger Outlet A', 'fixture-pickup', 'fixture-origin'),
      ($3, $4, 'Ledger Outlet B', 'fixture-pickup-b', 'fixture-origin-b')`,
    [outletA, tenantA, outletB, tenantB],
  );
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("immutable tenant operational ledger", () => {
  it("appends issued COD components and keeps principal liability out of revenue", async () => {
    const order = await seedQueuedOrder(1, {
      isCod: true,
      shippingAmountIdr: 10000,
      insuranceAmountIdr: 500,
    });
    await issueOrder(order);

    const entries = await adminDb
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.shipmentId, order.shipmentId));
    expect(entries.map((entry) => [
      entry.entryType,
      entry.financialClass,
      entry.amountIdr,
    ])).toEqual(expect.arrayContaining([
      ["COD_PRINCIPAL_COLLECTABLE", "LIABILITY", 100000],
      ["MENGANTAR_SHIPPING_COST", "EXPENSE", 10000],
      ["MENGANTAR_INSURANCE_COST", "EXPENSE", 500],
      ["GERAICUAN_COD_SERVICE_FEE_REVENUE", "REVENUE", 3300],
      ["COD_SERVICE_FEE_VAT_PAYABLE", "LIABILITY", 363],
    ]));
    expect(entries).toHaveLength(5);

    const summary = await withTenantContext(appDb, userA, tenantA, (tx, context) =>
      summarizeLedger(tx, context, { ...range, outletId: outletA }));
    expect(summary).toEqual({
      codPrincipalLiabilityIdr: 100000,
      providerCostIdr: 10500,
      revenueIdr: 3300,
      vatPayableIdr: 363,
      upstreamRecoveryPaymentIdr: 0,
    });

    await expect(adminPool.query(
      "UPDATE ledger_entries SET amount_idr = amount_idr + 1 WHERE id = $1",
      [entries[0].id],
    )).rejects.toMatchObject({ code: "55000" });
    await expect(adminPool.query(
      "DELETE FROM ledger_entries WHERE id = $1",
      [entries[0].id],
    )).rejects.toMatchObject({ code: "55000" });
  });

  it("records no unpaid cost, then appends recovery costs and payment once", async () => {
    const order = await seedQueuedOrder(2, {
      isCod: false,
      shippingAmountIdr: 12000,
      insuranceAmountIdr: 750,
    });
    await issueOrder(order, false, null);
    expect(await adminDb.select().from(schema.ledgerEntries)).toHaveLength(0);

    const recoveryId = "00000000-0000-0000-0068-000000000002";
    await adminPool.query(
      `INSERT INTO provider_unpaid_recoveries (
        id, tenant_id, batch_id, provider_order_snapshot_id,
        requested_by_user_id, status, attempted_at
      ) VALUES ($1, $2, $3, $4, $5, 'PAYING', now())`,
      [recoveryId, tenantA, order.batchId, order.orderId, userA],
    );

    await withTenantContext(appDb, userA, tenantA, (tx, context) =>
      completeUnpaidRecovery(tx, context, order.batchId, recoveryId, {
        providerBatchId: `provider-${order.orderId}`,
        courier: "JNE",
        cnoteNo: "AWB-RECOVERED",
      }));

    const entries = await adminDb.select().from(schema.ledgerEntries);
    expect(entries.map((entry) => [entry.entryType, entry.amountIdr])).toEqual(
      expect.arrayContaining([
        ["MENGANTAR_SHIPPING_COST", 12000],
        ["MENGANTAR_INSURANCE_COST", 750],
        ["NON_COD_UPSTREAM_PAYMENT", 12750],
      ]),
    );
    expect(entries).toHaveLength(3);

    await expect(withTenantContext(appDb, userA, tenantA, (tx, context) =>
      completeUnpaidRecovery(tx, context, order.batchId, recoveryId, {
        providerBatchId: `provider-${order.orderId}`,
        courier: "JNE",
        cnoteNo: "AWB-RECOVERED",
      }))).rejects.toThrow("Unpaid recovery is unavailable.");
    expect(await adminDb.select().from(schema.ledgerEntries)).toHaveLength(3);
  });

  it("reconciles a later period whose only matching entry is a reversal", async () => {
    const order = await seedQueuedOrder(4, {
      isCod: true,
      shippingAmountIdr: 10000,
      insuranceAmountIdr: null,
    });
    await issueOrder(order);

    const periodStart = new Date("2099-06-01T00:00:00.000Z");
    const reversalAt = new Date("2099-06-15T00:00:00.000Z");
    const periodEnd = new Date("2099-07-01T00:00:00.000Z");
    const result = await withTenantContext(
      appDb,
      userA,
      tenantA,
      async (tx, context) => {
        const shipmentEntries = await listLedgerEntriesForShipment(
          tx,
          context,
          order.shipmentId,
        );
        const original = shipmentEntries.find(
          (entry) => entry.entryType === "COD_PRINCIPAL_COLLECTABLE",
        );
        if (!original) throw new Error("Expected fixture COD principal entry.");
        expect(original.effectiveAt.getTime()).toBeLessThan(periodStart.getTime());

        const adjustment = await appendLedgerAdjustment(
          tx,
          context,
          original.id,
          reversalAt,
        );
        const reconciliation = await recordLedgerReconciliation(tx, context, {
          outletId: outletA,
          cadence: "MONTHLY",
          reconciledEntryType: "COD_PRINCIPAL_COLLECTABLE",
          periodStart,
          periodEnd,
          sourceTotalIdr: 0,
          sourceEventId: "fixture-later-period-reversal-reconciliation",
        });
        return { adjustment, reconciliation };
      },
    );

    expect(result.adjustment).toMatchObject({
      amountIdr: -100000,
      effectiveAt: reversalAt,
    });
    expect(result.reconciliation.run).toMatchObject({
      sourceTotalIdr: 0,
      ledgerTotalIdr: -100000,
      varianceIdr: 100000,
      status: "VARIANCE",
    });
    expect(result.reconciliation.entry).toMatchObject({
      entryType: "RECONCILIATION",
      amountIdr: 100000,
    });
  });

  it("denies cross-tenant rows and preserves reconciliation variance as a memo", async () => {
    const order = await seedQueuedOrder(3, {
      isCod: true,
      shippingAmountIdr: 10000,
      insuranceAmountIdr: null,
    });
    await issueOrder(order);

    const foreignRows = await withTenantContext(appDb, userB, tenantB, async (tx) =>
      tx
        .select()
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.tenantId, tenantA)));
    expect(foreignRows).toEqual([]);

    const countBefore = await adminDb
      .select({ id: schema.ledgerEntries.id })
      .from(schema.ledgerEntries);
    await expect(withTenantContext(appDb, userB, tenantB, async (tx) => {
      await tx.insert(schema.ledgerEntries).values({
        tenantId: tenantA,
        outletId: outletA,
        shipmentId: order.shipmentId,
        providerBatchId: order.batchId,
        providerOrderSnapshotId: order.orderId,
        entryType: "MENGANTAR_SHIPPING_COST",
        financialClass: "EXPENSE",
        amountIdr: 1,
        currency: "IDR",
        effectiveAt: new Date(),
        sourceEvent: "PROVIDER_ORDER_ISSUED",
        sourceEventId: "foreign-write",
        actorType: "USER",
        actorUserId: userB,
      });
    })).rejects.toMatchObject({ cause: { code: "42501" } });
    expect(await adminDb.select().from(schema.ledgerEntries)).toHaveLength(
      countBefore.length,
    );

    const result = await withTenantContext(appDb, userA, tenantA, async (tx, context) => {
      const reconciliation = await recordLedgerReconciliation(tx, context, {
        outletId: outletA,
        cadence: "DAILY",
        reconciledEntryType: "COD_PRINCIPAL_COLLECTABLE",
        periodStart: range.start,
        periodEnd: range.end,
        sourceTotalIdr: 100500,
        sourceEventId: "fixture-cod-principal-reconciliation",
      });
      const shipmentEntries = await listLedgerEntriesForShipment(
        tx,
        context,
        order.shipmentId,
      );
      const revenue = shipmentEntries.find(
        (entry) => entry.entryType === "GERAICUAN_COD_SERVICE_FEE_REVENUE",
      );
      if (!revenue) throw new Error("Expected fixture revenue entry.");
      const adjustment = await appendLedgerAdjustment(tx, context, revenue.id);
      const summary = await summarizeLedger(tx, context, {
        ...range,
        outletId: outletA,
      });
      return { adjustment, reconciliation, summary };
    });

    expect(result.reconciliation.run).toMatchObject({
      sourceTotalIdr: 100500,
      ledgerTotalIdr: 100000,
      varianceIdr: 500,
      status: "VARIANCE",
    });
    expect(result.reconciliation.entry).toMatchObject({
      entryType: "RECONCILIATION",
      financialClass: "MEMO",
      amountIdr: 500,
    });
    expect(result.adjustment).toMatchObject({
      entryType: "ADJUSTMENT",
      financialClass: "REVENUE",
      amountIdr: -3300,
    });
    expect(result.summary.revenueIdr).toBe(0);
    expect(result.summary.codPrincipalLiabilityIdr).toBe(100000);

    const storedRun = await adminDb
      .select()
      .from(schema.reconciliationRuns)
      .where(
        and(
          eq(schema.reconciliationRuns.tenantId, tenantA),
          eq(
            schema.reconciliationRuns.sourceEventId,
            "fixture-cod-principal-reconciliation",
          ),
        ),
      );
    expect(storedRun).toHaveLength(1);
  });
});
