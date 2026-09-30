import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * T-261 "Rincian uang" (critique 2026-09-29 P1): one per-shipment money breakdown with one set of
 * labels and spec 19 metric IDs, rendered by the shipment detail, the label page panel and (compact)
 * the Laporan row. The render tests bind the component per payment method; the database test proves
 * that the detail loader and the label loader, reading the same shipment, produce the same lines,
 * and that the Laporan row quotes the same deductions.
 */

const { MoneyBreakdown, MoneyBreakdownCompact, MoneyInconsistentAlert } = await import("@/components/app/money-breakdown");
const { loadShipmentDetailView } = await import("@/app/app/pengiriman/[shipmentId]/detail-data");
const { calculateCodAmounts, calculateCodOngkirAmounts } = await import("@/db/cod-totals-repository");
const { loadPrintableLabel } = await import("@/db/label-print-repository");
const { completeProviderOrder } = await import("@/db/order-batch-repository");
const { loadShipmentReportPage } = await import("@/db/shipment-report-repository");
const schema = await import("@/db/schema");
const { withTenantContext } = await import("@/db/tenant-context");
const { EMPTY_ANALYTICS_FILTERS } = await import("@/lib/analytics-filters");
const { parseAnalyticsRange } = await import("@/lib/analytics-range");
const { mengantarCodFeeIdr } = await import("@/lib/mengantar-cod-fee");
const {
  labelMoneyFacts,
  MONEY_METRIC_IDS,
  reportRowMoneyLines,
  shipmentMoney,
  storedCodCharge,
} = await import("@/lib/shipment-money");
const { ensureIntegrationRuntimeRole } = await import("./integration-runtime-role");

type Facts = Parameters<typeof shipmentMoney>[0];

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const rp = (html: string) => html.replace(/ /g, " ");
/** Every rendered amount as [metric ID, visible text], in order. */
function metricRows(html: string) {
  return [...html.matchAll(/data-metric-id="([^"]+)"[^>]*>([\s\S]*?)<\/div>(?=\s*(?:<div[^>]*data-metric-id|<\/dl>))/g)]
    .map(([, id, body]) => [id, rp(text(body!))]);
}
const render = (facts: Facts, checkHref?: string) =>
  renderToStaticMarkup(createElement(MoneyBreakdown, { checkHref, money: shipmentMoney(facts) }));

const COD_TOTAL = calculateCodAmounts(450_000, 16_000).providerCodAmountIdr; // 482 053
const COD_FACTS: Facts = {
  chargedShippingIdr: 12_800,
  codCharge: storedCodCharge({
    codTotals: { goodsValueIdr: 450_000, providerCodAmountIdr: COD_TOTAL, shippingAmountIdr: 16_000 },
    paymentMethod: "COD",
    providerCodAmountIdr: COD_TOTAL,
  }).breakdown,
  codConsistent: true,
  declaredValueIdr: 450_000,
  insuranceAmountIdr: null,
  paymentMethod: "COD",
  providerCodAmountIdr: COD_TOTAL,
  shippingAmountIdr: 16_000,
};
const ONGKIR_FACTS: Facts = {
  chargedShippingIdr: 6_300,
  codCharge: null,
  codConsistent: true,
  declaredValueIdr: 85_000,
  insuranceAmountIdr: null,
  paymentMethod: "COD_ONGKIR",
  providerCodAmountIdr: 7_000,
  shippingAmountIdr: 9_000,
};
const NON_COD_FACTS: Facts = {
  chargedShippingIdr: 11_900,
  codCharge: null,
  codConsistent: true,
  declaredValueIdr: 150_000,
  insuranceAmountIdr: null,
  paymentMethod: "NON_COD",
  providerCodAmountIdr: null,
  shippingAmountIdr: 17_000,
};

