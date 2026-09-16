import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadShipmentKpis, loadShipmentPage } from "@/db/analytics-repository";
import * as schema from "@/db/schema";
import { courierDisplayName, courierRecapOrder, MENGANTAR_COURIERS } from "@/lib/mengantar-couriers";
import { withTenantContext } from "@/db/tenant-context";
import {
  loadTenantDashboardCourierRecap,
  loadTenantDashboardOutcomeSummary,
} from "@/db/tenant-dashboard-repository";
import { parseAnalyticsRange } from "@/lib/analytics-range";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

// Spec 19 SHP-OUTCOME-DELIVERED / -RETURNED / -FAILED and
// CRR-SHIPMENTS / CRR-DELIVERED / CRR-RETURNED / CRR-SHIPPING-IDR: every number
// the /app outcome and courier regions render must equal the Analitik number for
// the same tenant, outlet, courier and WIB period.

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
if (!adminUrl || !appUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
}
if (new URL(adminUrl).pathname !== "/geraicuan_test") {
  throw new Error("Dashboard outcome parity tests require geraicuan_test.");
}

const admin = new Pool({ connectionString: adminUrl });
const app = new Pool({ connectionString: appUrl });
let capturedStatements: string[] = [];
const appDb = drizzle({
  client: app,
  schema,
  logger: { logQuery: (query) => { capturedStatements.push(query); } },
});

const tenantA = "00000000-0000-3700-0000-000000000001";
const tenantB = "00000000-0000-3700-0000-000000000002";
const outletA = "00000000-0000-3701-0000-000000000001";
const outletA2 = "00000000-0000-3701-0000-000000000002";
const outletB = "00000000-0000-3701-0000-000000000003";
const adminA = "dashboard-outcome-admin-a";
const operatorA = "dashboard-outcome-operator-a";
const adminB = "dashboard-outcome-admin-b";

const now = new Date("2026-09-12T05:00:00.000Z");
const range = parseAnalyticsRange(
  { rentang: "kustom", dari: "2026-09-01", sampai: "2026-09-10", tz: "Asia/Jakarta" },
  now,
);
const emptyRange = parseAnalyticsRange(
  { rentang: "kustom", dari: "2026-07-01", sampai: "2026-07-05", tz: "Asia/Jakarta" },
  now,
);

function uuid(prefix: string, sequence: number) {
  return `00000000-0000-${prefix}-0000-${String(sequence).padStart(12, "0")}`;
}

type Fixture = {
  cod: boolean;
  costIdr?: number;
  courier?: string;
  createdAt: string;
  /** Reverses the shipping cost of the same shipment, effective at this instant. */
  costAdjustmentAt?: string;
  outletId?: string;
  sequence: number;
  status: (typeof schema.shipmentStatuses)[number];
  tenantId?: string;
};

// Row 7 is created before the period but pays inside it: its courier appears in
// the recap on cost alone. Row 6 has no provider batch, so it belongs to the
// outcome cohort and to no courier row.
const fixtures: Fixture[] = [
  { cod: true, costIdr: 10_000, courier: "JNE", createdAt: "2026-09-02T03:00:00Z", sequence: 1, status: "DELIVERED" },
  { cod: false, costIdr: 12_000, courier: "JNE", createdAt: "2026-09-03T03:00:00Z", sequence: 2, status: "DELIVERED" },
  { cod: true, costAdjustmentAt: "2026-09-05T03:00:00Z", costIdr: 9_000, courier: "JNE", createdAt: "2026-09-04T03:00:00Z", sequence: 3, status: "RTS_RECEIVED" },
  { cod: false, costIdr: 8_000, courier: "SICEPAT", createdAt: "2026-09-05T03:00:00Z", sequence: 4, status: "RTS_IN_TRANSIT" },
  { cod: true, courier: "SICEPAT", createdAt: "2026-09-06T03:00:00Z", sequence: 5, status: "FAILED" },
  { cod: false, createdAt: "2026-09-07T03:00:00Z", sequence: 6, status: "DRAFT" },
  { cod: true, costIdr: 7_000, courier: "ANTERAJA", createdAt: "2026-08-25T03:00:00Z", sequence: 7, status: "DELIVERED" },
  { cod: true, costIdr: 5_000, courier: "JNE", createdAt: "2026-09-03T04:00:00Z", outletId: outletA2, sequence: 8, status: "DELIVERED" },
  { cod: true, costIdr: 4_000, courier: "JNE", createdAt: "2026-09-03T05:00:00Z", outletId: outletB, sequence: 9, status: "DELIVERED", tenantId: tenantB },
];

