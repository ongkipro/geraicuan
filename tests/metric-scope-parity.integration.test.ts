import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadCourierPerformance } from "@/db/analytics-repository";
import { withPlatformContext } from "@/db/platform-context";
import {
  listTenantUsage,
  readPlatformCounts,
  readTrend,
} from "@/db/platform-monitoring-repository";
import { readPlatformTenantFinanceSummary } from "@/db/platform-tenant-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import {
  loadTenantDashboardCourierRecap,
  loadTenantDashboardMetrics,
  loadTenantDashboardPeriodSummary,
} from "@/db/tenant-dashboard-repository";
import { EMPTY_ANALYTICS_FILTERS } from "@/lib/analytics-filters";
import { parseAnalyticsRange, previousAnalyticsRange } from "@/lib/analytics-range";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

// Spec 19 SHP-ISSUED, SHP-UNPAID-OUTCOME and SHP-ISSUE-RATE's outcome denominator:
// every scope counts an outcome by provider_order_snapshots.resolved_at, never by
// when the order row was created — Dasbor, the live Laporan pengiriman courier read
// and /platform. SHP-UNKNOWN-OUTCOME's platform volume is record-created by
// definition; ACT-NEEDED is a snapshot. T-278 adds the cross-period unknown pair,
// both tenant roles, and the money of FIN-PROVIDER-COST / CRR-SHIPPING-IDR.

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
if (!adminUrl || !appUrl) throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
if (new URL(adminUrl).pathname !== "/geraicuan_test") {
  throw new Error("Metric parity tests require geraicuan_test.");
}

const admin = new Pool({ connectionString: adminUrl });
const app = new Pool({ connectionString: appUrl });
const appDb = drizzle({ client: app, schema });

const tenant = "00000000-0000-0000-0000-000000001901";
const outlet = "00000000-0000-0000-0000-000000001911";
const tenantAdmin = "parity-tenant-admin";
const operator = "parity-operator";
const superAdmin = "parity-super-admin";
const now = new Date("2026-09-12T05:00:00.000Z");
const range = parseAnalyticsRange(
  { rentang: "kustom", dari: "2026-09-01", sampai: "2026-09-10", tz: "Asia/Jakarta" },
  now,
);

const outcomes = [
  // Created before the range, resolved inside it: counted.
  { seq: 1, status: "ISSUED", createdAt: "2026-08-20T03:00:00Z", resolvedAt: "2026-09-05T03:00:00Z" },
  // Created inside the range, resolved after it: not counted.
  { seq: 2, status: "ISSUED", createdAt: "2026-09-03T03:00:00Z", resolvedAt: "2026-09-11T03:00:00Z" },
  // Unpaid, created before the range, resolved inside it: counted.
  { seq: 3, status: "AWAITING_UPSTREAM_PAYMENT", createdAt: "2026-08-25T03:00:00Z", resolvedAt: "2026-09-06T03:00:00Z" },
  // Unpaid, created inside the range, resolved after it: not counted.
  { seq: 4, status: "AWAITING_UPSTREAM_PAYMENT", createdAt: "2026-09-04T03:00:00Z", resolvedAt: "2026-09-11T04:00:00Z" },
  // Unknown, created before the range, resolved inside it: an outcome of the range.
  { seq: 5, status: "SUBMISSION_UNKNOWN", createdAt: "2026-08-28T03:00:00Z", resolvedAt: "2026-09-07T03:00:00Z" },
  // Unknown, created inside the range, resolved after it: platform volume only (created basis).
  { seq: 6, status: "SUBMISSION_UNKNOWN", createdAt: "2026-09-05T03:00:00Z", resolvedAt: "2026-09-11T05:00:00Z" },
  // A second issued outcome created before the range, so the resolution basis and the creation
  // basis give different totals (2 issued / 4 outcomes against 1 / 3) and a swap cannot pass.
  { seq: 7, status: "ISSUED", createdAt: "2026-08-25T03:00:00Z", resolvedAt: "2026-09-09T03:00:00Z" },
] as const;