describe("Rincian uang render (T-261)", () => {
  it("COD: the charge and what it is made of, what Mengantar keeps, then Estimasi cair — each with its metric ID", () => {
    expect(COD_TOTAL).toBe(482_053);
    const html = render(COD_FACTS);
    expect(metricRows(html)).toEqual([
      ["COD-TOTAL", "Ditagih ke penerima Rp 482.053"],
      ["COD-CHARGE-BREAKDOWN", "Nilai barang Rp 450.000"],
      ["COD-CHARGE-BREAKDOWN", "Ongkir Mengantar Rp 16.000"],
      ["COD-MENGANTAR-FEE", "Biaya COD (termasuk PPN) Rp 16.052"],
      ["COD-CHARGE-BREAKDOWN", "Pembulatan Rp 1"],
      ["RPT-SHP-SHIPPING-COST-IDR", "Biaya kirim Mengantar −Rp 12.800"],
      ["RPT-SHP-COD-FEE-IDR", "Biaya COD (termasuk PPN) −Rp 16.052"],
      ["RPT-SHP-COD-DISBURSEMENT-EST-IDR", "Estimasi cair Estimasi Perkiraan, bukan dana diterima Rp 453.201"],
    ]);
    // The identity the page states: Ditagih − Biaya kirim − Biaya COD = Estimasi cair.
    expect(482_053 - 12_800 - mengantarCodFeeIdr(482_053)).toBe(453_201);
    expect(text(html)).not.toMatch(/Jumlah bersih|pendapatan/i);
  });

  it("COD Ongkir: only ongkir + biaya COD is collected, the goods are named as paid", () => {
    const html = render(ONGKIR_FACTS);
    expect(metricRows(html)).toEqual([
      ["COD-ONGKIR-CHARGE-IDR", "Ditagih ke penerima Ongkir + biaya COD saja Rp 7.000"],
      ["RPT-SHP-SHIPPING-COST-IDR", "Biaya kirim Mengantar −Rp 6.300"],
      ["RPT-SHP-COD-FEE-IDR", "Biaya COD (termasuk PPN) −Rp 233"],
      ["RPT-SHP-COD-DISBURSEMENT-EST-IDR", "Estimasi cair Estimasi Perkiraan, bukan dana diterima Rp 467"],
      ["SHP-DECLARED-VALUE-IDR", "Nilai barang Sudah dibayar, tidak ditagih Rp 85.000"],
    ]);
    // The quote's list price is not a line: neither the buyer nor Mengantar pays it here.
    expect(rp(text(html))).not.toContain("Rp 9.000");
  });

  it("Non-COD: nothing collected, the shipping paid to Mengantar, no estimate", () => {
    const html = render(NON_COD_FACTS);
    expect(metricRows(html)).toEqual([
      ["RPT-SHP-PAYMENT-MODE", "Ditagih ke penerima Tidak ada tagihan ke penerima Rp 0"],
      ["RPT-SHP-SHIPPING-COST-IDR", "Biaya kirim Mengantar Rp 11.900"],
      ["SHP-DECLARED-VALUE-IDR", "Nilai barang Untuk asuransi, tidak ditagih Rp 150.000"],
    ]);
    expect(html).not.toContain("Estimasi cair");
  });

  it("before an order: says when the lines appear and shows only the declared value", () => {
    const html = render({ ...COD_FACTS, providerCodAmountIdr: null, shippingAmountIdr: null, codCharge: null });
    expect(html).toContain('data-money-state="pending"');
    expect(text(html)).toContain("Rincian uang muncul setelah pesanan dikirim ke Mengantar.");
    expect(metricRows(html).map(([id]) => id)).toEqual(["SHP-DECLARED-VALUE-IDR"]);
  });

  it("inconsistent COD: warn-tinted, explains what differs, keeps the Mengantar total and links to the check", () => {
    const html = render({ ...COD_FACTS, codCharge: null, codConsistent: false }, "/app/pengiriman/10178");
    expect(html).toContain('data-money-state="inconsistent"');
    expect(html).toMatch(/data-money-alert="inconsistent"[^>]*|class="[^"]*border-warn bg-warn-surface/);
    expect(html).toContain("border-warn bg-warn-surface");
    expect(html).toContain('role="status"');
    expect(rp(text(html))).toContain("Rincian COD tidak konsisten");
    expect(rp(text(html))).toContain("Total COD di pesanan Mengantar (Rp 482.053) tidak sama dengan nilai barang + ongkir + biaya COD");
    expect(html).toContain('href="/app/pengiriman/10178"');
    expect(text(html)).toContain("Periksa kiriman");
    // No partial breakdown and no estimate built on numbers that do not add up.
    expect(metricRows(html).map(([id]) => id)).toEqual(["COD-TOTAL"]);
    expect(html).not.toContain("Estimasi cair");
  });

  it("inconsistent COD Ongkir names its own charge; the alert alone omits the link when there is nowhere else to go", () => {
    const html = renderToStaticMarkup(createElement(MoneyInconsistentAlert, { amountIdr: 7_000, method: "COD_ONGKIR" }));
    expect(rp(text(html))).toContain("Nilai COD Ongkir di pesanan Mengantar (Rp 7.000) tidak sama dengan yang tercatat di GeraiCUAN.");
    expect(html).not.toContain("Periksa kiriman");
  });

  it("compact: the Laporan cell shows Biaya kirim and Biaya COD under their metric IDs, never a bare \"COD\"", () => {
    const html = renderToStaticMarkup(createElement(MoneyBreakdownCompact, { lines: reportRowMoneyLines({ codFeeIdr: 233, shippingCostIdr: 6_300 }) }));
    expect([...html.matchAll(/data-metric-id="([^"]+)"/g)].map(([, id]) => id)).toEqual([
      MONEY_METRIC_IDS.shippingCost,
      MONEY_METRIC_IDS.codFee,
    ]);
    expect(rp(text(html))).toBe("Biaya kirim Rp 6.300 Biaya COD Rp 233");
    expect(html).not.toMatch(/<(dl|div)/);
    // Under the "Biaya Mengantar" column the first label is for screen readers only.
    const inTable = renderToStaticMarkup(createElement(MoneyBreakdownCompact, { lines: reportRowMoneyLines({ codFeeIdr: 233, shippingCostIdr: 6_300 }), showFirstLabel: false }));
    expect(inTable).toMatch(/<span class="[^"]*sr-only[^"]*">Biaya kirim<\/span>/);
    expect(inTable).not.toMatch(/sr-only[^"]*">Biaya COD/);
    const noOrder = renderToStaticMarkup(createElement(MoneyBreakdownCompact, { lines: reportRowMoneyLines({ codFeeIdr: null, shippingCostIdr: null }) }));
    expect(text(noOrder)).toBe("—");
  });

  it("storedCodCharge: one consistency rule for label and detail", () => {
    const totals = { goodsValueIdr: 450_000, providerCodAmountIdr: COD_TOTAL, shippingAmountIdr: 16_000 };
    expect(storedCodCharge({ codTotals: totals, paymentMethod: "COD", providerCodAmountIdr: COD_TOTAL }).consistent).toBe(true);
    expect(storedCodCharge({ codTotals: totals, paymentMethod: "COD", providerCodAmountIdr: COD_TOTAL + 1 })).toEqual({ breakdown: null, consistent: false });
    expect(storedCodCharge({ codTotals: null, paymentMethod: "COD", providerCodAmountIdr: COD_TOTAL })).toEqual({ breakdown: null, consistent: false });
    // A COD Ongkir charge never has a goods breakdown, and that alone is not an inconsistency.
    expect(storedCodCharge({ codTotals: { goodsValueIdr: 85_000, providerCodAmountIdr: 7_000, shippingAmountIdr: 9_000 }, paymentMethod: "COD_ONGKIR", providerCodAmountIdr: 7_000 }))
      .toEqual({ breakdown: null, consistent: true });
    expect(storedCodCharge({ codTotals: null, paymentMethod: "NON_COD", providerCodAmountIdr: null }).consistent).toBe(true);
  });
});

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

