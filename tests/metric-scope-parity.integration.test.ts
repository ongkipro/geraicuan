import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadShipmentKpis } from "@/db/analytics-repository";
import { withPlatformContext } from "@/db/platform-context";
import {
  listTenantUsage,
  readPlatformCounts,
  readTrend,
} from "@/db/platform-monitoring-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantDashboardPeriodSummary } from "@/db/tenant-dashboard-repository";
import { parseAnalyticsRange, previousAnalyticsRange } from "@/lib/analytics-range";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

// Spec 19 SHP-ISSUED and SHP-UNPAID-OUTCOME: every scope counts an outcome by
// provider_order_snapshots.resolved_at, never by when the order row was created.

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
    await client.query("DELETE FROM users WHERE id = ANY($1::text[])", [[tenantAdmin, superAdmin]]);
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
    "INSERT INTO users (id,name,email,status) VALUES ($1,'Parity Admin','parity-admin@example.test','ACTIVE'),($2,'Parity Super','parity-super@example.test','ACTIVE')",
    [tenantAdmin, superAdmin],
  );
  await admin.query("INSERT INTO platform_roles (user_id) VALUES ($1)", [superAdmin]);
  await admin.query("INSERT INTO tenants (id,name,status) VALUES ($1,'Parity Tenant','ACTIVE')", [tenant]);
  await admin.query("INSERT INTO memberships (tenant_id,user_id,role) VALUES ($1,$2,'TENANT_ADMIN')", [tenant, tenantAdmin]);
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
});

afterAll(async () => {
  await clean();
  await Promise.all([app.end(), admin.end()]);
});

describe("spec 19 outcome metrics across scopes", () => {
  it("counts issued and unpaid outcomes by resolution time on every surface", async () => {
    const tenantResult = await withTenantContext(appDb, tenantAdmin, tenant, async (tx, context) => ({
      dashboard: await loadTenantDashboardPeriodSummary(tx, context, range, previousAnalyticsRange(range)),
      analytics: await loadShipmentKpis(tx, context, range),
    }));

    const filters = {
      range,
      scope: { kind: "tenant", tenantId: tenant } as const,
      outletId: null,
      courier: null,
      status: null,
      outcome: null,
      query: null,
      page: 1,
    };
    const platformResult = await withPlatformContext(appDb, superAdmin, async (tx) => ({
      counts: await readPlatformCounts(tx, filters),
      trend: await readTrend(tx, filters),
      usage: await listTenantUsage(tx, filters, 10),
    }));

    expect(tenantResult.dashboard.current.issuedCount).toBe(1);
    expect(tenantResult.analytics.issuedCount).toBe(1);
    expect(platformResult.counts.lifecycle.issued).toBe(1);
    expect(platformResult.trend.reduce((sum, bucket) => sum + bucket.issued, 0)).toBe(1);
    expect(platformResult.usage.rows).toHaveLength(1);
    expect(platformResult.usage.rows[0]?.issued).toBe(1);

    expect(platformResult.counts.lifecycle.unpaid).toBe(1);
    expect(platformResult.trend.reduce((sum, bucket) => sum + bucket.unpaid, 0)).toBe(1);
    expect(platformResult.usage.rows[0]?.unpaid).toBe(1);
  });
});