/** Ledger cost effective instant: row 7 pays inside the period, everyone else on creation. */
function costEffectiveAt(fixture: Fixture) {
  return fixture.sequence === 7 ? "2026-09-08T03:00:00Z" : fixture.createdAt;
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
      "shipment_parties",
      "shipment_drafts",
      "shipments",
      "outlets",
      "memberships",
    ]) {
      await client.query(`DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    }
    await client.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await client.query("DELETE FROM users WHERE id = ANY($1::text[])", [[adminA, operatorA, adminB]]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seed(fixture: Fixture) {
  const tenantId = fixture.tenantId ?? tenantA;
  const outletId = fixture.outletId ?? outletA;
  const shipmentId = uuid("3710", fixture.sequence);

  await admin.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)",
    [shipmentId, tenantId, outletId, fixture.status, fixture.createdAt],
  );
  await admin.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity,
      declared_value_idr, is_cod, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,'Parity fixture',1000,1,100000,$5,$6,$6)`,
    [shipmentId, tenantId, `area-${fixture.sequence}`, `Tujuan ${fixture.sequence}`, fixture.cod, fixture.createdAt],
  );

  if (!fixture.courier) return;

  const snapshotId = uuid("3711", fixture.sequence);
  const serviceId = uuid("3712", fixture.sequence);
  const batchId = uuid("3713", fixture.sequence);
  const orderId = uuid("3714", fixture.sequence);
  const issued = fixture.status !== "FAILED";

  await admin.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
      destination_area_label, weight_grams, is_cod_requested, credential_source
    ) VALUES ($1,$2,$3,$4,'origin',$5,$6,1000,$7,'platform_default')`,
    [snapshotId, tenantId, shipmentId, outletId, `area-${fixture.sequence}`, `Tujuan ${fixture.sequence}`, fixture.cod],
  );
  await admin.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
      shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1,$2,$3,$4,'IDR',10000,'price','fixture',true)`,
    [serviceId, tenantId, snapshotId, `${fixture.courier} REG`],
  );
  await admin.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
      provider_account_key, idempotency_key, status, submission_attempted_at, completed_at, created_at
    ) VALUES ($1,$2,$3,'pickup',$4,'platform_default',$5,$6,'COMPLETED',$7,$7,$7)`,
    [
      batchId,
      tenantId,
      outletId,
      fixture.courier,
      (3700 + fixture.sequence).toString(16).padStart(64, "0"),
      (4700 + fixture.sequence).toString(16).padStart(64, "0"),
      fixture.createdAt,
    ],
  );
  await admin.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id,
      position, provider_service, destination_area_id, destination_area_label, currency,
      shipping_amount_idr, is_cod, provider_cod_amount_idr, status, provider_order_id,
      is_paid, cnote_no, resolved_at, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,'IDR',10000,$10,$11,$12,$13,$14,$15,$16,$16)`,
    [
      orderId,
      tenantId,
      batchId,
      shipmentId,
      snapshotId,
      serviceId,
      `${fixture.courier} REG`,
      `area-${fixture.sequence}`,
      `Tujuan ${fixture.sequence}`,
      fixture.cod,
      fixture.cod ? 150_000 : null,
      issued ? "ISSUED" : "FAILED",
      `order-${fixture.sequence}`,
      issued,
      issued ? `PARITY-AWB-${fixture.sequence}` : null,
      fixture.createdAt,
    ],
  );

  if (fixture.costIdr === undefined) return;

  const costId = uuid("3715", fixture.sequence);
  await admin.query(
    `INSERT INTO ledger_entries (
      id, tenant_id, outlet_id, shipment_id, provider_batch_id, provider_order_snapshot_id,
      entry_type, financial_class, amount_idr, currency, effective_at,
      source_event, source_event_id, actor_type
    ) VALUES ($1,$2,$3,$4,$5,$6,'MENGANTAR_SHIPPING_COST','EXPENSE',$7,'IDR',$8,
      'PROVIDER_ORDER_ISSUED',$6::uuid::text,'SYSTEM')`,
    [costId, tenantId, outletId, shipmentId, batchId, orderId, fixture.costIdr, costEffectiveAt(fixture)],
  );

  if (!fixture.costAdjustmentAt) return;

  await admin.query(
    `INSERT INTO ledger_entries (
      id, tenant_id, outlet_id, shipment_id, provider_batch_id, provider_order_snapshot_id,
      entry_type, financial_class, amount_idr, currency, effective_at,
      source_event, source_event_id, actor_type, actor_user_id, reverses_entry_id
    ) VALUES ($1,$2,$3,$4,$5,$6,'ADJUSTMENT','EXPENSE',$7,'IDR',$8,
      'MANUAL_ADJUSTMENT',$1::uuid::text,'USER',$9,$10)`,
    [
      uuid("3716", fixture.sequence),
      tenantId,
      outletId,
      shipmentId,
      batchId,
      orderId,
      -fixture.costIdr,
      fixture.costAdjustmentAt,
      tenantId === tenantB ? adminB : adminA,
      costId,
    ],
  );
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, appUrl);
  await clean();
  await admin.query(
    `INSERT INTO users (id,name,email,status) VALUES
      ($1,'Outcome Admin A','dashboard-outcome-admin-a@example.test','ACTIVE'),
      ($2,'Outcome Operator A','dashboard-outcome-operator-a@example.test','ACTIVE'),
      ($3,'Outcome Admin B','dashboard-outcome-admin-b@example.test','ACTIVE')`,
    [adminA, operatorA, adminB],
  );
  await admin.query(
    `INSERT INTO tenants (id,name,status) VALUES ($1,'Outcome Tenant A','ACTIVE'),($2,'Outcome Tenant B','ACTIVE')`,
    [tenantA, tenantB],
  );
  await admin.query(
    `INSERT INTO memberships (tenant_id,user_id,role) VALUES
      ($1,$2,'TENANT_ADMIN'),($1,$3,'OPERATOR'),($4,$5,'TENANT_ADMIN')`,
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
  await admin.query(
    `INSERT INTO outlets (id,tenant_id,name) VALUES ($1,$2,'Outlet A'),($3,$2,'Outlet A2'),($4,$5,'Outlet B')`,
    [outletA, tenantA, outletA2, outletB, tenantB],
  );

  for (const fixture of fixtures) await seed(fixture);
});

