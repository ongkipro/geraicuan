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
const { LabelSheet } = await import("@/app/app/label/[shipmentId]/label-sheet");
const { completeProviderOrder } = await import("@/db/order-batch-repository");
const { loadShipmentReportPage } = await import("@/db/shipment-report-repository");
const schema = await import("@/db/schema");
const { withTenantContext } = await import("@/db/tenant-context");
const { EMPTY_ANALYTICS_FILTERS } = await import("@/lib/analytics-filters");
const { parseAnalyticsRange } = await import("@/lib/analytics-range");
const { codOngkirBreakEvenIdr, mengantarCodFeeIdr } = await import("@/lib/mengantar-cod-fee");
const {
  labelMoneyFacts,
  MONEY_METRIC_IDS,
  customerCollectBreakdown,
  moneyForRole,
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
/** "Rp 1.234" / "−Rp 1.234" → a signed number. */
const amountOf = (value: string) => (value.includes("−") ? -1 : 1) * Number(value.replace(/[^\d]/g, ""));
/** Every <dd> amount inside the rendered <dl> whose opening tag matches `open`, in order. */
function ddAmounts(html: string, open: RegExp) {
  const block = html.match(new RegExp(`${open.source}[^>]*>([\\s\\S]*?)</dl>`));
  return block ? [...block[1]!.matchAll(/<dd[^>]*>([\s\S]*?)<\/dd>/g)].map(([, dd]) => amountOf(text(dd!))) : [];
}
/**
 * T-269: the page's arithmetic, read off the markup — the parent amount, its indented parts, the
 * settlement lines and Estimasi cair — so the sums are asserted on what is rendered.
 */
function sections(html: string) {
  const estimate = html.match(/data-metric-id="RPT-SHP-COD-DISBURSEMENT-EST-IDR"[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/);
  return {
    collect: ddAmounts(html, /<dl class=/)[0],
    estimate: estimate ? amountOf(text(estimate[1]!)) : null,
    parts: ddAmounts(html, /<dl aria-label="Rincian tagihan ke penerima"/),
    settlement: [
      ...ddAmounts(html, /<dl aria-label="Dipotong Mengantar saat pencairan"/),
      // Non-COD's one settlement line has no caption (nothing is deducted from a collection).
      ...(html.includes("Dipotong Mengantar") ? [] : ddAmounts(html.split('data-money-section="settlement"')[1] ?? "", /<dl/)),
    ],
  };
}

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
      ["COD-CHARGE-BREAKDOWN", "Ongkir ditagih ke penerima Rp 16.000"],
      // T-269: the fee is a child of the charge, so the children add up on screen.
      ["COD-CHARGE-BREAKDOWN", "Biaya COD (termasuk PPN) Rp 16.052"],
      ["COD-CHARGE-BREAKDOWN", "Pembulatan Rp 1"],
      ["RPT-SHP-COD-FEE-IDR", "Biaya COD (termasuk PPN) Bagian tagihan di atas, seluruhnya untuk Mengantar −Rp 16.052"],
      ["RPT-SHP-SHIPPING-COST-IDR", "Ongkir dibayar ke Mengantar −Rp 12.800"],
      ["RPT-SHP-COD-DISBURSEMENT-EST-IDR", "Estimasi cair Estimasi Ditagih ke penerima dikurangi potongan Mengantar. Perkiraan, bukan dana diterima Rp 453.201"],
    ]);
    expect(mengantarCodFeeIdr(482_053)).toBe(16_052);
    expect(sections(html)).toEqual({ collect: 482_053, estimate: 453_201, parts: [450_000, 16_000, 16_052, 1], settlement: [-16_052, -12_800] });
    expect(text(html)).toContain("Dipotong Mengantar saat pencairan");
    expect(text(html)).not.toMatch(/Jumlah bersih|pendapatan|Juga termasuk/i);
  });

  it("COD Ongkir: only ongkir + biaya COD is collected, the goods are named as paid", () => {
    // A charge raised above break-even before D-28: no rounding line, the shipping part is the rest.
    const html = render(ONGKIR_FACTS);
    expect(metricRows(html)).toEqual([
      ["COD-ONGKIR-CHARGE-IDR", "Ditagih ke penerima Ongkir + biaya COD saja Rp 7.000"],
      ["COD-ONGKIR-CHARGE-BREAKDOWN", "Ongkir ditagih ke penerima Rp 6.767"],
      ["COD-ONGKIR-CHARGE-BREAKDOWN", "Biaya COD (termasuk PPN) Rp 233"],
      ["RPT-SHP-COD-FEE-IDR", "Biaya COD (termasuk PPN) Bagian tagihan di atas, seluruhnya untuk Mengantar −Rp 233"],
      ["RPT-SHP-SHIPPING-COST-IDR", "Ongkir dibayar ke Mengantar −Rp 6.300"],
      ["RPT-SHP-COD-DISBURSEMENT-EST-IDR", "Estimasi cair Estimasi Ditagih ke penerima dikurangi potongan Mengantar. Perkiraan, bukan dana diterima Rp 467"],
      ["SHP-DECLARED-VALUE-IDR", "Nilai barang Sudah dibayar, tidak ditagih Rp 85.000"],
    ]);
    expect(sections(html)).toEqual({ collect: 7_000, estimate: 467, parts: [6_767, 233], settlement: [-233, -6_300] });
    // The quote's list price is not a line: neither the buyer nor Mengantar pays it here.
    expect(rp(text(html))).not.toContain("Rp 9.000");
  });

  it("children sum to the parent and the settlement sums to Estimasi cair: COD, COD Ongkir at break-even, Non-COD, rounding 0 and 1", () => {
    // GC-10177's shape: rounding 0, so no Pembulatan line.
    const cod0 = calculateCodAmounts(325_000, 32_500).providerCodAmountIdr;
    expect(cod0).toBe(369_815);
    const codNoRounding = render({
      ...COD_FACTS,
      chargedShippingIdr: 24_375,
      codCharge: storedCodCharge({ codTotals: { goodsValueIdr: 325_000, providerCodAmountIdr: cod0, shippingAmountIdr: 32_500 }, paymentMethod: "COD", providerCodAmountIdr: cod0 }).breakdown,
      declaredValueIdr: 325_000,
      providerCodAmountIdr: cod0,
      shippingAmountIdr: 32_500,
    });
    expect(sections(codNoRounding)).toEqual({ collect: 369_815, estimate: 333_125, parts: [325_000, 32_500, 12_315], settlement: [-12_315, -24_375] });
    expect(text(codNoRounding)).not.toContain("Pembulatan");
    // COD Ongkir at the D-28 computed charge: ongkir (the deducted basis) + fee + Pembulatan 1.
    const breakEven = codOngkirBreakEvenIdr(6_300)!;
    expect(breakEven).toBe(6_518);
    const ongkirComputed = render({ ...ONGKIR_FACTS, providerCodAmountIdr: breakEven });
    expect(sections(ongkirComputed)).toEqual({ collect: 6_518, estimate: 1, parts: [6_300, 217, 1], settlement: [-217, -6_300] });
    expect(metricRows(ongkirComputed)).toContainEqual(["COD-ONGKIR-CHARGE-BREAKDOWN", "Pembulatan Rp 1"]);
    // Every rendered case: the parts add up to the parent; parent − settlement = Estimasi cair.
    for (const html of [render(COD_FACTS), codNoRounding, render(ONGKIR_FACTS), ongkirComputed, render(NON_COD_FACTS)]) {
      const { collect, estimate, parts, settlement } = sections(html);
      expect(parts.reduce((sum, amount) => sum + amount, 0)).toBe(collect);
      if (estimate !== null) expect(collect + settlement.reduce((sum, amount) => sum + amount, 0)).toBe(estimate);
    }
    expect(sections(render(NON_COD_FACTS))).toEqual({ collect: 0, estimate: null, parts: [], settlement: [11_900] });
  });

  it("Operator (T-269, T-270): the customer's view — Nilai barang + Ongkir, no fee, no rounding, no settlement, no Estimasi cair; Tenant Admin unchanged", () => {
    for (const facts of [COD_FACTS, ONGKIR_FACTS, NON_COD_FACTS]) {
      const full = shipmentMoney(facts);
      expect(moneyForRole(full, "TENANT_ADMIN")).toBe(full);
      const html = renderToStaticMarkup(createElement(MoneyBreakdown, { money: moneyForRole(full, "OPERATOR") }));
      const ids = metricRows(html).map(([id]) => id);
      expect(ids).not.toContain(MONEY_METRIC_IDS.shippingCost);
      expect(ids).not.toContain(MONEY_METRIC_IDS.codFee);
      expect(ids).not.toContain(MONEY_METRIC_IDS.disbursementEstimate);
      expect(text(html)).not.toMatch(/Estimasi cair|Ongkir dibayar ke Mengantar|Dipotong Mengantar|Biaya COD|biaya COD|PPN|Pembulatan|Ongkir ditagih ke penerima/);
      expect(html).not.toContain('data-money-section="settlement"');
      // The recipient-side section still adds up.
      const { collect, parts } = sections(html);
      if (parts.length > 0) expect(parts.reduce((sum, amount) => sum + amount, 0)).toBe(collect);
    }
    // COD: Ongkir = 482 053 − 450 000 (the fee 16 052 and the rounding 1 are inside it).
    const cod = renderToStaticMarkup(createElement(MoneyBreakdown, { money: moneyForRole(shipmentMoney(COD_FACTS), "OPERATOR") }));
    expect(metricRows(cod)).toEqual([
      ["COD-TOTAL", "Ditagih ke penerima Rp 482.053"],
      ["COD-CHARGE-BREAKDOWN", "Nilai barang Rp 450.000"],
      ["CUSTOMER-ONGKIR-IDR", "Ongkir Rp 32.053"],
    ]);
    expect(rp(text(cod))).not.toMatch(/Rp 16\.052|Rp 16\.000|Rp 12\.800|Rp 453\.201/);
    // COD Ongkir: the whole charge is Ongkir; the goods stay the paid context line.
    expect(metricRows(renderToStaticMarkup(createElement(MoneyBreakdown, { money: moneyForRole(shipmentMoney(ONGKIR_FACTS), "OPERATOR") })))).toEqual([
      ["COD-ONGKIR-CHARGE-IDR", "Ditagih ke penerima Ongkir saja, barang sudah dibayar Rp 7.000"],
      ["CUSTOMER-ONGKIR-IDR", "Ongkir Rp 7.000"],
      ["SHP-DECLARED-VALUE-IDR", "Nilai barang Sudah dibayar, tidak ditagih Rp 85.000"],
    ]);
    // Non-COD: nothing collected, nothing paid to Mengantar shown.
    expect(metricRows(renderToStaticMarkup(createElement(MoneyBreakdown, { money: moneyForRole(shipmentMoney(NON_COD_FACTS), "OPERATOR") })))).toEqual([
      ["RPT-SHP-PAYMENT-MODE", "Ditagih ke penerima Tidak ada tagihan ke penerima Rp 0"],
      ["SHP-DECLARED-VALUE-IDR", "Nilai barang Untuk asuransi, tidak ditagih Rp 150.000"],
    ]);
  });

  it("customer Ongkir (CUSTOMER-ONGKIR-IDR) is the amount collected less Nilai barang, for COD; the whole charge for COD Ongkir", () => {
    const breakdown = storedCodCharge({ codTotals: { goodsValueIdr: 450_000, providerCodAmountIdr: COD_TOTAL, shippingAmountIdr: 16_000 }, paymentMethod: "COD", providerCodAmountIdr: COD_TOTAL }).breakdown;
    expect(customerCollectBreakdown({ codCharge: breakdown, paymentMethod: "COD", providerCodAmountIdr: COD_TOTAL })).toEqual({ goodsValueIdr: 450_000, ongkirIdr: 32_053 });
    expect(breakdown!.shippingAmountIdr + breakdown!.codFeeIdr + breakdown!.roundingIdr).toBe(32_053);
    expect(customerCollectBreakdown({ codCharge: null, paymentMethod: "COD_ONGKIR", providerCodAmountIdr: 7_000 })).toEqual({ goodsValueIdr: null, ongkirIdr: 7_000 });
    expect(customerCollectBreakdown({ codCharge: null, paymentMethod: "COD", providerCodAmountIdr: COD_TOTAL })).toBeNull();
    expect(customerCollectBreakdown({ codCharge: null, paymentMethod: "NON_COD", providerCodAmountIdr: null })).toBeNull();
  });

  it("Non-COD: nothing collected, the shipping paid to Mengantar, no estimate", () => {
    const html = render(NON_COD_FACTS);
    expect(metricRows(html)).toEqual([
      ["RPT-SHP-PAYMENT-MODE", "Ditagih ke penerima Tidak ada tagihan ke penerima Rp 0"],
      ["RPT-SHP-SHIPPING-COST-IDR", "Ongkir dibayar ke Mengantar Rp 11.900"],
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

  it("compact: the Laporan cell shows Ongkir dibayar ke Mengantar and Biaya COD under their metric IDs, never a bare \"COD\"", () => {
    const html = renderToStaticMarkup(createElement(MoneyBreakdownCompact, { lines: reportRowMoneyLines({ codFeeIdr: 233, shippingCostIdr: 6_300 }) }));
    expect([...html.matchAll(/data-metric-id="([^"]+)"/g)].map(([, id]) => id)).toEqual([
      MONEY_METRIC_IDS.shippingCost,
      MONEY_METRIC_IDS.codFee,
    ]);
    expect(rp(text(html))).toBe("Ongkir dibayar ke Mengantar Rp 6.300 Biaya COD (termasuk PPN) Rp 233");
    expect(html).not.toMatch(/<(dl|div)/);
    // Under the "Biaya Mengantar" column the first label is for screen readers only.
    const inTable = renderToStaticMarkup(createElement(MoneyBreakdownCompact, { lines: reportRowMoneyLines({ codFeeIdr: 233, shippingCostIdr: 6_300 }), showFirstLabel: false }));
    expect(inTable).toMatch(/<span class="[^"]*sr-only[^"]*">Ongkir dibayar ke Mengantar<\/span>/);
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
const userOp = "t269-operator-a";
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
  await adminPool.query("INSERT INTO users (id, name, email) VALUES ($1, 'T269 Operator', 't269-op@example.test')", [userOp]);
  await adminPool.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR')", [tenantA, userOp]);
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
    const fromDetail = view!.money;
    const fromLabel = label.money;
    // The label's money is the one its own facts give (admin: nothing hidden).
    expect(shipmentMoney(labelMoneyFacts(label))).toEqual(fromLabel);
    expect(fromLabel).toEqual(fromDetail);
    expect(renderToStaticMarkup(createElement(MoneyBreakdown, { money: fromLabel })))
      .toBe(renderToStaticMarkup(createElement(MoneyBreakdown, { money: fromDetail })));
    // The label page warns exactly when the sheet hides the COD lines — never for COD Ongkir.
    expect(fromLabel.kind === "inconsistent").toBe(label.paymentMethod === "COD" && label.codBreakdown === null);
    expect(fromLabel.kind).toBe(key === "COD_DRIFT" ? "inconsistent" : "ready");
  });

  it.each(["NON_COD", "COD", "COD_ONGKIR"])("%s as an Operator (T-269): the loaders drop every seller-side figure before render", async (key) => {
    const shipmentId = seeded[key]!;
    const asOperator = <T,>(read: Parameters<typeof withTenantContext<T>>[3]) => withTenantContext(appDb, userOp, tenantA, read);
    const admin = await asTenantA((tx, context) => loadPrintableLabel(tx, context, shipmentId));
    const label = await asOperator((tx, context) => loadPrintableLabel(tx, context, shipmentId));
    const view = await asOperator((tx, context) => loadShipmentDetailView(tx, context, shipmentId));
    // The Tenant Admin's label carries the charged shipping (the page's Rincian uang, not the sheet).
    expect(admin.chargedShippingIdr).toBe(BASIS);
    // The Operator's: no charged shipping, no settlement, no estimate. T-270: no label carries a
    // sheet shipping cost any more, for either role.
    expect(label.chargedShippingIdr).toBeNull();
    expect(admin).not.toHaveProperty("shippingCostIdr");
    expect(label).not.toHaveProperty("shippingCostIdr");
    for (const money of [label.money, view!.money]) {
      if (money.kind !== "ready") throw new Error(`${key} should be ready`);
      expect(money.deductions).toEqual([]);
      expect(money.estimate).toBeNull();
      expect(money.collect.amountIdr).toBe((admin.money as typeof money).collect.amountIdr);
      // T-270: the customer's split only, still adding up to what is collected.
      expect(money.collectParts.map((part) => part.metricId)).toEqual(
        key === "COD" ? ["COD-CHARGE-BREAKDOWN", "CUSTOMER-ONGKIR-IDR"] : key === "COD_ONGKIR" ? ["CUSTOMER-ONGKIR-IDR"] : [],
      );
      if (money.collectParts.length > 0) {
        expect(money.collectParts.reduce((sum, part) => sum + (part.amountIdr ?? 0), 0)).toBe(money.collect.amountIdr);
      }
    }
    // The Tenant Admin still gets the full split (fee, and rounding where there is one), adding up.
    const adminMoney = admin.money;
    if (adminMoney.kind !== "ready") throw new Error(`${key} should be ready`);
    if (key !== "NON_COD") {
      expect(adminMoney.collectParts.map((part) => part.label)).toContain("Biaya COD (termasuk PPN)");
      expect(adminMoney.collectParts.reduce((sum, part) => sum + (part.amountIdr ?? 0), 0)).toBe(adminMoney.collect.amountIdr);
      expect(adminMoney.deductions).toHaveLength(2);
      expect(adminMoney.estimate).not.toBeNull();
    }
    // Neither the fee nor the rounding reaches an Operator's label (T-270).
    expect(label.codBreakdown).toBeNull();
    if (key === "COD") expect(admin.codBreakdown).not.toBeNull();
    expect(view!.order).not.toHaveProperty("chargedShippingIdr");
    // What would be serialized to the browser for the sheet: no seller-side amount or estimate.
    const { money, ...sheet } = label;
    const payload = JSON.stringify({ money, sheet });
    expect(payload).not.toContain(`${BASIS}`);
    if (admin.money.kind === "ready" && admin.money.estimate?.amountIdr) {
      expect(payload).not.toContain(`"amountIdr":${admin.money.estimate.amountIdr}`);
    }
    expect(payload).not.toMatch(/RPT-SHP-SHIPPING-COST-IDR|RPT-SHP-COD-DISBURSEMENT-EST-IDR|RPT-SHP-COD-FEE-IDR|Estimasi cair|Ongkir dibayar ke Mengantar|Biaya COD|Pembulatan|codFeeIdr|roundingIdr/);
    if (adminMoney.kind === "ready" && key !== "NON_COD") {
      const fee = adminMoney.deductions.find((line) => line.metricId === "RPT-SHP-COD-FEE-IDR")!.amountIdr;
      expect(payload).not.toContain(`"amountIdr":${fee},`);
    }
    const sheetHtml = renderToStaticMarkup(createElement(MoneyBreakdown, { money: label.money }));
    expect(sheetHtml).not.toMatch(/Estimasi cair|Ongkir dibayar ke Mengantar/);
  });

  it.each(["NON_COD", "COD", "COD_ONGKIR"])("%s (T-270): the Tenant Admin and the Operator print the identical thermal sheet", async (key) => {
    const shipmentId = seeded[key]!;
    const admin = await asTenantA((tx, context) => loadPrintableLabel(tx, context, shipmentId));
    const operator = await withTenantContext(appDb, userOp, tenantA, (tx, context) => loadPrintableLabel(tx, context, shipmentId));
    const sheet = (label: typeof admin) => renderToStaticMarkup(createElement(LabelSheet, { label }));
    expect(sheet(operator)).toBe(sheet(admin));
    expect(sheet(admin)).not.toMatch(/Ongkir dibayar ke Mengantar|RPT-SHP-SHIPPING-COST-IDR|Estimasi cair|Biaya COD|PPN|Pembulatan|Ongkir ditagih ke penerima/);
    expect(sheet(admin)).not.toContain(`Rp ${BASIS.toLocaleString("id-ID")}`);
  });

  it("the Laporan row quotes the detail's Ongkir dibayar ke Mengantar and Biaya COD", async () => {
    const range = parseAnalyticsRange({ rentang: "30-hari", tz: "Asia/Jakarta" }, new Date());
    const page = await asTenantA((tx, context) =>
      loadShipmentReportPage(tx, context, { filters: EMPTY_ANALYTICS_FILTERS, page: 1, pageSize: 50, range }));
    for (const key of ["NON_COD", "COD", "COD_ONGKIR"]) {
      const row = page.rows.find((candidate) => candidate.shipmentId === seeded[key]);
      const view = await asTenantA((tx, context) => loadShipmentDetailView(tx, context, seeded[key]!));
      const money = view!.money;
      if (money.kind !== "ready") throw new Error(`${key} should be ready`);
      const byId = Object.fromEntries(money.deductions.map((line) => [line.metricId, line.amountIdr]));
      const report = Object.fromEntries(reportRowMoneyLines(row!).map((line) => [line.metricId, line.amountIdr]));
      expect(report).toEqual(byId);
      if (money.estimate) expect(row!.codDisbursementEstimateIdr).toBe(money.estimate.amountIdr);
    }
  });
});