// Seq 1's money, all effective inside the range: shipping, insurance, a COD principal, and
// adjustments reversing the shipping and the principal (M-0: an adjustment counts as the type
// it reverses).
const ledger = [
  { key: 1, type: "MENGANTAR_SHIPPING_COST", cls: "EXPENSE", amount: 10_000, at: "2026-09-05T03:00:00Z" },
  { key: 2, type: "MENGANTAR_INSURANCE_COST", cls: "EXPENSE", amount: 500, at: "2026-09-05T03:00:00Z" },
  { key: 3, type: "COD_PRINCIPAL_COLLECTABLE", cls: "LIABILITY", amount: 100_000, at: "2026-09-05T03:00:00Z" },
  { key: 4, type: "ADJUSTMENT", cls: "EXPENSE", amount: -10_000, at: "2026-09-08T03:00:00Z", reverses: 1 },
  { key: 5, type: "ADJUSTMENT", cls: "LIABILITY", amount: -100_000, at: "2026-09-08T03:00:00Z", reverses: 3 },
  // FIN-VAT (historical row) and FIN-UPSTREAM, each with a reversal: the platform sums fold them too.
  { key: 6, type: "COD_SERVICE_FEE_VAT_PAYABLE", cls: "LIABILITY", amount: 363, at: "2026-09-05T03:00:00Z" },
  { key: 7, type: "ADJUSTMENT", cls: "LIABILITY", amount: -363, at: "2026-09-08T03:00:00Z", reverses: 6 },
  { key: 8, type: "NON_COD_UPSTREAM_PAYMENT", cls: "MEMO", amount: 12_750, at: "2026-09-05T03:00:00Z" },
  { key: 9, type: "ADJUSTMENT", cls: "MEMO", amount: -12_750, at: "2026-09-08T03:00:00Z", reverses: 8 },
] as const;

function id(prefix: string, seq: number) {
  return `00000000-0000-0000-${prefix}-${String(seq).padStart(12, "0")}`;
}

async function clean() {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    for (const table of [
      "ledger_entries",
      "provider_order_snapshots",
      "provider_batches",
      "shipment_estimate_services",
      "shipment_estimate_snapshots",
      "shipments",
      "outlets",
      "memberships",
    ]) {
      await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenant]);
    }
    await client.query("DELETE FROM platform_roles WHERE user_id = $1", [superAdmin]);
    await client.query("DELETE FROM tenants WHERE id = $1", [tenant]);
    await client.query("DELETE FROM users WHERE id = ANY($1::text[])", [[tenantAdmin, operator, superAdmin]]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, appUrl);
  await clean();
  await admin.query(
    "INSERT INTO users (id,name,email,status) VALUES ($1,'Parity Admin','parity-admin@example.test','ACTIVE'),($2,'Parity Super','parity-super@example.test','ACTIVE'),($3,'Parity Operator','parity-operator@example.test','ACTIVE')",
    [tenantAdmin, superAdmin, operator],
  );
  await admin.query("INSERT INTO platform_roles (user_id) VALUES ($1)", [superAdmin]);
  await admin.query("INSERT INTO tenants (id,name,status) VALUES ($1,'Parity Tenant','ACTIVE')", [tenant]);
  await admin.query("INSERT INTO memberships (tenant_id,user_id,role) VALUES ($1,$2,'TENANT_ADMIN'),($1,$3,'OPERATOR')", [tenant, tenantAdmin, operator]);
  await admin.query("INSERT INTO outlets (id,tenant_id,name) VALUES ($1,$2,'Parity Outlet')", [outlet, tenant]);

  for (const row of outcomes) {
    const shipment = id("0190", row.seq);
    const snapshot = id("0191", row.seq);
    const service = id("0192", row.seq);
    const batch = id("0193", row.seq);
    const order = id("0194", row.seq);
    const issued = row.status === "ISSUED";
    await admin.query(
      "INSERT INTO shipments (id,tenant_id,outlet_id,status,created_at) VALUES ($1,$2,$3,$4,$5)",
      [shipment, tenant, outlet, row.status, row.createdAt],
    );
    await admin.query(
      `INSERT INTO shipment_estimate_snapshots
        (id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
         destination_area_label, weight_grams, is_cod_requested, credential_source)
       VALUES ($1,$2,$3,$4,'origin','destination','Destination',1000,false,'platform_default')`,
      [snapshot, tenant, shipment, outlet],
    );
    await admin.query(
      `INSERT INTO shipment_estimate_services
        (id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
         shipping_source_field, delivery_estimate, cod_eligible)
       VALUES ($1,$2,$3,'JNE REG','IDR',10000,'price','fixture',true)`,
      [service, tenant, snapshot],
    );
    await admin.query(
      `INSERT INTO provider_batches
        (id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
         provider_account_key, idempotency_key, status, submission_attempted_at,
         completed_at, created_at)
       VALUES ($1,$2,$3,'pickup','JNE','platform_default',$4,$5,'COMPLETED',$6,$7,$6)`,
      [
        batch,
        tenant,
        outlet,
        (1900 + row.seq).toString(16).padStart(64, "0"),
        (2900 + row.seq).toString(16).padStart(64, "0"),
        row.createdAt,
        row.resolvedAt,
      ],
    );
    await admin.query(
      `INSERT INTO provider_order_snapshots
        (id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id,
         position, provider_service, destination_area_id, destination_area_label, currency,
         shipping_amount_idr, is_cod, provider_cod_amount_idr, status, provider_order_id,
         is_paid, cnote_no, resolved_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,0,'JNE REG','destination','Destination','IDR',
         10000,false,NULL,$7,$8,$9,$10,$11,$12)`,
      [
        order,
        tenant,
        batch,
        shipment,
        snapshot,
        service,
        row.status,
        `parity-order-${row.seq}`,
        issued,
        issued ? `PARITY-AWB-${row.seq}` : null,
        row.resolvedAt,
        row.createdAt,
      ],
    );
  }
  await seedLedger();
});