afterAll(async () => {
  await clean();
  await Promise.all([app.end(), admin.end()]);
});

const outletFilters = { outletId: outletA };
const analyticsFilters = { courier: null, lifecycleStatus: null, outletId: outletA } as const;

async function analyticsCount(
  lifecycleStatus: (typeof schema.shipmentStatuses)[number] | null,
  courier: string | null,
) {
  return withTenantContext(appDb, adminA, tenantA, async (tx, context) => {
    const page = await loadShipmentPage(
      tx,
      context,
      range,
      { limit: 1, offset: 0 },
      { ...analyticsFilters, courier, lifecycleStatus },
      "created",
    );
    return page.totalCount;
  });
}

describe("dashboard shipping outcome", () => {
  it("counts the period cohort by current lifecycle, split on the SHP-COD basis", async () => {
    const outcome = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadTenantDashboardOutcomeSummary(tx, context, range, outletFilters),
    );

    expect(outcome.cohortCount).toBe(6);
    expect(outcome.delivered).toEqual({ codCount: 1, nonCodCount: 1, totalCount: 2 });
    expect(outcome.returned).toEqual({ codCount: 1, nonCodCount: 1, totalCount: 2 });
    expect(outcome.failed).toEqual({ codCount: 1, nonCodCount: 0, totalCount: 1 });
    expect(outcome.generatedAt).toBeInstanceOf(Date);
  });

  it("equals the Analitik lifecycle counts for the same period and outlet", async () => {
    const outcome = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadTenantDashboardOutcomeSummary(tx, context, range, outletFilters),
    );

    expect(outcome.delivered.totalCount).toBe(await analyticsCount("DELIVERED", null));
    expect(outcome.failed.totalCount).toBe(await analyticsCount("FAILED", null));
    const returned =
      (await analyticsCount("RTS_QUEUED", null)) +
      (await analyticsCount("RTS_IN_TRANSIT", null)) +
      (await analyticsCount("RTS_RECEIVED", null));
    expect(outcome.returned.totalCount).toBe(returned);
    expect(outcome.cohortCount).toBe(await analyticsCount(null, null));
    // Each split adds up to its own total, so no cell escapes its metric ID.
    for (const row of [outcome.delivered, outcome.returned, outcome.failed]) {
      expect(row.codCount + row.nonCodCount).toBe(row.totalCount);
    }
  });

  it("reports an empty period instead of failing", async () => {
    const outcome = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadTenantDashboardOutcomeSummary(tx, context, emptyRange, outletFilters),
    );
    expect(outcome.cohortCount).toBe(0);
    expect(outcome.delivered.totalCount).toBe(0);
    expect(outcome.generatedAt).toBeInstanceOf(Date);
  });
});

