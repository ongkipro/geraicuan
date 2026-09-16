import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AnalyticsExportLimitError } from "@/db/analytics-repository";
import * as schema from "@/db/schema";
import { loadShipmentQueuePage } from "@/db/shipment-queue-repository";
import {
  loadShipmentReportExport,
  loadShipmentReportPage,
} from "@/db/shipment-report-repository";
import { withTenantContext } from "@/db/tenant-context";
import { serializeShipmentReportCsv } from "@/lib/analytics-export";
import { EMPTY_ANALYTICS_FILTERS } from "@/lib/analytics-filters";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import { SHIPMENT_REPORT_COLUMNS } from "@/lib/shipment-report";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

// PR-55 Laporan pengiriman. Spec 19 RPT-SHP-*: the rows, the per-courier and
// per-lifecycle totals and the CSV export all describe one tenant-scoped
// cohort — the same cohort Histori kiriman lists for the same period.

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
if (!adminUrl || !appUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
}
if (new URL(adminUrl).pathname !== "/geraicuan_test") {
  throw new Error("Shipment report tests require geraicuan_test.");
}

const admin = new Pool({ connectionString: adminUrl });
const app = new Pool({ connectionString: appUrl });
let capturedStatements: string[] = [];
const appDb = drizzle({
  client: app,
  schema,
  logger: { logQuery: (query) => { capturedStatements.push(query); } },
});

const tenantA = "00000000-0000-5500-0000-000000000001";
const tenantB = "00000000-0000-5500-0000-000000000002";
const outletA1 = "00000000-0000-5501-0000-000000000001";
const outletA2 = "00000000-0000-5501-0000-000000000002";
const outletB = "00000000-0000-5501-0000-000000000003";
const adminA = "shipment-report-admin-a";
const operatorA = "shipment-report-operator-a";
const adminB = "shipment-report-admin-b";

const now = new Date("2026-09-12T05:00:00.000Z");
const range = parseAnalyticsRange(
  { rentang: "kustom", dari: "2026-09-01", sampai: "2026-09-10", tz: "Asia/Jakarta" },
  now,
);

function uuid(prefix: string, sequence: number) {
  return `00000000-0000-${prefix}-0000-${String(sequence).padStart(12, "0")}`;
}

type Fixture = {
  cod?: boolean;
  codAmountIdr?: number | null;
  /** Mengantar's settlement shipping basis, when it differs from `price`. */
  chargedShippingIdr?: number;
  courier?: string;
  createdAt: string;
  outletId?: string;
  printedCount?: number;
  sequence: number;
  shippingAmountIdr?: number;
  /** A COD total left by an earlier COD estimate on a shipment issued non-COD. */
  staleCodTotals?: boolean;
  status: (typeof schema.shipmentStatuses)[number];
  tenantId?: string;
};

// Two couriers, one shipment that never reached a batch, one outside the
// period, one in the second outlet and one owned by the other tenant.
const fixtures: Fixture[] = [
  { courier: "JNE", createdAt: "2026-09-02T03:00:00Z", printedCount: 2, sequence: 1, shippingAmountIdr: 12_000, staleCodTotals: true, status: "ISSUED" },
  // Formula version 1 COD: goods 200_000 + shipping 15_000 + fee 6_450 + VAT 710.
  { chargedShippingIdr: 13_000, cod: true, codAmountIdr: 222_160, courier: "JNE", createdAt: "2026-09-03T03:00:00Z", sequence: 2, shippingAmountIdr: 15_000, status: "DELIVERED" },
  { courier: "SICEPAT", createdAt: "2026-09-04T03:00:00Z", outletId: outletA2, printedCount: 1, sequence: 3, shippingAmountIdr: 9_000, status: "ISSUED" },
  { createdAt: "2026-09-05T03:00:00Z", sequence: 4, status: "DRAFT" },
  { createdAt: "2026-08-20T03:00:00Z", sequence: 5, status: "DRAFT" },
  { courier: "JNE", createdAt: "2026-09-06T03:00:00Z", outletId: outletB, sequence: 6, shippingAmountIdr: 11_000, status: "ISSUED", tenantId: tenantB },
];

