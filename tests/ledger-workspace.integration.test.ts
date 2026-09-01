import { randomBytes, randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  appendLedgerAdjustment,
  LedgerDeniedError,
  LedgerUnavailableError,
  listLedgerEntries,
  listLedgerReconciliations,
  reconcileLedgerPeriod,
  summarizeLedger,
} from "@/db/ledger-repository";
import { completeProviderOrder } from "@/db/order-batch-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
}
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Ledger workspace tests require geraicuan_test.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

const tenantA = randomUUID();
const tenantB = randomUUID();
const outletA = randomUUID();
const outletB = randomUUID();
const adminA = `t24-admin-${randomUUID()}`;
const adminB = `t24-admin-${randomUUID()}`;
const operatorA = `t24-operator-${randomUUID()}`;

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

async function seedIdentity() {
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'T24 Admin A', $2),
      ($3, 'T24 Admin B', $4),
      ($5, 'T24 Operator A', $6)`,
    [
      adminA,
      `${adminA}@example.test`,
      adminB,
      `${adminB}@example.test`,
      operatorA,
      `${operatorA}@example.test`,
    ],
  );
  await adminPool.query(
    `INSERT INTO tenants (id, name, status) VALUES
      ($1, 'T24 Tenant A', 'ACTIVE'),
      ($2, 'T24 Tenant B', 'ACTIVE')`,
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
      ($1, $2, 'T24 Outlet A', 'pickup-a', 'origin-a'),
      ($3, $4, 'T24 Outlet B', 'pickup-b', 'origin-b')`,
    [outletA, tenantA, outletB, tenantB],
  );
}

type OrderFixture = {
  shipmentId: string;
  snapshotId: string;
  serviceId: string;
  batchId: string;
  orderId: string;
};