describe("dashboard per-courier recap", () => {
  it("recaps volume by created cohort and cost by ledger period", async () => {
    const recap = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadTenantDashboardCourierRecap(tx, context, range, outletFilters),
    );

    expect(recap.shippingCostVisible).toBe(true);
    expect(recap.rows.map((row) => row.courier)).toEqual(["JNE", "SICEPAT", "ANTERAJA"]);
    expect(recap.rows[0]).toEqual({
      courier: "JNE",
      deliveredCount: 2,
      returnedCount: 1,
      shipmentCount: 3,
      // 10.000 + 12.000 + (9.000 − 9.000 reversal): adjustments are part of the type.
      shippingCostIdr: 22_000,
    });
    expect(recap.rows[1]).toEqual({
      courier: "SICEPAT",
      deliveredCount: 0,
      returnedCount: 1,
      shipmentCount: 2,
      shippingCostIdr: 8_000,
    });
    // Created before the period, paid inside it: cost without volume.
    expect(recap.rows[2]).toEqual({
      courier: "ANTERAJA",
      deliveredCount: 0,
      returnedCount: 0,
      shipmentCount: 0,
      shippingCostIdr: 7_000,
    });
  });

  it("equals the Analitik courier numbers for the same filters", async () => {
    const recap = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadTenantDashboardCourierRecap(tx, context, range, outletFilters),
    );

    for (const row of recap.rows) {
      expect(row.shipmentCount).toBe(await analyticsCount(null, row.courier));
      expect(row.deliveredCount).toBe(await analyticsCount("DELIVERED", row.courier));
      const returned =
        (await analyticsCount("RTS_QUEUED", row.courier)) +
        (await analyticsCount("RTS_IN_TRANSIT", row.courier)) +
        (await analyticsCount("RTS_RECEIVED", row.courier));
      expect(row.returnedCount).toBe(returned);

      const kpis = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        loadShipmentKpis(tx, context, range, { ...analyticsFilters, courier: row.courier }),
      );
      expect(row.shippingCostIdr).toBe(kpis.providerShippingIdr);
    }

    const tenantKpis = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadShipmentKpis(tx, context, range, analyticsFilters),
    );
    const total = recap.rows.reduce((sum, row) => sum + (row.shippingCostIdr ?? 0), 0);
    expect(total).toBe(tenantKpis.providerShippingIdr);
  });

  it("scopes to the tenant and to the selected outlet", async () => {
    const [allOutlets, otherTenant] = await Promise.all([
      withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        loadTenantDashboardCourierRecap(tx, context, range, {}),
      ),
      withTenantContext(appDb, adminB, tenantB, (tx, context) =>
        loadTenantDashboardCourierRecap(tx, context, range, {}),
      ),
    ]);

    // Outlet A2 adds one JNE shipment and Rp 5.000 that the outlet filter hides.
    expect(allOutlets.rows.find((row) => row.courier === "JNE")).toEqual({
      courier: "JNE",
      deliveredCount: 3,
      returnedCount: 1,
      shipmentCount: 4,
      shippingCostIdr: 27_000,
    });
    expect(otherTenant.rows).toEqual([
      { courier: "JNE", deliveredCount: 1, returnedCount: 0, shipmentCount: 1, shippingCostIdr: 4_000 },
    ]);
  });

  it("withholds ledger money from an operator", async () => {
    const recap = await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      loadTenantDashboardCourierRecap(tx, context, range, outletFilters),
    );
    expect(recap.shippingCostVisible).toBe(false);
    expect(recap.rows.every((row) => row.shippingCostIdr === null)).toBe(true);
    expect(recap.rows.map((row) => row.courier)).toEqual(["JNE", "SICEPAT"]);
  });

  it("returns no courier rows for an empty period", async () => {
    const recap = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadTenantDashboardCourierRecap(tx, context, emptyRange, outletFilters),
    );
    expect(recap.rows).toEqual([]);
    expect(recap.generatedAt).toBeInstanceOf(Date);
  });
});