async function seed(fixture: Fixture) {
  const tenantId = fixture.tenantId ?? tenantA;
  const outletId = fixture.outletId ?? (tenantId === tenantB ? outletB : outletA1);
  const shipmentId = uuid("5521", fixture.sequence);

  await admin.query(
    `INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)`,
    [shipmentId, tenantId, outletId, fixture.status, fixture.createdAt],
  );
  await admin.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity,
      declared_value_idr, is_cod, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, 1000, 1, 100000, $6, $7, $7)`,
    [
      shipmentId,
      tenantId,
      `area-${fixture.sequence}`,
      `Kecamatan ${fixture.sequence}, Kota ${fixture.sequence}`,
      `Paket ${fixture.sequence}`,
      Boolean(fixture.cod),
      fixture.createdAt,
    ],
  );
  await admin.query(
    `INSERT INTO shipment_parties (
      tenant_id, shipment_id, role, name, phone, address, created_at
    ) VALUES
      ($1, $2, 'SENDER', 'Pengirim', '081211110000', 'Alamat pengirim', $3),
      ($1, $2, 'RECIPIENT', 'Penerima', '081299990000', 'Alamat penerima', $3)`,
    [tenantId, shipmentId, fixture.createdAt],
  );

  if (!fixture.courier) return shipmentId;

  const snapshotId = uuid("5531", fixture.sequence);
  const serviceId = uuid("5532", fixture.sequence);
  const batchId = uuid("5533", fixture.sequence);
  const orderId = uuid("5534", fixture.sequence);
  await admin.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id,
      destination_area_id, destination_area_label, weight_grams,
      is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'origin', $5, $6, 1000, $7, 'platform_default')`,
    [snapshotId, tenantId, shipmentId, outletId, `area-${fixture.sequence}`, `Kecamatan ${fixture.sequence}, Kota ${fixture.sequence}`, Boolean(fixture.cod)],
  );
  await admin.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency,
      shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, $4, 'IDR', $5, 'price', 'fixture', true)`,
    [serviceId, tenantId, snapshotId, `${fixture.courier} REG`, fixture.shippingAmountIdr ?? 0],
  );
  if (fixture.staleCodTotals) {
    await admin.query(
      `INSERT INTO shipment_cod_totals (
        tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
        goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
        provider_cod_amount_idr
      ) VALUES ($1, $2, $3, $4, 'IDR', 100000, 12000, 3360, 370, 115730)`,
      [tenantId, shipmentId, snapshotId, serviceId],
    );
  }
  if (fixture.cod) {
    await admin.query(
      `INSERT INTO shipment_cod_totals (
        tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
        goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
        provider_cod_amount_idr
      ) VALUES ($1, $2, $3, $4, 'IDR', 200000, $5, 6450, 710, $6)`,
      [tenantId, shipmentId, snapshotId, serviceId, fixture.shippingAmountIdr ?? 0, fixture.codAmountIdr],
    );
  }
  await admin.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
      provider_account_key, idempotency_key, status, submission_attempted_at, completed_at
    ) VALUES ($1, $2, $3, 'pickup', $4, 'platform_default', $5, $6, 'COMPLETED', $7, $7)`,
    [
      batchId,
      tenantId,
      outletId,
      fixture.courier,
      fixture.sequence.toString(16).padStart(64, "0"),
      (fixture.sequence + 5_500).toString(16).padStart(64, "0"),
      fixture.createdAt,
    ],
  );
  await admin.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id,
      estimate_service_id, position, provider_service, destination_area_id,
      destination_area_label, currency, shipping_amount_idr, is_cod,
      provider_cod_amount_idr, status, provider_order_id, is_paid, cnote_no, resolved_at,
      provider_charged_shipping_idr
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, 'IDR', $10, $11, $12,
      'ISSUED', $13, true, $14, $15, $16)`,
    [
      orderId,
      tenantId,
      batchId,
      shipmentId,
      snapshotId,
      serviceId,
      `${fixture.courier} REG`,
      `area-${fixture.sequence}`,
      `Kecamatan ${fixture.sequence}, Kota ${fixture.sequence}`,
      fixture.shippingAmountIdr ?? 0,
      Boolean(fixture.cod),
      fixture.codAmountIdr ?? null,
      `order-${fixture.sequence}`,
      `AWB-${fixture.sequence}`,
      fixture.createdAt,
      fixture.chargedShippingIdr ?? null,
    ],
  );

  for (let index = 1; index <= (fixture.printedCount ?? 0); index += 1) {
    await admin.query(
      `INSERT INTO print_events (
        id, tenant_id, shipment_id, provider_order_snapshot_id, sequence,
        outcome, actor_user_id, actor_role, awb_snapshot, printed_at
      ) VALUES ($1, $2, $3, $4, $5, 'PRINTED', $6, 'TENANT_ADMIN', $7, $8)`,
      [
        uuid("5541", fixture.sequence * 10 + index),
        tenantId,
        shipmentId,
        orderId,
        index,
        tenantId === tenantB ? adminB : adminA,
        `AWB-${fixture.sequence}`,
        fixture.createdAt,
      ],
    );
  }
  return shipmentId;
}

async function clean() {
  for (const table of [
    "print_events",
    "provider_order_snapshots",
    "provider_batches",
    "shipment_cod_totals",
    "shipment_estimate_services",
    "shipment_estimate_snapshots",
    "shipment_parties",
    "shipment_drafts",
    "shipments",
    "outlets",
    "memberships",
  ]) {
    await admin.query(`DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
  }
  await admin.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  await admin.query("DELETE FROM users WHERE id = ANY($1::text[])", [[adminA, operatorA, adminB]]);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, appUrl);
  await clean();
  await admin.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Report Admin A', 'shipment-report-admin-a@example.test'),
      ($2, 'Report Operator A', 'shipment-report-operator-a@example.test'),
      ($3, 'Report Admin B', 'shipment-report-admin-b@example.test')`,
    [adminA, operatorA, adminB],
  );
  await admin.query(
    `INSERT INTO tenants (id, name, status) VALUES
      ($1, 'Report Tenant A', 'ACTIVE'), ($2, 'Report Tenant B', 'ACTIVE')`,
    [tenantA, tenantB],
  );
  await admin.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR'), ($4, $5, 'TENANT_ADMIN')`,
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
  await admin.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id) VALUES
      ($1, $2, 'Outlet Laporan A1', 'pickup-a1', 'origin-a1'),
      ($3, $2, 'Outlet Laporan A2', 'pickup-a2', 'origin-a2'),
      ($4, $5, 'Outlet Laporan B', 'pickup-b', 'origin-b')`,
    [outletA1, tenantA, outletA2, outletB, tenantB],
  );
  for (const fixture of fixtures) await seed(fixture);
});

afterAll(async () => {
  await clean();
  await Promise.all([app.end(), admin.end()]);
});

function readReport(
  input: Partial<Parameters<typeof loadShipmentReportPage>[2]> = {},
  userId = adminA,
) {
  return withTenantContext(appDb, userId, tenantA, (tx, context) =>
    loadShipmentReportPage(tx, context, {
      filters: EMPTY_ANALYTICS_FILTERS,
      page: 1,
      pageSize: 50,
      range,
      ...input,
    }));
}

describe("shipment report rows", () => {
  it("lists the same shipments Histori kiriman lists for the same tenant and period", async () => {
    const report = await readReport();
    const queue = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadShipmentQueuePage(tx, context, { page: 1, pageSize: 100, range, status: "ALL" }));

    expect(report.rows.map((row) => row.publicReference).sort())
      .toEqual(queue.rows.map((row) => row.publicReference).sort());
    expect(report.totals.shipmentCount).toBe(queue.totalCount);
    // Four inside the period; the 2026-08-20 draft is outside it.
    expect(report.totals.shipmentCount).toBe(4);
  });

  it("carries every PR-55 column, including the print state and what Mengantar charges and pays out", async () => {
    const report = await readReport();
    // Fixture 1 is the only shipment with two recorded prints.
    const issued = report.rows.find((row) => row.printCount === 2);

    expect(issued).toBeTruthy();
    expect(issued!.courier).toBe("JNE");
    expect(issued!.providerService).toBe("JNE REG");
    // No stored settlement basis: the shipping cost falls back to `price`.
    expect(issued!.shippingCostIdr).toBe(12_000);
    // Non-COD carries no COD fee and no disbursement.
    expect(issued!.codFeeIdr).toBeNull();
    expect(issued!.codDisbursementEstimateIdr).toBeNull();
    expect(issued!.printCount).toBe(2);
    expect(issued!.destinationAreaLabel).toContain("Kecamatan");
    expect(issued!.issuedAt).toBeInstanceOf(Date);

    // COD 222_160: Mengantar's settlement basis (13_000); the fee Mengantar
    // keeps, round(222_160 × 333 / 10_000) = round(7_397.93) = 7_398 — not the
    // 7_160 (6_450 + 710) GeraiCUAN stored under the old additive formula; and
    // 222_160 − 13_000 − 7_398 = 201_762. The three columns add up to the COD
    // amount on the row, to the rupiah, which the old pair did not (202_000).
    const cod = report.rows.find((row) => row.isCod);
    expect(cod?.shippingCostIdr).toBe(13_000);
    expect(cod?.codFeeIdr).toBe(7_398);
    expect(cod?.codDisbursementEstimateIdr).toBe(201_762);
    expect(222_160 - cod!.shippingCostIdr! - cod!.codFeeIdr!).toBe(cod!.codDisbursementEstimateIdr);

    const draft = report.rows.find((row) => row.status === "DRAFT");
    expect(draft?.courier).toBeNull();
    expect(draft?.shippingCostIdr).toBeNull();
    expect(draft?.codFeeIdr).toBeNull();
    expect(draft?.codDisbursementEstimateIdr).toBeNull();
    expect(draft?.printCount).toBe(0);
  });

  it("applies the outlet, courier and lifecycle filters to the rows and the totals alike", async () => {
    const byOutlet = await readReport({
      filters: { ...EMPTY_ANALYTICS_FILTERS, outletId: outletA2 },
    });
    expect(byOutlet.totals.shipmentCount).toBe(1);
    expect(byOutlet.rows.map((row) => row.outletName)).toEqual(["Outlet Laporan A2"]);
    expect(byOutlet.totals.byCourier.map((total) => total.courier)).toEqual(["SICEPAT"]);

    const byCourier = await readReport({
      filters: { ...EMPTY_ANALYTICS_FILTERS, courier: "JNE" },
    });
    expect(byCourier.totals.shipmentCount).toBe(2);
    expect(byCourier.totals.byCourier).toEqual([
      { codDisbursementEstimateIdr: 201_762, codFeeIdr: 7_398, courier: "JNE", shipmentCount: 2, shippingCostIdr: 25_000 },
    ]);

    const byLifecycle = await readReport({
      filters: { ...EMPTY_ANALYTICS_FILTERS, lifecycleStatus: "DRAFT" },
    });
    expect(byLifecycle.totals.byLifecycle).toEqual([
      { shipmentCount: 1, status: "DRAFT" },
    ]);
  });
});

describe("shipment report totals", () => {
  it("describes the filtered set rather than the page the operator is looking at", async () => {
    const firstPage = await readReport({ page: 1, pageSize: 1 });

    expect(firstPage.rows).toHaveLength(1);
    expect(firstPage.totalPages).toBe(4);
    expect(firstPage.totals.shipmentCount).toBe(4);
    expect(
      firstPage.totals.byCourier.reduce((total, row) => total + row.shipmentCount, 0),
    ).toBe(4);
    expect(
      firstPage.totals.byLifecycle.reduce((total, row) => total + row.shipmentCount, 0),
    ).toBe(4);
    expect(
      firstPage.totals.byCourier.reduce((total, row) => total + row.shippingCostIdr, 0),
    ).toBe(34_000);
  });

  it("keeps the period out of neither the rows nor the totals", async () => {
    const wider = parseAnalyticsRange(
      { rentang: "kustom", dari: "2026-08-01", sampai: "2026-09-10", tz: "Asia/Jakarta" },
      now,
    );
    const widened = await readReport({ range: wider });

    expect(widened.totals.shipmentCount).toBe(5);
    expect(widened.rows).toHaveLength(5);
  });
});

describe("shipment report export", () => {
  it("exports every row the filters match, not the page the operator is looking at", async () => {
    const page = await readReport({ page: 1, pageSize: 1 });
    const exported = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadShipmentReportExport(tx, context, { filters: EMPTY_ANALYTICS_FILTERS, range }));

    expect(page.rows).toHaveLength(1);
    expect(exported.rows).toHaveLength(4);
    expect(exported.totalCount).toBe(4);

    const csv = serializeShipmentReportCsv(exported.rows);
    const lines = csv.replace("﻿", "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      SHIPMENT_REPORT_COLUMNS.map((column) => `"${column.csvHeader}"`).join(","),
    );
    expect(lines).toHaveLength(5);
    // The export must not widen what the page shows: no recipient name,
    // phone or street address reaches the file.
    expect(csv).not.toContain("Penerima");
    expect(csv).not.toContain("081299990000");
    expect(csv).not.toContain("Alamat penerima");
  });

  it("refuses an export above the row ceiling instead of truncating it", async () => {
    await expect(
      withTenantContext(appDb, adminA, tenantA, (tx, context) =>
        loadShipmentReportExport(tx, context, {
          filters: EMPTY_ANALYTICS_FILTERS,
          maxRows: 3,
          range,
        })),
    ).rejects.toBeInstanceOf(AnalyticsExportLimitError);

    const withinCeiling = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadShipmentReportExport(tx, context, {
        filters: EMPTY_ANALYTICS_FILTERS,
        maxRows: 4,
        range,
      }));
    expect(withinCeiling.rows).toHaveLength(4);
  });
});

describe("shipment report scope", () => {
  it("returns no other tenant's shipments in the rows, the totals or the export", async () => {
    const report = await readReport();
    const exported = await withTenantContext(appDb, adminA, tenantA, (tx, context) =>
      loadShipmentReportExport(tx, context, { filters: EMPTY_ANALYTICS_FILTERS, range }));

    expect(report.rows.map((row) => row.outletName)).not.toContain("Outlet Laporan B");
    expect(exported.rows.map((row) => row.outletName)).not.toContain("Outlet Laporan B");
    expect(report.totals.byCourier.reduce((total, row) => total + row.shipmentCount, 0)).toBe(4);

    const otherTenant = await withTenantContext(appDb, adminB, tenantB, (tx, context) =>
      loadShipmentReportPage(tx, context, {
        filters: EMPTY_ANALYTICS_FILTERS,
        page: 1,
        pageSize: 50,
        range,
      }));
    expect(otherTenant.totals.shipmentCount).toBe(1);
  });

  // Review B7 again: the assertions above also pass with the application's own
  // tenant predicate deleted, because row-level security hides the foreign rows
  // underneath. AGENTS.md forbids RLS being the only control, so bind the
  // predicate itself — every statement that reads a tenant-owned table must
  // carry `"shipments"."tenant_id" = $n`.
  it("filters by tenant in SQL rather than relying on row-level security", async () => {
    capturedStatements = [];
    await withTenantContext(appDb, adminA, tenantA, async (tx, context) => {
      await loadShipmentReportPage(tx, context, {
        filters: EMPTY_ANALYTICS_FILTERS,
        page: 1,
        pageSize: 50,
        range,
      });
      await loadShipmentReportExport(tx, context, {
        filters: EMPTY_ANALYTICS_FILTERS,
        range,
      });
    });

    const reads = capturedStatements.filter((statement) => /\bfrom\s+"?shipments"?/i.test(statement));
    expect(reads.length, "the report issues its row, total and export selects").toBeGreaterThanOrEqual(4);
    for (const statement of reads) {
      expect(statement, statement).toMatch(/"shipments"\."tenant_id"\s*=\s*\$\d/i);
    }
  });

  it("refuses the report and its export to a role other than Tenant Admin", async () => {
    await expect(readReport({}, operatorA)).rejects.toThrow(/TENANT_ADMIN/);
    await expect(
      withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
        loadShipmentReportExport(tx, context, { filters: EMPTY_ANALYTICS_FILTERS, range })),
    ).rejects.toThrow(/TENANT_ADMIN/);
  });
});