const tenantA = "00000000-0000-0261-0000-000000000001";
const outletA = "00000000-0000-0261-0001-000000000001";
const userA = "t261-admin-a";
const GOODS = 250_000;
const PRICE = 12_000;
const BASIS = 9_800;

type Method = "NON_COD" | "COD" | "COD_ONGKIR";
const seeded: Record<string, string> = {};

async function seedIssued(sequence: number, method: Method, key: string) {
  const suffix = String(sequence).padStart(12, "0");
  const row = {
    batchId: `00000000-0000-0261-0004-${suffix}`,
    orderId: `00000000-0000-0261-0005-${suffix}`,
    serviceId: `00000000-0000-0261-0006-${suffix}`,
    shipmentId: `00000000-0000-0261-0002-${suffix}`,
    snapshotId: `00000000-0000-0261-0007-${suffix}`,
  };
  const isCod = method !== "NON_COD";
  await adminPool.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at, updated_at) VALUES ($1, $2, $3, 'SUBMISSION_QUEUED', now() - interval '1 hour', now() - interval '1 hour')",
    [row.shipmentId, tenantA, outletA],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod, cod_shipping_only)
     VALUES ($1, $2, 'destination-261', 'Kebayoran Baru, Jakarta Selatan', 'Kain batik', 1000, 1, $3, $4, $5)`,
    [row.shipmentId, tenantA, GOODS, isCod, method === "COD_ONGKIR"],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address) VALUES
      ($1, $2, 'SENDER', 'Toko Pengirim', '081255553333', 'Ruko Pengirim'),
      ($1, $2, 'RECIPIENT', 'Penerima', '081377772222', 'Jl. Penerima 1')`,
    [tenantA, row.shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
      destination_area_label, weight_grams, is_cod_requested, credential_source)
     VALUES ($1, $2, $3, $4, 'origin-261', 'destination-261', 'Kebayoran Baru, Jakarta Selatan', 1000, $5, 'platform_default')`,
    [row.snapshotId, tenantA, row.shipmentId, outletA, isCod],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
      shipping_source_field, delivery_estimate, cod_eligible, normal_price_idr, special_price_idr)
     VALUES ($1, $2, $3, 'JNE REG', 'IDR', $4, 'price', 'fixture', true, $4, $5)`,
    [row.serviceId, tenantA, row.snapshotId, PRICE, BASIS],
  );
  let providerCodAmountIdr: number | null = null;
  if (isCod) {
    const amounts = method === "COD_ONGKIR"
      ? calculateCodOngkirAmounts({ chargeIdr: 20_000, goodsValueIdr: GOODS, shippingAmountIdr: PRICE, shippingDeductedIdr: BASIS })
      : { ...calculateCodAmounts(GOODS, PRICE), codShippingBasisIdr: null };
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
     VALUES ($1, $2, $3, 'pickup-261', 'JNE', 'platform_default', $4, $5, 'SUBMITTING', now())`,
    [row.batchId, tenantA, outletA, "e".repeat(64), `261${String(sequence).padStart(61, "0")}`],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id,
      position, provider_service, destination_area_id, destination_area_label, currency, shipping_amount_idr, is_cod,
      provider_cod_amount_idr, provider_charged_shipping_idr)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 'JNE REG', 'destination-261', 'Kebayoran Baru, Jakarta Selatan', 'IDR', $7, $8, $9, $10)`,
    [row.orderId, tenantA, row.batchId, row.shipmentId, row.snapshotId, row.serviceId, PRICE, isCod, providerCodAmountIdr, BASIS],
  );
  await withTenantContext(appDb, userA, tenantA, (tx, context) =>
    completeProviderOrder(tx, context, row.batchId, {
      cnoteNo: `AWB261${sequence}`,
      isPaid: true,
      providerOrderId: `provider-261-${sequence}`,
      shipmentId: row.shipmentId,
    }));
  seeded[key] = row.shipmentId;
  return row;
}