async function seedCodOrder(
  tenantId: string,
  outletId: string,
  userId: string,
): Promise<OrderFixture> {
  const fixture = {
    shipmentId: randomUUID(),
    snapshotId: randomUUID(),
    serviceId: randomUUID(),
    batchId: randomUUID(),
    orderId: randomUUID(),
  };
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, 'SUBMISSION_QUEUED')",
    [fixture.shipmentId, tenantId, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity,
      declared_value_idr, is_cod
    ) VALUES ($1, $2, 'area', 'Fixture area', 'Sanitized parcel', 1000, 1, 100000, true)`,
    [fixture.shipmentId, tenantId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id,
      destination_area_id, weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'origin', 'area', 1000, true, 'platform_default')`,
    [fixture.snapshotId, tenantId, fixture.shipmentId, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency,
      shipping_amount_idr, insurance_amount_idr, shipping_source_field,
      insurance_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'JNE REG', 'IDR', 10000, 500, 'price',
      'insurance_fee', 'fixture', true)`,
    [fixture.serviceId, tenantId, fixture.snapshotId],
  );
  await adminPool.query(
    `INSERT INTO shipment_cod_totals (
      tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
      goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
      provider_cod_amount_idr
    ) VALUES ($1, $2, $3, $4, 'IDR', 100000, 10000, 3300, 363, 113663)`,
    [tenantId, fixture.shipmentId, fixture.snapshotId, fixture.serviceId],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier,
      credential_source, provider_account_key, idempotency_key, status,
      submission_attempted_at
    ) VALUES ($1, $2, $3, 'pickup', 'JNE', 'platform_default', $4, $5,
      'SUBMITTING', now())`,
    [
      fixture.batchId,
      tenantId,
      outletId,
      randomBytes(32).toString("hex"),
      randomBytes(32).toString("hex"),
    ],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id,
      estimate_service_id, position, provider_service, currency,
      shipping_amount_idr, insurance_amount_idr, is_cod, provider_cod_amount_idr
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', 'IDR',
      10000, 500, true, 113663)`,
    [
      fixture.orderId,
      tenantId,
      fixture.batchId,
      fixture.shipmentId,
      fixture.snapshotId,
      fixture.serviceId,
    ],
  );
  await withTenantContext(appDb, userId, tenantId, (tx, context) =>
    completeProviderOrder(tx, context, fixture.batchId, {
      shipmentId: fixture.shipmentId,
      providerOrderId: `provider-${fixture.orderId}`,
      isPaid: true,
      cnoteNo: `AWB-${fixture.orderId}`,
    }),
  );
  return fixture;
}

afterAll(async () => {
  await Promise.all([adminPool.end(), appPool.end()]);
});

describe("tenant ledger and reconciliation workspace", () => {
  it("isolates tenants, derives source totals, preserves signed variance, and gates mutations", async () => {
    await seedIdentity();
    const orderA = await seedCodOrder(tenantA, outletA, adminA);
    const orderB = await seedCodOrder(tenantB, outletB, adminB);

    await adminPool.query(
      `UPDATE shipment_cod_totals
       SET goods_value_idr = 99500,
           service_fee_idr = 3285,
           vat_amount_idr = 361,
           provider_cod_amount_idr = 113146
       WHERE tenant_id = $1 AND shipment_id = $2`,
      [tenantA, orderA.shipmentId],
    );
    await adminPool.query(
      `UPDATE provider_order_snapshots
       SET provider_cod_amount_idr = 113146
       WHERE tenant_id = $1 AND id = $2`,
      [tenantA, orderA.orderId],
    );

    const effective = await adminPool.query<{ effective_at: Date }>(
      `SELECT effective_at FROM ledger_entries
       WHERE tenant_id = $1 AND shipment_id = $2
         AND entry_type = 'COD_PRINCIPAL_COLLECTABLE'`,
      [tenantA, orderA.shipmentId],
    );
    const periodStart = new Date(effective.rows[0].effective_at);
    periodStart.setUTCHours(0, 0, 0, 0);
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
    const range = { start: periodStart, end: periodEnd, outletId: outletA };
    const dailyAttemptId = randomUUID();

    const daily = await withTenantContext(
      appDb,
      adminA,
      tenantA,
      async (tx, context) => {
        const entries = await listLedgerEntries(tx, context, range, {
          limit: 50,
          offset: 0,
        });
        const reconciliation = await reconcileLedgerPeriod(tx, context, {
          outletId: outletA,
          cadence: "DAILY",
          periodStart,
          periodEnd,
          attemptId: dailyAttemptId,
        });
        const runs = await listLedgerReconciliations(tx, context, range);
        return { entries, reconciliation, runs };
      },
    );

    expect(daily.entries.totalCount).toBe(5);
    expect(daily.entries.rows.every((row) => row.shipmentId === orderA.shipmentId)).toBe(true);
    expect(daily.reconciliation.sourceTotals).toEqual({
      COD_PRINCIPAL_COLLECTABLE: 99500,
      MENGANTAR_SHIPPING_COST: 10000,
      MENGANTAR_INSURANCE_COST: 500,
      GERAICUAN_COD_SERVICE_FEE_REVENUE: 3285,
      COD_SERVICE_FEE_VAT_PAYABLE: 361,
      NON_COD_UPSTREAM_PAYMENT: 0,
    });
    const dailyPrincipal = daily.reconciliation.reconciliations.find(
      ({ run }) => run.reconciledEntryType === "COD_PRINCIPAL_COLLECTABLE",
    )?.run;
    expect(dailyPrincipal).toMatchObject({
      sourceTotalIdr: 99500,
      ledgerTotalIdr: 100000,
      varianceIdr: -500,
      status: "VARIANCE",
    });
    expect(daily.runs).toHaveLength(6);
    expect(daily.runs.every((run) => run.outletId === outletA)).toBe(true);

    await adminPool.query(
      `UPDATE shipment_cod_totals
       SET goods_value_idr = 99000,
           service_fee_idr = 3270,
           vat_amount_idr = 360,
           provider_cod_amount_idr = 112630
       WHERE tenant_id = $1 AND shipment_id = $2`,
      [tenantA, orderA.shipmentId],
    );
    const staleDailyReplay = await withTenantContext(
      appDb,
      adminA,
      tenantA,
      (tx, context) => reconcileLedgerPeriod(tx, context, {
        outletId: outletA,
        cadence: "DAILY",
        periodStart,
        periodEnd,
        attemptId: dailyAttemptId,
      }),
    );
    expect(staleDailyReplay).toEqual(daily.reconciliation);
    await adminPool.query(
      `UPDATE shipment_cod_totals
       SET goods_value_idr = 99500,
           service_fee_idr = 3285,
           vat_amount_idr = 361,
           provider_cod_amount_idr = 113146
       WHERE tenant_id = $1 AND shipment_id = $2`,
      [tenantA, orderA.shipmentId],
    );

    const concurrentAttemptId = randomUUID();
    const concurrentReconciliations = await Promise.all([
      withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        reconcileLedgerPeriod(tx, context, {
          outletId: outletA,
          cadence: "DAILY",
          periodStart,
          periodEnd,
          attemptId: concurrentAttemptId,
        })),
      withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        reconcileLedgerPeriod(tx, context, {
          outletId: outletA,
          cadence: "DAILY",
          periodStart,
          periodEnd,
          attemptId: concurrentAttemptId,
        })),
    ]);
    expect(concurrentReconciliations[0]).toEqual(concurrentReconciliations[1]);
    expect(concurrentReconciliations[0].reconciliations).toHaveLength(6);
    expect(concurrentReconciliations[0].sourceTotals).toEqual(
      daily.reconciliation.sourceTotals,
    );
    expect(concurrentReconciliations[0].reconciliations.every(({ run }) =>
      run.varianceIdr === run.sourceTotalIdr - run.ledgerTotalIdr
    )).toBe(true);
    await expect(withTenantContext(
      appDb,
      adminA,
      tenantA,
      (tx, context) => reconcileLedgerPeriod(tx, context, {
        outletId: outletA,
        cadence: "MONTHLY",
        periodStart,
        periodEnd,
        attemptId: concurrentAttemptId,
      }),
    )).rejects.toBeInstanceOf(LedgerUnavailableError);

    const partialAttemptId = randomUUID();
    await adminPool.query(
      `INSERT INTO reconciliation_runs (
        tenant_id, outlet_id, cadence, reconciled_entry_type,
        period_start, period_end, currency, source_total_idr,
        ledger_total_idr, variance_idr, status, source_event_id, actor_user_id
      ) VALUES ($1, $2, 'DAILY', 'COD_PRINCIPAL_COLLECTABLE',
        $3, $4, 'IDR', 0, 0, 0, 'MATCHED', $5, $6)`,
      [
        tenantA,
        outletA,
        periodStart,
        periodEnd,
        `reconciliation:${partialAttemptId}:COD_PRINCIPAL_COLLECTABLE`,
        adminA,
      ],
    );
    await expect(withTenantContext(
      appDb,
      adminA,
      tenantA,
      (tx, context) => reconcileLedgerPeriod(tx, context, {
        outletId: outletA,
        cadence: "DAILY",
        periodStart,
        periodEnd,
        attemptId: partialAttemptId,
      }),
    )).rejects.toBeInstanceOf(LedgerUnavailableError);

    const persistedConcurrentGroup = await adminPool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM reconciliation_runs
       WHERE tenant_id = $1 AND source_event_id LIKE $2`,
      [tenantA, `reconciliation:${concurrentAttemptId}:%`],
    );
    expect(persistedConcurrentGroup.rows[0]?.count).toBe(6);

    await expect(
      withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        reconcileLedgerPeriod(tx, context, {
          outletId: outletB,
          cadence: "DAILY",
          periodStart,
          periodEnd,
          attemptId: randomUUID(),
        }),
      ),
    ).rejects.toBeInstanceOf(LedgerUnavailableError);

    const principalEntry = daily.entries.rows.find(
      (entry) => entry.entryType === "COD_PRINCIPAL_COLLECTABLE",
    );
    if (!principalEntry) throw new Error("Expected COD principal fixture entry.");
    expect(principalEntry.adjustmentState).toBe("AVAILABLE");
    const adjustmentAt = new Date(principalEntry.effectiveAt.getTime() + 1);
    const adjusted = await withTenantContext(
      appDb,
      adminA,
      tenantA,
      async (tx, context) => {
        await appendLedgerAdjustment(
          tx,
          context,
          principalEntry.id,
          randomUUID(),
          adjustmentAt,
        );
        await expect(
          appendLedgerAdjustment(
            tx,
            context,
            principalEntry.id,
            randomUUID(),
            adjustmentAt,
          ),
        ).rejects.toBeInstanceOf(LedgerUnavailableError);
        const entries = await listLedgerEntries(tx, context, range, {
          limit: 50,
          offset: 0,
        });
        const monthly = await reconcileLedgerPeriod(tx, context, {
          outletId: outletA,
          cadence: "MONTHLY",
          periodStart,
          periodEnd,
          attemptId: randomUUID(),
        });
        return { entries, monthly };
      },
    );
    expect(
      adjusted.entries.rows.find((entry) => entry.id === principalEntry.id)
        ?.adjustmentState,
    ).toBe("ADJUSTED");
    const monthlyPrincipal = adjusted.monthly.reconciliations.find(
      ({ run }) => run.reconciledEntryType === "COD_PRINCIPAL_COLLECTABLE",
    )?.run;
    expect(monthlyPrincipal).toMatchObject({
      sourceTotalIdr: 99500,
      ledgerTotalIdr: 0,
      varianceIdr: 99500,
      status: "VARIANCE",
      cadence: "MONTHLY",
    });

    const revenueEntry = daily.entries.rows.find(
      (entry) => entry.entryType === "GERAICUAN_COD_SERVICE_FEE_REVENUE",
    );
    const shippingEntry = daily.entries.rows.find(
      (entry) => entry.entryType === "MENGANTAR_SHIPPING_COST",
    );
    if (!revenueEntry || !shippingEntry) {
      throw new Error("Expected revenue and shipping ledger fixtures.");
    }
    const adjustmentAttemptId = randomUUID();
    const revenueAdjustmentAt = new Date(revenueEntry.effectiveAt.getTime() + 2);
    const foreignEntry = await adminPool.query<{ id: string }>(
      `SELECT id FROM ledger_entries
       WHERE tenant_id = $1 AND shipment_id = $2
       ORDER BY id
       LIMIT 1`,
      [tenantB, orderB.shipmentId],
    );
    if (!foreignEntry.rows[0]) throw new Error("Expected foreign ledger fixture.");
    const concurrentAdjustments = await Promise.all([
      withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        appendLedgerAdjustment(
          tx,
          context,
          revenueEntry.id,
          adjustmentAttemptId,
          revenueAdjustmentAt,
        )),
      withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        appendLedgerAdjustment(
          tx,
          context,
          revenueEntry.id,
          adjustmentAttemptId,
          revenueAdjustmentAt,
        )),
    ]);
    expect(concurrentAdjustments[0]).toEqual(concurrentAdjustments[1]);
    expect(concurrentAdjustments[0]).toMatchObject({
      id: adjustmentAttemptId,
      amountIdr: -3300,
      reversesEntryId: revenueEntry.id,
    });
    await expect(withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      appendLedgerAdjustment(
        tx,
        context,
        revenueEntry.id,
        randomUUID(),
        revenueAdjustmentAt,
      ))).rejects.toBeInstanceOf(LedgerUnavailableError);
    await expect(withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      appendLedgerAdjustment(
        tx,
        context,
        shippingEntry.id,
        adjustmentAttemptId,
        revenueAdjustmentAt,
      ))).rejects.toBeInstanceOf(LedgerUnavailableError);
    await expect(withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      appendLedgerAdjustment(
        tx,
        context,
        foreignEntry.rows[0].id,
        randomUUID(),
        revenueAdjustmentAt,
      ))).rejects.toBeInstanceOf(LedgerUnavailableError);

    const persistedAdjustment = await adminPool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM ledger_entries
       WHERE tenant_id = $1 AND reverses_entry_id = $2`,
      [tenantA, revenueEntry.id],
    );
    expect(persistedAdjustment.rows[0]?.count).toBe(1);

    await expect(
      withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
        summarizeLedger(tx, context, range),
      ),
    ).rejects.toBeInstanceOf(LedgerDeniedError);
    await expect(
      withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
        reconcileLedgerPeriod(tx, context, {
          outletId: outletA,
          cadence: "DAILY",
          periodStart,
          periodEnd,
          attemptId: randomUUID(),
        }),
      ),
    ).rejects.toBeInstanceOf(LedgerDeniedError);
  });
});
