import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  loadTenantDashboard,
  loadTenantDashboardPeriodSummary,
  loadTenantDashboardPeriodSupport,
  loadTenantDashboardPeriodTrend,
} from "@/db/tenant-dashboard-repository";
import { loadShipmentQueuePage } from "@/db/shipment-queue-repository";
import {
  LedgerDeniedError,
  listLatestReconciliationVariances,
  summarizeLatestReconciliationVariances,
} from "@/db/ledger-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { shipmentQueueHref } from "@/lib/shipment-queue";
import {
  parseFinanceExceptionFilter,
  reconciliationVarianceHref,
} from "@/lib/finance-exception-filter";
import { buildAnalyticsDecisionContext } from "@/lib/analytics-decision-context";
import { parseAnalyticsRange } from "@/lib/analytics-range";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;

if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error(
    "DATABASE_URL and APP_DATABASE_URL are required for integration tests.",
  );
}
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}
if (new URL(appDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error(
    "Application integration tests require the isolated geraicuan_test database.",
  );
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-3500-0000-000000000001";
const tenantB = "00000000-0000-3500-0000-000000000002";
const outletA = "00000000-0000-3501-0000-000000000001";
const outletB = "00000000-0000-3501-0000-000000000002";
const adminA = "tenant-dashboard-admin-a";
const operatorA = "tenant-dashboard-operator-a";
const operatorB = "tenant-dashboard-operator-b";

function shipmentId(sequence: number) {
  return `00000000-0000-3521-0000-${String(sequence).padStart(12, "0")}`;
}

async function cleanFixtures() {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      "DELETE FROM reconciliation_runs WHERE tenant_id IN ($1, $2)",
      [tenantA, tenantB],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await adminPool.query(
    "DELETE FROM provider_order_snapshots WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "DELETE FROM provider_batches WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "DELETE FROM shipment_estimate_services WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "DELETE FROM shipment_estimate_snapshots WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "DELETE FROM shipment_parties WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "DELETE FROM shipment_drafts WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query("DELETE FROM shipments WHERE tenant_id IN ($1, $2)", [
    tenantA,
    tenantB,
  ]);
  await adminPool.query("DELETE FROM outlets WHERE tenant_id IN ($1, $2)", [
    tenantA,
    tenantB,
  ]);
  await adminPool.query(
    "DELETE FROM memberships WHERE tenant_id IN ($1, $2)",
    [tenantA, tenantB],
  );
  await adminPool.query("DELETE FROM tenants WHERE id IN ($1, $2)", [
    tenantA,
    tenantB,
  ]);
  await adminPool.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [
    adminA,
    operatorA,
    operatorB,
  ]);
}

async function seedShipment(input: {
  declaredValueIdr?: number;
  isCod?: boolean;
  sequence: number;
  status: (typeof schema.shipmentStatuses)[number];
  tenantId?: string;
  outletId?: string;
  updatedAt: Date;
}) {
  const id = shipmentId(input.sequence);
  const tenantId = input.tenantId ?? tenantA;
  const outletId = input.outletId ?? outletA;
  const createdAt = new Date(input.updatedAt.getTime() - 60_000);

  await adminPool.query(
    `INSERT INTO shipments (
      id, tenant_id, outlet_id, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, tenantId, outletId, input.status, createdAt, input.updatedAt],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity,
      declared_value_idr, is_cod, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, 'Dashboard fixture', 1000, 1, $5, $6, $7, $8)`,
    [
      id,
      tenantId,
      `area-${input.sequence}`,
      `Tujuan ${input.sequence}`,
      input.declaredValueIdr ?? 100_000,
      input.isCod ?? false,
      createdAt,
      input.updatedAt,
    ],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (
      tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label, created_at
    ) VALUES
      ($1, $2, 'SENDER', 'Pengirim fixture', '081211110000', 'Alamat pengirim fixture', NULL, NULL, $3),
      ($1, $2, 'RECIPIENT', $4, '081299990000', 'Alamat penerima fixture',
        (SELECT destination_area_id FROM shipment_drafts WHERE shipment_id = $2),
        (SELECT destination_area_label FROM shipment_drafts WHERE shipment_id = $2), $3)`,
    [tenantId, id, createdAt, `Penerima ${input.sequence}`],
  );

  return id;
}

async function seedIssuedEvent(input: {
  sequence: number;
  shipmentId: string;
  tenantId: string;
  outletId: string;
  resolvedAt: Date;
}) {
  const suffix = String(input.sequence).padStart(12, "0");
  const snapshotId = `00000000-0000-3531-0000-${suffix}`;
  const serviceId = `00000000-0000-3532-0000-${suffix}`;
  const batchId = `00000000-0000-3533-0000-${suffix}`;
  const orderId = `00000000-0000-3534-0000-${suffix}`;

  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id,
      destination_area_id, destination_area_label, weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'origin',
      (SELECT destination_area_id FROM shipment_drafts WHERE shipment_id = $3),
      (SELECT destination_area_label FROM shipment_drafts WHERE shipment_id = $3),
      1000, false, 'platform_default')`,
    [snapshotId, input.tenantId, input.shipmentId, input.outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency,
      shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'JNE REG', 'IDR', 10000, 'price', 'fixture', true)`,
    [serviceId, input.tenantId, snapshotId],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
      provider_account_key, idempotency_key, status, submission_attempted_at,
      completed_at
    ) VALUES ($1, $2, $3, 'pickup', 'JNE', 'platform_default', $4, $5,
      'COMPLETED', $6, $6)`,
    [
      batchId,
      input.tenantId,
      input.outletId,
      input.sequence.toString(16).padStart(64, "0"),
      (input.sequence + 1000).toString(16).padStart(64, "0"),
      input.resolvedAt,
    ],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id,
      estimate_service_id, position, provider_service, destination_area_id, destination_area_label, currency,
      shipping_amount_idr, is_cod, status, provider_order_id, is_paid,
      cnote_no, resolved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG',
      (SELECT destination_area_id FROM shipment_drafts WHERE shipment_id = $4),
      (SELECT destination_area_label FROM shipment_drafts WHERE shipment_id = $4), 'IDR', 10000,
      false, 'ISSUED', $7, true, $8, $9)`,
    [
      orderId,
      input.tenantId,
      batchId,
      input.shipmentId,
      snapshotId,
      serviceId,
      `order-${input.sequence}`,
      `AWB-${input.sequence}`,
      input.resolvedAt,
    ],
  );
}

async function seedReconciliation(input: {
  id: string;
  tenantId: string;
  outletId: string;
  actorUserId: string;
  entryType: "COD_PRINCIPAL_COLLECTABLE" | "MENGANTAR_SHIPPING_COST";
  sourceTotalIdr: number;
  ledgerTotalIdr: number;
  createdAt: Date;
}) {
  const varianceIdr = input.sourceTotalIdr - input.ledgerTotalIdr;
  await adminPool.query(
    `INSERT INTO reconciliation_runs (
      id, tenant_id, outlet_id, cadence, reconciled_entry_type,
      period_start, period_end, currency, source_total_idr, ledger_total_idr,
      variance_idr, status, source_event_id, actor_user_id, created_at
    ) VALUES (
      $1, $2, $3, 'DAILY', $4, '2026-08-30T00:00:00Z',
      '2026-08-31T00:00:00Z', 'IDR', $5, $6, $7, $8, $9, $10, $11
    )`,
    [
      input.id,
      input.tenantId,
      input.outletId,
      input.entryType,
      input.sourceTotalIdr,
      input.ledgerTotalIdr,
      varianceIdr,
      varianceIdr === 0 ? "MATCHED" : "VARIANCE",
      `dashboard-${input.id}`,
      input.actorUserId,
      input.createdAt,
    ],
  );
}

beforeAll(async () => {
  await cleanFixtures();
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Dashboard Admin A', 'tenant-dashboard-admin-a@example.test'),
      ($2, 'Dashboard Operator A', 'tenant-dashboard-operator-a@example.test'),
      ($3, 'Dashboard Operator B', 'tenant-dashboard-operator-b@example.test')`,
    [adminA, operatorA, operatorB],
  );
  await adminPool.query(
    `INSERT INTO tenants (id, name, status) VALUES
      ($1, 'Dashboard Tenant A', 'ACTIVE'),
      ($2, 'Dashboard Tenant B', 'ACTIVE')`,
    [tenantA, tenantB],
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'TENANT_ADMIN'),
      ($1, $3, 'OPERATOR'),
      ($4, $5, 'OPERATOR')`,
    [tenantA, adminA, operatorA, tenantB, operatorB],
  );
  await adminPool.query(
    `INSERT INTO outlets (
      id, tenant_id, name, default_pickup_address_id, default_origin_area_id
    ) VALUES
      ($1, $2, 'Outlet Dashboard A', 'pickup-a', 'origin-a'),
      ($3, $4, 'Outlet Dashboard B', 'pickup-b', 'origin-b')`,
    [outletA, tenantA, outletB, tenantB],
  );

  const base = Date.parse("2026-08-31T08:00:00.000Z");
  await seedShipment({
    sequence: 1,
    status: "DRAFT",
    updatedAt: new Date(base + 6_000),
  });
  await seedShipment({
    sequence: 2,
    status: "ESTIMATED",
    updatedAt: new Date(base + 5_000),
  });
  await seedShipment({
    sequence: 3,
    status: "ISSUED",
    updatedAt: new Date(base + 7_000),
  });
  await seedShipment({
    sequence: 4,
    status: "AWAITING_UPSTREAM_PAYMENT",
    updatedAt: new Date(base + 1_000),
  });
  await seedShipment({
    sequence: 5,
    status: "SUBMISSION_UNKNOWN",
    updatedAt: new Date(base + 3_000),
  });
  await seedShipment({
    sequence: 6,
    status: "FAILED",
    updatedAt: new Date(base + 2_000),
  });
  await seedShipment({
    sequence: 901,
    status: "FAILED",
    tenantId: tenantB,
    outletId: outletB,
    updatedAt: new Date(base + 60_000),
  });

  const [clock] = (
    await adminPool.query<{ today_start: Date }>(
      `SELECT date_trunc('day', current_timestamp AT TIME ZONE 'Asia/Jakarta')
        AT TIME ZONE 'Asia/Jakarta' AS today_start`,
    )
  ).rows;
  await seedIssuedEvent({
    sequence: 3,
    shipmentId: shipmentId(3),
    tenantId: tenantA,
    outletId: outletA,
    resolvedAt: new Date(clock.today_start.getTime() + 60_000),
  });
  await seedShipment({
    sequence: 7,
    status: "ISSUED",
    updatedAt: new Date(base + 4_000),
  });
  await seedIssuedEvent({
    sequence: 7,
    shipmentId: shipmentId(7),
    tenantId: tenantA,
    outletId: outletA,
    resolvedAt: new Date(clock.today_start.getTime() - 60_000),
  });
  await seedShipment({
    sequence: 902,
    status: "ISSUED",
    tenantId: tenantB,
    outletId: outletB,
    updatedAt: new Date(base + 50_000),
  });
  await seedIssuedEvent({
    sequence: 902,
    shipmentId: shipmentId(902),
    tenantId: tenantB,
    outletId: outletB,
    resolvedAt: new Date(clock.today_start.getTime() + 120_000),
  });

  await seedReconciliation({
    id: "00000000-0000-3550-0000-000000000001",
    tenantId: tenantA,
    outletId: outletA,
    actorUserId: adminA,
    entryType: "COD_PRINCIPAL_COLLECTABLE",
    sourceTotalIdr: 100_000,
    ledgerTotalIdr: 99_000,
    createdAt: new Date("2026-08-31T01:00:00Z"),
  });
  await seedReconciliation({
    id: "00000000-0000-3550-0000-000000000002",
    tenantId: tenantA,
    outletId: outletA,
    actorUserId: adminA,
    entryType: "COD_PRINCIPAL_COLLECTABLE",
    sourceTotalIdr: 100_000,
    ledgerTotalIdr: 100_000,
    createdAt: new Date("2026-08-31T02:00:00Z"),
  });
  await seedReconciliation({
    id: "00000000-0000-3550-0000-000000000003",
    tenantId: tenantA,
    outletId: outletA,
    actorUserId: adminA,
    entryType: "MENGANTAR_SHIPPING_COST",
    sourceTotalIdr: 10_000,
    ledgerTotalIdr: 9_500,
    createdAt: new Date("2026-08-31T03:00:00Z"),
  });
  await seedReconciliation({
    id: "00000000-0000-3550-0000-000000000004",
    tenantId: tenantB,
    outletId: outletB,
    actorUserId: operatorB,
    entryType: "MENGANTAR_SHIPPING_COST",
    sourceTotalIdr: 20_000,
    ledgerTotalIdr: 19_000,
    createdAt: new Date("2026-08-31T04:00:00Z"),
  });
});

afterAll(async () => {
  try {
    await cleanFixtures();
  } finally {
    await Promise.all([adminPool.end(), appPool.end()]);
  }
});

describe("tenant dashboard read model", () => {
  it("returns role-safe tenant aggregates and prioritizes actionable recent shipments", async () => {
    const loadFor = (userId: string) =>
      withTenantContext(appDb, userId, tenantA, async (tx, context) => ({
        dashboard: await loadTenantDashboard(tx, context, { recentLimit: 4 }),
        readyQueue: await loadShipmentQueuePage(tx, context, {
          page: 1,
          pageSize: 20,
          status: "READY_TO_PROGRESS",
        }),
        issuedTodayQueue: await loadShipmentQueuePage(tx, context, {
          page: 1,
          pageSize: 20,
          status: "ISSUED_TODAY",
        }),
        actionQueue: await loadShipmentQueuePage(tx, context, {
          page: 1,
          pageSize: 20,
          status: "ACTION_REQUIRED",
        }),
        awaitingQueue: await loadShipmentQueuePage(tx, context, {
          page: 1,
          pageSize: 20,
          status: "AWAITING_UPSTREAM_PAYMENT",
        }),
      }));

    const [adminResult, operatorResult] = await Promise.all([
      loadFor(adminA),
      loadFor(operatorA),
    ]);

    expect(adminResult.dashboard.summary).toEqual({
      total: 7,
      readyToProgress: 2,
      issuedToday: 1,
      actionRequired: 2,
    });
    expect(adminResult.dashboard.actionRequiredBreakdown).toEqual({
      awaitingUpstreamPayment: 1,
      submissionUnknown: 1,
      failed: 1,
    });
    expect(adminResult.dashboard.workflowBreakdown).toEqual({
      draft: 1,
      estimated: 1,
      issuedToday: 1,
    });
    expect(
      adminResult.dashboard.recentShipments.map((row) => row.shipmentId),
    ).toEqual([
      shipmentId(5),
      shipmentId(6),
      shipmentId(4),
      shipmentId(3),
    ]);
    expect(adminResult.dashboard.role).toBe("TENANT_ADMIN");
    if (adminResult.dashboard.role !== "TENANT_ADMIN") {
      throw new Error("Expected Tenant Admin dashboard fixture.");
    }
    expect(adminResult.dashboard.finance).toEqual({
      reconciliationVarianceCount: 1,
    });
    expect(operatorResult.dashboard.role).toBe("OPERATOR");
    expect(operatorResult.dashboard).not.toHaveProperty("finance");
    expect(operatorResult.dashboard.summary).toEqual(
      adminResult.dashboard.summary,
    );
    expect(adminResult.readyQueue.totalCount).toBe(
      adminResult.dashboard.summary.readyToProgress,
    );
    expect(adminResult.issuedTodayQueue.totalCount).toBe(
      adminResult.dashboard.summary.issuedToday,
    );
    // Spec 19 ACT-NEEDED equals its linked queue for both roles and excludes
    // awaiting payment; ACT-UNPAID equals the queue its tile links to.
    expect(adminResult.actionQueue.totalCount).toBe(
      adminResult.dashboard.summary.actionRequired,
    );
    expect(operatorResult.actionQueue.totalCount).toBe(
      operatorResult.dashboard.summary.actionRequired,
    );
    expect(
      adminResult.actionQueue.rows.some(
        (row) => row.status === "AWAITING_UPSTREAM_PAYMENT",
      ),
    ).toBe(false);
    expect(adminResult.awaitingQueue.totalCount).toBe(
      adminResult.dashboard.actionRequiredBreakdown.awaitingUpstreamPayment,
    );
    expect(shipmentQueueHref("READY_TO_PROGRESS")).toContain(
      "status=READY_TO_PROGRESS",
    );
    expect(shipmentQueueHref("ISSUED_TODAY")).toContain("status=ISSUED_TODAY");
    expect(
      adminResult.dashboard.recentShipments.some(
        (row) => row.shipmentId === shipmentId(901),
      ),
    ).toBe(false);
  });

  it("derives the selected tenant from membership context", async () => {
    const tenantBResult = await withTenantContext(
      appDb,
      operatorB,
      tenantB,
      (tx, context) => loadTenantDashboard(tx, context),
    );

    expect(tenantBResult.summary).toEqual({
      total: 2,
      readyToProgress: 0,
      issuedToday: 1,
      actionRequired: 1,
    });
    expect(tenantBResult.actionRequiredBreakdown).toEqual({
      awaitingUpstreamPayment: 0,
      submissionUnknown: 0,
      failed: 1,
    });
    expect(tenantBResult.workflowBreakdown).toEqual({
      draft: 0,
      estimated: 0,
      issuedToday: 1,
    });
    expect(tenantBResult.recentShipments.map((row) => row.shipmentId)).toEqual([
      shipmentId(901),
      shipmentId(902),
    ]);
    expect(tenantBResult.role).toBe("OPERATOR");
    expect(tenantBResult).not.toHaveProperty("finance");
  });

  it("returns period-filtered COD and non-COD input analytics without crossing tenant scope", async () => {
    const previousUpdatedAt = new Date("2026-08-19T04:01:00.000Z");
    const currentUpdatedAt = new Date("2026-08-20T04:01:00.000Z");
    await seedShipment({
      declaredValueIdr: 50_000,
      isCod: true,
      sequence: 80,
      status: "DRAFT",
      updatedAt: previousUpdatedAt,
    });
    await seedShipment({
      declaredValueIdr: 125_000,
      isCod: true,
      sequence: 81,
      status: "DRAFT",
      updatedAt: currentUpdatedAt,
    });
    const issuedShipmentId = await seedShipment({
      declaredValueIdr: 75_000,
      sequence: 82,
      status: "ISSUED",
      updatedAt: new Date(currentUpdatedAt.getTime() + 60_000),
    });
    await seedIssuedEvent({
      outletId: outletA,
      resolvedAt: new Date("2026-08-20T05:00:00.000Z"),
      sequence: 82,
      shipmentId: issuedShipmentId,
      tenantId: tenantA,
    });
    await seedShipment({
      declaredValueIdr: 999_000,
      isCod: true,
      outletId: outletB,
      sequence: 980,
      status: "DRAFT",
      tenantId: tenantB,
      updatedAt: currentUpdatedAt,
    });

    const range = parseAnalyticsRange({
      dari: "2026-08-20",
      khusus: "1",
      sampai: "2026-08-20",
      tz: "Asia/Jakarta",
    }, new Date("2026-08-31T12:00:00.000Z"));
    const decision = buildAnalyticsDecisionContext(range);
    const result = await withTenantContext(
      appDb,
      operatorA,
      tenantA,
      async (tx, context) => ({
        foreignOutletSummary: await loadTenantDashboardPeriodSummary(
          tx,
          context,
          decision.currentRange,
          decision.previousRange,
          { outletId: outletB },
        ),
        summary: await loadTenantDashboardPeriodSummary(
          tx,
          context,
          decision.currentRange,
          decision.previousRange,
        ),
        support: await Promise.all([
          loadTenantDashboardPeriodSupport(tx, context, decision.currentRange, "created"),
          loadTenantDashboardPeriodSupport(tx, context, decision.currentRange, "cod"),
          loadTenantDashboardPeriodSupport(tx, context, decision.currentRange, "non-cod"),
          loadTenantDashboardPeriodSupport(tx, context, decision.currentRange, "issued"),
          loadTenantDashboardPeriodSupport(tx, context, decision.currentRange, "cod", { outletId: outletB }),
        ]),
        trend: await loadTenantDashboardPeriodTrend(
          tx,
          context,
          decision.currentRange,
        ),
      }),
    );

    expect(result.summary.current).toEqual({
      codCount: 1,
      createdCount: 2,
      issuedCount: 1,
      nonCodCount: 1,
    });
    expect(result.summary.previous).toEqual({
      codCount: 1,
      createdCount: 1,
      issuedCount: 0,
      nonCodCount: 0,
    });
    expect(result.foreignOutletSummary.current.createdCount).toBe(0);
    expect(result.foreignOutletSummary.current.codCount).toBe(0);
    expect(result.trend).toEqual([
      { codCount: 1, key: "2026-08-20", nonCodCount: 1 },
    ]);
    expect(result.support.map((item) => item.totalCount)).toEqual([2, 1, 1, 1, 0]);
    expect(result.support[1]?.rows).toEqual([
      expect.objectContaining({
        isCod: true,
        shipmentId: shipmentId(81),
      }),
    ]);
    expect(result.support[3]?.rows).toEqual([
      expect.objectContaining({
        occurredAt: new Date("2026-08-20T05:00:00.000Z"),
        shipmentId: shipmentId(82),
      }),
    ]);
  });

  it("returns only latest tenant variance rows through the finance supporting contract", async () => {
    const result = await withTenantContext(
      appDb,
      adminA,
      tenantA,
      async (tx, context) => ({
        page: await listLatestReconciliationVariances(tx, context, {
          limit: 20,
          offset: 0,
        }),
        summary: await summarizeLatestReconciliationVariances(tx, context),
      }),
    );

    expect(result.summary).toEqual({
      totalSignedVarianceIdr: 500,
      varianceCount: 1,
    });
    expect(result.page.totalCount).toBe(1);
    expect(result.page.rows).toEqual([
      expect.objectContaining({
        id: "00000000-0000-3550-0000-000000000003",
        outletId: outletA,
        status: "VARIANCE",
        varianceIdr: 500,
      }),
    ]);
    expect(reconciliationVarianceHref()).toBe(
      "/app/keuangan?status=VARIANCE#reconciliation-history-title",
    );
    expect(parseFinanceExceptionFilter("VARIANCE")).toBe("VARIANCE");

    await expect(
      withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
        summarizeLatestReconciliationVariances(tx, context),
      ),
    ).rejects.toBeInstanceOf(LedgerDeniedError);
  });
});
