import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * T-190 — every shipment surface that names how a shipment is paid reads COD
 * Ongkir as COD Ongkir, with the shipping charge the courier collects, never
 * as "COD" or a goods / COD total (closes T-186 follow-up (e)).
 *
 * Each surface's real tenant-scoped repository read runs on the test database
 * and its rows go through the one shared payment mapping
 * (`presentShipmentPayment`), so a regression in the query (dropping
 * `cod_shipping_only`) or in the mapping fails here. UI v3 (ADR-0001) owns the
 * markup. The bulk-import preview is bound in bulk-import-actions.integration.test.ts.
 */

const principal = vi.hoisted(() => ({ tenantId: "", userId: "" }));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({
    role: "TENANT_ADMIN" as const,
    scope: "tenant" as const,
    tenantId: principal.tenantId,
    userId: principal.userId,
  })),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: () => null })) }));

const { lookupShipmentTracking } = await import("@/app/app/cek-resi/actions");
const { calculateCodAmounts, calculateCodOngkirAmounts } = await import("@/db/cod-totals-repository");
const { loadLabelIndexPage } = await import("@/db/label-print-repository");
const { completeProviderOrder } = await import("@/db/order-batch-repository");
const { loadRtsShipmentsPage } = await import("@/db/rts-repository");
const { loadShipmentQueuePage } = await import("@/db/shipment-queue-repository");
const { loadTenantDashboardPeriodSupport } = await import("@/db/tenant-dashboard-repository");
const schema = await import("@/db/schema");
const { withTenantContext } = await import("@/db/tenant-context");
const { buildAnalyticsDecisionContext } = await import("@/lib/analytics-decision-context");
const { parseAnalyticsRange } = await import("@/lib/analytics-range");
const { formatIdr } = await import("@/lib/label-format");
const { presentShipmentPayment } = await import("@/lib/payment-method");
const { ensureIntegrationRuntimeRole } = await import("./integration-runtime-role");

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
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-0190-0000-000000000001";
const tenantB = "00000000-0000-0190-0000-000000000002";
const outletA = "00000000-0000-0190-0001-000000000001";
const outletB = "00000000-0000-0190-0001-000000000002";
const userA = "t190-admin-a";
const userB = "t190-admin-b";

const GOODS = 250_000;
const CHARGE = 20_000;
const BASIS = 9_800;
const NON_COD_VALUE = 150_000;
const codTotal = calculateCodAmounts(GOODS, 12_000).providerCodAmountIdr;
const rp = (value: number) => formatIdr(value).replace(/\s/g, " ");

type Method = "NON_COD" | "COD" | "COD_ONGKIR";
const ids = (sequence: number) => {
  const suffix = String(sequence).padStart(12, "0");
  return {
    batchId: `00000000-0000-0190-0004-${suffix}`,
    orderId: `00000000-0000-0190-0005-${suffix}`,
    serviceId: `00000000-0000-0190-0006-${suffix}`,
    shipmentId: `00000000-0000-0190-0002-${suffix}`,
    snapshotId: `00000000-0000-0190-0007-${suffix}`,
  };
};

const references: Record<string, string> = {};