// Review B7: the cross-tenant assertions below also pass with the application's own
// tenant predicate deleted, because RLS hides the foreign rows underneath. AGENTS.md
// forbids RLS being the only control, so bind the predicate itself.
// Review SF9: the three settled rows cover 3 of 13 statuses. The remainder row must
// equal what Analitik reports for every other status, or the table understates the cohort.
describe("dashboard outcome accounts for the whole cohort", () => {
  it("matches Analitik for the statuses that are neither delivered, returned nor failed", async () => {
    const outcome = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadTenantDashboardOutcomeSummary(tx, context, range, outletFilters),
    );
    const settled = new Set(["DELIVERED", "RTS_QUEUED", "RTS_IN_TRANSIT", "RTS_RECEIVED", "FAILED"]);
    const unsettled = schema.shipmentStatuses.filter((status) => !settled.has(status));
    let expected = 0;
    for (const status of unsettled) expected += await analyticsCount(status, null);

    expect(outcome.inProgress.totalCount).toBe(expected);
    expect(outcome.inProgress.codCount + outcome.inProgress.nonCodCount).toBe(expected);
    expect(
      outcome.delivered.totalCount + outcome.returned.totalCount + outcome.failed.totalCount + outcome.inProgress.totalCount,
    ).toBe(outcome.cohortCount);
  });
});

// T-171: every Mengantar courier gets its own table, including the ones with no shipment
// in the period, and a courier the catalogue does not name must still appear when the
// tenant has shipped with it.
describe("courier catalogue", () => {
  it("lists every known courier and any extra the tenant actually used", () => {
    const order = courierRecapOrder(["JNE", "Wahana"]);

    expect(order.slice(0, MENGANTAR_COURIERS.length)).toEqual([...MENGANTAR_COURIERS]);
    expect(order).toContain("Wahana");
    expect(order.filter((courier) => courier === "JNE")).toHaveLength(1);
    expect(courierDisplayName("JT")).toBe("J&T");
    expect(courierDisplayName("Wahana")).toBe("Wahana");
  });
});

describe("dashboard reads carry their own tenant predicate", () => {
  it("filters by tenant in SQL rather than relying on row-level security", async () => {
    capturedStatements = [];
    await withTenantContext(appDb, adminA, tenantA, async (tx, context) => {
      await loadTenantDashboardOutcomeSummary(tx, context, range, outletFilters);
      await loadTenantDashboardCourierRecap(tx, context, range, outletFilters);
    });
    // The context guard's own role probe is not a tenant read; every statement that
    // touches a tenant-owned table must carry the predicate.
    const reads = capturedStatements.filter((statement) => /\bfrom\s+"?(shipments|ledger_entries)"?/i.test(statement));
    expect(reads.length, "both dashboard reads issue a select").toBeGreaterThanOrEqual(2);
    for (const statement of reads) {
      expect(statement, statement).toMatch(/"(?:shipments|ledger_entries)"\."tenant_id"\s*=\s*\$\d/i);
    }
  });
});