async function seedLedger() {
  for (const row of ledger) {
    const reverses = "reverses" in row ? id("0195", row.reverses) : null;
    await admin.query(
      `INSERT INTO ledger_entries
        (id, tenant_id, outlet_id, shipment_id, provider_batch_id, provider_order_snapshot_id,
         entry_type, financial_class, amount_idr, currency, effective_at,
         source_event, source_event_id, actor_type, actor_user_id, reverses_entry_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'IDR',$10,$11,$12,$13,$14,$15)`,
      [
        id("0195", row.key),
        tenant,
        outlet,
        id("0190", 1),
        id("0193", 1),
        id("0194", 1),
        row.type,
        row.cls,
        row.amount,
        row.at,
        reverses ? "MANUAL_ADJUSTMENT" : row.type === "NON_COD_UPSTREAM_PAYMENT" ? "UNPAID_RECOVERY_COMPLETED" : "PROVIDER_ORDER_ISSUED",
        reverses ? id("0195", row.key) : `${id("0194", 1)}:${row.key}`,
        reverses ? "USER" : "SYSTEM",
        reverses ? tenantAdmin : null,
        reverses,
      ],
    );
  }
}

afterAll(async () => {
  await clean();
  await Promise.all([app.end(), admin.end()]);
});

const platformFilters = {
  range,
  scope: { kind: "tenant", tenantId: tenant } as const,
  outletId: null,
  courier: null,
  status: null,
  outcome: null,
  query: null,
  page: 1,
};