function asTenantA<T>(read: Parameters<typeof withTenantContext<T>>[3]) {
  return withTenantContext(appDb, userA, tenantA, read);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await adminPool.query(
    `TRUNCATE ledger_entries, reconciliation_runs, print_events, provider_unpaid_recoveries,
      provider_order_snapshots, provider_batches, shipment_cod_totals, shipment_rts_events,
      shipment_estimate_services, shipment_estimate_snapshots, shipment_parties,
      shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE`,
  );
  await adminPool.query("INSERT INTO users (id, name, email) VALUES ($1, 'T261 A', 't261-a@example.test')", [userA]);
  await adminPool.query("INSERT INTO tenants (id, name, status) VALUES ($1, 'T261 Tenant', 'ACTIVE')", [tenantA]);
  await adminPool.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN')", [tenantA, userA]);
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
     VALUES ($1, $2, 'Outlet T261', 'pickup-261', 'origin-261')`,
    [outletA, tenantA],
  );
  await seedIssued(1, "NON_COD", "NON_COD");
  await seedIssued(2, "COD", "COD");
  await seedIssued(3, "COD_ONGKIR", "COD_ONGKIR");
  const drifted = await seedIssued(4, "COD", "COD_DRIFT");
  // A COD order whose amount no longer matches the stored total (the state the label warns about).
  await adminPool.query("UPDATE provider_order_snapshots SET provider_cod_amount_idr = provider_cod_amount_idr + 1 WHERE id = $1", [drifted.orderId]);
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("Rincian uang parity across surfaces (T-261)", () => {
  it.each(["NON_COD", "COD", "COD_ONGKIR", "COD_DRIFT"])("%s: the detail and the label page show the same lines", async (key) => {
    const shipmentId = seeded[key]!;
    const view = await asTenantA((tx, context) => loadShipmentDetailView(tx, context, shipmentId));
    const label = await asTenantA((tx, context) => loadPrintableLabel(tx, context, shipmentId));
    const fromDetail = shipmentMoney(view!.moneyFacts);
    const fromLabel = shipmentMoney(labelMoneyFacts(label));
    expect(fromLabel).toEqual(fromDetail);
    expect(renderToStaticMarkup(createElement(MoneyBreakdown, { money: fromLabel })))
      .toBe(renderToStaticMarkup(createElement(MoneyBreakdown, { money: fromDetail })));
    // The label page warns exactly when the sheet hides the COD lines — never for COD Ongkir.
    expect(fromLabel.kind === "inconsistent").toBe(label.paymentMethod === "COD" && label.codBreakdown === null);
    expect(fromLabel.kind).toBe(key === "COD_DRIFT" ? "inconsistent" : "ready");
  });

  it("the Laporan row quotes the detail's Biaya kirim Mengantar and Biaya COD", async () => {
    const range = parseAnalyticsRange({ rentang: "30-hari", tz: "Asia/Jakarta" }, new Date());
    const page = await asTenantA((tx, context) =>
      loadShipmentReportPage(tx, context, { filters: EMPTY_ANALYTICS_FILTERS, page: 1, pageSize: 50, range }));
    for (const key of ["NON_COD", "COD", "COD_ONGKIR"]) {
      const row = page.rows.find((candidate) => candidate.shipmentId === seeded[key]);
      const view = await asTenantA((tx, context) => loadShipmentDetailView(tx, context, seeded[key]!));
      const money = shipmentMoney(view!.moneyFacts);
      if (money.kind !== "ready") throw new Error(`${key} should be ready`);
      const byId = Object.fromEntries(money.deductions.map((line) => [line.metricId, line.amountIdr]));
      const report = Object.fromEntries(reportRowMoneyLines(row!).map((line) => [line.metricId, line.amountIdr]));
      expect(report).toEqual(byId);
      if (money.estimate) expect(row!.codDisbursementEstimateIdr).toBe(money.estimate.amountIdr);
    }
  });
});