/** An issued shipment for `method`, written the way confirmation and completion write one. */
async function seedIssued(sequence: number, method: Method) {
  const row = ids(sequence);
  const isCod = method !== "NON_COD";
  const createdAt = new Date(Date.now() - 60 * 60_000).toISOString();
  const { rows } = await adminPool.query<{ public_reference: string }>(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at, updated_at) VALUES ($1, $2, $3, 'SUBMISSION_QUEUED', $4, $4) RETURNING public_reference",
    [row.shipmentId, tenantA, outletA, createdAt],
  );
  references[method + sequence] = rows[0]!.public_reference;
  await adminPool.query(
    `INSERT INTO shipment_drafts (shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod, cod_shipping_only)
     VALUES ($1, $2, 'destination-190', 'Kebayoran Baru, Jakarta Selatan', 'Kain batik', 1000, 1, $3, $4, $5)`,
    [row.shipmentId, tenantA, isCod ? GOODS : NON_COD_VALUE, isCod, method === "COD_ONGKIR"],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address) VALUES
      ($1, $2, 'SENDER', 'Toko Pengirim', '081255553333', 'Ruko Pengirim'),
      ($1, $2, 'RECIPIENT', 'Penerima ${method}', '081377772222', 'Jl. Penerima 1')`,
    [tenantA, row.shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
      destination_area_label, weight_grams, is_cod_requested, credential_source)
     VALUES ($1, $2, $3, $4, 'origin-190', 'destination-190', 'Kebayoran Baru, Jakarta Selatan', 1000, $5, 'platform_default')`,
    [row.snapshotId, tenantA, row.shipmentId, outletA, isCod],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
      shipping_source_field, delivery_estimate, cod_eligible, normal_price_idr, special_price_idr)
     VALUES ($1, $2, $3, 'JNE REG', 'IDR', 12000, 'price', 'fixture', true, 12000, $4)`,
    [row.serviceId, tenantA, row.snapshotId, BASIS],
  );
  let providerCodAmountIdr: number | null = null;
  if (isCod) {
    const amounts = method === "COD_ONGKIR"
      ? calculateCodOngkirAmounts({ chargeIdr: CHARGE, goodsValueIdr: GOODS, shippingAmountIdr: 12_000, shippingDeductedIdr: BASIS })
      : { ...calculateCodAmounts(GOODS, 12_000), codShippingBasisIdr: null };
    providerCodAmountIdr = amounts.providerCodAmountIdr;
    await adminPool.query(
      `INSERT INTO shipment_cod_totals (tenant_id, shipment_id, snapshot_id, estimate_service_id, currency, goods_value_idr,
        shipping_amount_idr, service_fee_idr, vat_amount_idr, provider_cod_amount_idr, cod_formula_version, cod_shipping_basis_idr)
       VALUES ($1, $2, $3, $4, 'IDR', $5, $6, $7, $8, $9, $10, $11)`,
      [tenantA, row.shipmentId, row.snapshotId, row.serviceId, amounts.goodsValueIdr, amounts.shippingAmountIdr,
        amounts.serviceFeeIdr, amounts.vatAmountIdr, amounts.providerCodAmountIdr, amounts.codFormulaVersion,
        amounts.codShippingBasisIdr],
    );
  }
  await adminPool.query(
    `INSERT INTO provider_batches (id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
      provider_account_key, idempotency_key, status, submission_attempted_at)
     VALUES ($1, $2, $3, 'pickup-190', 'JNE', 'platform_default', $4, $5, 'SUBMITTING', now())`,
    [row.batchId, tenantA, outletA, "d".repeat(64), `190${String(sequence).padStart(61, "0")}`],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id,
      position, provider_service, destination_area_id, destination_area_label, currency, shipping_amount_idr, is_cod,
      provider_cod_amount_idr, provider_charged_shipping_idr)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', 'destination-190', 'Kebayoran Baru, Jakarta Selatan', 'IDR', 12000, $7, $8, $9)`,
    [row.orderId, tenantA, row.batchId, row.shipmentId, row.snapshotId, row.serviceId, isCod, providerCodAmountIdr, BASIS],
  );
  await withTenantContext(appDb, userA, tenantA, (tx, context) =>
    completeProviderOrder(tx, context, row.batchId, {
      cnoteNo: `AWB190${sequence}`,
      isPaid: true,
      providerOrderId: `provider-190-${sequence}`,
      shipmentId: row.shipmentId,
    }));
  return row;
}

type PaymentFacts = Parameters<typeof presentShipmentPayment>[0];

/** Every row's payment as [method, "label amountLabel Rp …"], the text the old cell showed. */
function paymentCells(rows: readonly PaymentFacts[]) {
  return rows.map((row) => {
    const payment = presentShipmentPayment(row);
    return [payment.method, payment.amountIdr === null
      ? payment.label
      : `${payment.label} ${payment.amountLabel} ${rp(payment.amountIdr)}`];
  });
}

function asTenantA<T>(read: Parameters<typeof withTenantContext<T>>[3]) {
  return withTenantContext(appDb, userA, tenantA, read);
}