describe("spec 19 outcome metrics across scopes", () => {
  it("counts issued, unpaid and unknown outcomes by resolution time on every surface", async () => {
    const tenantResult = await withTenantContext(appDb, tenantAdmin, tenant, async (tx, context) => ({
      dashboard: await loadTenantDashboardPeriodSummary(tx, context, range, previousAnalyticsRange(range)),
      laporan: await loadCourierPerformance(tx, context, range, EMPTY_ANALYTICS_FILTERS),
    }));
    const platformResult = await withPlatformContext(appDb, superAdmin, async (tx) => ({
      counts: await readPlatformCounts(tx, platformFilters),
      trend: await readTrend(tx, platformFilters),
      usage: await listTenantUsage(tx, platformFilters, 10),
    }));
    const laporan = tenantResult.laporan.reduce(
      (sum, row) => ({ issued: sum.issued + row.issuedCount, outcomes: sum.outcomes + row.resolvedSubmissionCount }),
      { issued: 0, outcomes: 0 },
    );

    // SHP-ISSUED: seq 1 and 7 (both created before the range); seq 2 resolved after it.
    expect(tenantResult.dashboard.current.issuedCount).toBe(2);
    expect(laporan.issued).toBe(2);
    expect(platformResult.counts.lifecycle.issued).toBe(2);
    expect(platformResult.trend.reduce((sum, bucket) => sum + bucket.issued, 0)).toBe(2);
    expect(platformResult.usage.rows).toHaveLength(1);
    expect(platformResult.usage.rows[0]?.issued).toBe(2);

    // SHP-UNPAID-OUTCOME: seq 3 only.
    expect(platformResult.counts.lifecycle.unpaid).toBe(1);
    expect(platformResult.trend.reduce((sum, bucket) => sum + bucket.unpaid, 0)).toBe(1);
    expect(platformResult.usage.rows[0]?.unpaid).toBe(1);

    // SHP-ISSUE-RATE's denominator (D-1, every resolved outcome): seq 1, 3, 7 and the unknown
    // seq 5 that was created before the range — never the unknown seq 6 resolved after it.
    expect(laporan.outcomes).toBe(4);
    // SHP-UNKNOWN-OUTCOME on /platform counts the record by its creation: seq 6, not seq 5.
    expect(platformResult.counts.lifecycle.unknown).toBe(1);
    expect(platformResult.usage.rows[0]?.unknown).toBe(1);
  });

  it("gives both tenant roles the same ACT-NEEDED snapshot and the Operator no unpaid value", async () => {
    const [adminMetrics, operatorMetrics] = await Promise.all([
      withTenantContext(appDb, tenantAdmin, tenant, loadTenantDashboardMetrics),
      withTenantContext(appDb, operator, tenant, loadTenantDashboardMetrics),
    ]);
    // Both unknown shipments, whatever period they fall in; awaiting payment is not ACT-NEEDED.
    expect(adminMetrics.summary.actionRequired).toBe(2);
    expect(operatorMetrics.summary).toEqual(adminMetrics.summary);
    expect(operatorMetrics.role).toBe("OPERATOR");
    // The fixture holds two AWAITING_UPSTREAM_PAYMENT shipments; no field carries them.
    expect(JSON.stringify(operatorMetrics)).not.toMatch(/awaiting|unpaid/i);
    // Bound to the shape: exactly these summary keys, so a renamed unpaid field fails too.
    expect(Object.keys(operatorMetrics.summary).sort()).toEqual(["actionRequired", "issuedToday", "readyToProgress", "total"]);
    expect(Object.keys(operatorMetrics).sort()).toEqual(["generatedAt", "role", "summary", "workflowBreakdown"]);
  });

  it("includes insurance and adjustments in FIN-PROVIDER-COST and keeps CRR-SHIPPING-IDR shipping-only (T-90)", async () => {
    const recap = await withTenantContext(appDb, tenantAdmin, tenant, (tx, context) =>
      loadTenantDashboardCourierRecap(tx, context, range));
    const finance = await withPlatformContext(appDb, superAdmin, (tx) =>
      readPlatformTenantFinanceSummary(tx, platformFilters));

    // Platform tenant detail: shipping 10 000 + insurance 500 − the shipping reversal 10 000.
    expect(finance.ledger.providerCostIdr).toBe(500);
    // The principal and its reversal net to nothing; the reversal is not left uncounted.
    expect(finance.ledger.codPrincipalLiabilityIdr).toBe(0);
    expect(finance.ledger.revenueIdr).toBe(0);
    expect(finance.ledger.legacyCodFeeVatIdr).toBe(0);
    expect(finance.ledger.upstreamRecoveryPaymentIdr).toBe(0);
    expect(finance.ledger.entryCount).toBe(ledger.length);
    // Dasbor per-courier "Biaya kirim": shipping only (spec 19 CRR-SHIPPING-IDR), adjusted — 0.
    expect(recap.rows.find((row) => row.courier === "JNE")?.shippingCostIdr).toBe(0);
    // The two read the same ledger: provider cost − insurance = the recap's shipping.
    expect(finance.ledger.providerCostIdr - 500).toBe(
      recap.rows.reduce((sum, row) => sum + (row.shippingCostIdr ?? 0), 0),
    );
  });
});