const ONGKIR_CELL = ["COD_ONGKIR", `COD Ongkir Ongkir ditagih ${rp(CHARGE)}`];
const COD_CELL = ["COD", `COD Total COD ${rp(codTotal)}`];

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await adminPool.query(
    `TRUNCATE ledger_entries, reconciliation_runs, print_events, provider_unpaid_recoveries,
      provider_order_snapshots, provider_batches, shipment_cod_totals, shipment_rts_events,
      shipment_estimate_services, shipment_estimate_snapshots, shipment_parties,
      shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE`,
  );
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, 'T190 A', 't190-a@example.test'), ($2, 'T190 B', 't190-b@example.test')",
    [userA, userB],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'T190 Tenant A', 'ACTIVE'), ($2, 'T190 Tenant B', 'ACTIVE')",
    [tenantA, tenantB],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($3, $4, 'TENANT_ADMIN')",
    [tenantA, userA, tenantB, userB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
     VALUES ($1, $2, 'Outlet T190', 'pickup-190', 'origin-190'), ($3, $4, 'Outlet B', 'pickup-190-b', 'origin-190-b')`,
    [outletA, tenantA, outletB, tenantB],
  );
  await seedIssued(1, "NON_COD");
  await seedIssued(2, "COD");
  await seedIssued(3, "COD_ONGKIR");
  const returned = await seedIssued(4, "COD_ONGKIR");
  await adminPool.query("UPDATE shipments SET status = 'RTS_QUEUED' WHERE id = $1", [returned.shipmentId]);
  principal.tenantId = tenantA;
  principal.userId = userA;
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("T-190 COD Ongkir on every shipment surface", () => {
  it("Histori kiriman: each method with its own figure, COD Ongkir with the charge collected", async () => {
    const page = await asTenantA((tx, context) => loadShipmentQueuePage(tx, context, { page: 1, pageSize: 20, status: "ALL" }));
    const cells = paymentCells(page.rows);
    expect(cells).toHaveLength(4);
    expect(cells.filter(([method]) => method === "COD_ONGKIR")).toEqual([ONGKIR_CELL, ONGKIR_CELL]);
    expect(cells).toContainEqual(COD_CELL);
    expect(cells).toContainEqual(["NON_COD", `Non-COD Nilai asuransi ${rp(NON_COD_VALUE)}`]);
  });

  it("RTS: a returned COD Ongkir parcel shows the charge, not the goods value", async () => {
    const page = await asTenantA((tx, context) => loadRtsShipmentsPage(tx, context, { page: 1, pageSize: 20, status: "ALL" }));
    const cells = paymentCells(page.rows);
    expect(cells).toEqual([ONGKIR_CELL]);
    expect(cells.flat().join(" ")).not.toContain(rp(GOODS));
  });

  it("Cetak resi: COD Ongkir prints as the charge collected, never as a COD total", async () => {
    // The Cetak resi list does not load the declared value.
    const page = await asTenantA((tx, context) => loadLabelIndexPage(tx, context, { status: "issued" }));
    const cells = paymentCells(page.rows.map((row) => ({ ...row, declaredValueIdr: null })));
    expect(cells.filter(([method]) => method !== "NON_COD")).toEqual(expect.arrayContaining([ONGKIR_CELL, COD_CELL]));
    expect(cells.some(([, text]) => text!.startsWith("COD Total COD") && text!.endsWith(rp(CHARGE)))).toBe(false);
  });

  it("Cek resi: the lookup names COD Ongkir and its charge", async () => {
    const state = await lookupShipmentTracking({ kind: "idle" }, (() => {
      const form = new FormData();
      form.set("trackingKey", references.COD_ONGKIR3!);
      return form;
    })());
    expect(state).toMatchObject({ kind: "found", result: { paymentMethod: "COD_ONGKIR", providerCodAmountIdr: CHARGE } });
    if (state.kind !== "found") throw new Error("Tracking lookup did not find the COD Ongkir shipment.");
    expect(paymentCells([state.result])).toEqual([ONGKIR_CELL]);
  });

  it("Dashboard: the COD drill-down lists COD Ongkir as its own method", async () => {
    const { currentRange } = buildAnalyticsDecisionContext(parseAnalyticsRange({ rentang: "7-hari" }, new Date()));
    const support = await asTenantA((tx, context) => loadTenantDashboardPeriodSupport(tx, context, currentRange, "cod"));
    expect(support.rows.map((row) => row.paymentMethod).sort()).toEqual(["COD", "COD_ONGKIR", "COD_ONGKIR"]);
  });
});
