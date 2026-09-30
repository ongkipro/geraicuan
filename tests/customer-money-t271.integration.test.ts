// T-271 (owner 2026-10-01, D-40): the gerai's COD fee and rounding are its private earnings and must
// never be derivable by the customer (invoice template version 2) or shown to an Operator on Buat
// kiriman (D-37/D-38 tiers, decided on the server). No database: render and pure-rule tests.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InvoiceSheet, invoiceV2CodLines } from "@/app/app/invoice/invoice-sheet";
import { IssuanceProvider, IssuanceServiceChooser } from "@/app/app/pengiriman/_components/issuance-panel";
import { calculateCodAmounts } from "@/db/cod-totals-repository";
import type { ShipmentInvoice } from "@/db/shipment-invoice-repository";
import { codChargeBreakdown } from "@/lib/mengantar-cod-fee";
import { codOngkirAmount, issuanceCharges } from "@/lib/shipment-draft-logic";
import { buildShipmentEstimateOptions, issuanceOptionsForRole, type ShipmentEstimateOption } from "@/lib/shipment-estimate-options";
import { customerCollectBreakdown } from "@/lib/shipment-money";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/ /g, " ").replace(/\s+/g, " ").trim();
/** Seller-side words that must never reach a customer document or an Operator's issuance step. */
const SELLER_WORDS = /Biaya COD|biaya COD|PPN|Pembulatan|pembulatan|dibayar ke Mengantar|dipotong Mengantar|Estimasi cair|Ongkir ditagih ke penerima|3,33/;

// ------------------------------------------------------------------ invoice

/** The fixtures the pinned version 1 markup (tests/fixtures/invoice-v1-markup.json) was captured from, before T-271. */
const base: ShipmentInvoice = {
  collectionMode: "NON_COD",
  courierCollectionIdr: null,
  declaredValueIdr: 150_000,
  document: {
    courierService: "JNE REG",
    deliveryEstimate: "1-2 hari",
    gerai: { address: "Jl. Kenanga 5, Menteng, Jakarta Pusat", name: "Gerai Nota A", whatsapp: "081234567890" },
    items: [{ name: "Kain batik", quantity: 2 }, { name: "Daster", quantity: 1 }],
    recipient: { city: "Menteng, Jakarta Pusat", name: "Penerima Sintetis" },
    resi: "JNE-T271-000001",
    sender: { city: "Jl. Kenanga 5, Menteng, Jakarta Pusat", name: "Gerai Sintetis", phone: "081211110000" },
    weightGrams: 1_250,
  },
  id: "00000000-0000-4000-8000-000000000271",
  insuranceIdr: 1_500,
  invoiceNumber: "INV-GC-10271",
  issuedAt: new Date("2026-09-26T03:13:00.000Z"),
  issuedByUserId: "user-1",
  logoSha256: "a".repeat(64),
  shipmentId: "00000000-0000-4000-8000-000000000272",
  shippingChargeIdr: 8_000,
  templateVersion: 1,
  totalIdr: 9_500,
};
const v1Fixtures = {
  cod: { invoice: { ...base, collectionMode: "COD", courierCollectionIdr: 191_564 }, medium: "a4" },
  codOngkir: {
    invoice: { ...base, collectionMode: "COD_SHIPPING_ONLY", courierCollectionIdr: 8_277, insuranceIdr: 0, shippingChargeIdr: 8_277, totalIdr: 8_277 },
    medium: "80mm",
  },
  nonCod: { invoice: base, medium: "80mm" },
} as const satisfies Record<string, { invoice: ShipmentInvoice; medium: "80mm" | "a4" }>;
const pinnedV1 = JSON.parse(readFileSync(new URL("./fixtures/invoice-v1-markup.json", import.meta.url), "utf8")) as Record<keyof typeof v1Fixtures, string>;

const renderInvoice = (invoice: ShipmentInvoice, medium: "80mm" | "a4" = "80mm") =>
  renderToStaticMarkup(createElement(InvoiceSheet, { invoice, medium }));

/** The worked example: goods Rp150.000, quote Rp8.000 → COD-TOTAL by the version 2 formula. */
const cod = calculateCodAmounts(150_000, 8_000);
const codInvoiceV2: ShipmentInvoice = {
  ...base,
  collectionMode: "COD",
  courierCollectionIdr: cod.providerCodAmountIdr,
  insuranceIdr: 1_500,
  templateVersion: 2,
};

describe("invoice template version 1 (issued before T-271)", () => {
  it("renders byte-identical to the markup pinned before T-271, for every collection mode", () => {
    for (const [key, { invoice, medium }] of Object.entries(v1Fixtures) as [keyof typeof v1Fixtures, (typeof v1Fixtures)[keyof typeof v1Fixtures]][]) {
      expect(renderInvoice(invoice, medium), key).toBe(pinnedV1[key]);
    }
  });

  it("still lets the version 1 COD reader see the quote price beside the collection (why version 2 exists)", () => {
    const body = text(renderInvoice({ ...codInvoiceV2, templateVersion: 1 }));
    expect(body).toMatch(/Ongkir Rp 8\.000/);
    expect(body).toContain(`ditagih kurir ke penerima: Rp ${cod.providerCodAmountIdr.toLocaleString("id-ID")}`);
  });
});

describe("invoice template version 2 (T-271)", () => {
  it("COD: Nilai barang + Ongkir (collected − Nilai barang) = Total, the fee folded into Ongkir", () => {
    const breakdown = codChargeBreakdown(cod)!;
    expect(cod.providerCodAmountIdr).toBe(163_443);
    expect(breakdown).toMatchObject({ codFeeIdr: 5_443, roundingIdr: 0 });
    expect(invoiceV2CodLines(codInvoiceV2)).toEqual({ goodsValueIdr: 150_000, ongkirIdr: 13_443, totalIdr: 163_443 });
    // The same figure the thermal sheet and an Operator's Rincian uang print (CUSTOMER-ONGKIR-IDR).
    expect(customerCollectBreakdown({ codCharge: breakdown, paymentMethod: "COD", providerCodAmountIdr: cod.providerCodAmountIdr })?.ongkirIdr).toBe(13_443);

    const body = text(renderInvoice(codInvoiceV2));
    expect(body).toMatch(/Nilai barang Rp 150\.000 Ongkir Rp 13\.443 Total Rp 163\.443 Pembayaran: COD — ditagih kurir ke penerima: Rp 163\.443/);
    // Nothing on the nota lets the customer subtract the quote: no Rp 8.000, no insurance, no fee.
    expect(body).not.toMatch(/Rp 8\.000|Asuransi|Rp 1\.500|Rp 5\.443|Total ongkir|\(informasi\)/);
    expect(body).not.toMatch(SELLER_WORDS);
  });

  it("COD Ongkir: the whole charge is Ongkir", () => {
    const charge = codOngkirAmount(7_000)!;
    const invoice: ShipmentInvoice = {
      ...base, collectionMode: "COD_SHIPPING_ONLY", courierCollectionIdr: charge.chargeIdr, insuranceIdr: 0,
      shippingChargeIdr: charge.chargeIdr, templateVersion: 2, totalIdr: charge.chargeIdr,
    };
    expect(invoiceV2CodLines(invoice)).toEqual({ goodsValueIdr: null, ongkirIdr: charge.chargeIdr, totalIdr: charge.chargeIdr });
    const body = text(renderInvoice(invoice));
    const amount = charge.chargeIdr.toLocaleString("id-ID");
    expect(body).toContain(`Ongkir Rp ${amount} Total ongkir Rp ${amount} Pembayaran: COD ongkir — ditagih kurir: Rp ${amount} Nilai barang (informasi): Rp 150.000`);
    expect(body).not.toContain("Rp 7.000");
    expect(body).not.toMatch(SELLER_WORDS);
  });

  it("Non-COD: the version 1 lines, unchanged", () => {
    expect(invoiceV2CodLines(base)).toBeNull();
    expect(renderInvoice({ ...base, templateVersion: 2 })).toBe(pinnedV1.nonCod);
    expect(text(renderInvoice({ ...base, templateVersion: 2 }))).not.toMatch(SELLER_WORDS);
  });

  it("a collection below Nilai barang prints the total only, never a negative Ongkir", () => {
    const invoice = { ...codInvoiceV2, courierCollectionIdr: 111_721 };
    expect(invoiceV2CodLines(invoice)).toEqual({ goodsValueIdr: null, ongkirIdr: null, totalIdr: 111_721 });
    const body = text(renderInvoice(invoice));
    expect(body).toMatch(/Total Rp 111\.721/);
    expect(body).not.toMatch(/−|Ongkir Rp|Nilai barang Rp/);
  });
});

// ------------------------------------------------------------------ Buat kiriman issuance

const services = [
  { codEligible: true, deliveryEstimate: "1-2 hari", estimateServiceId: "00000000-0000-4000-8000-0000000002a1", insuranceAmountIdr: 1_500, normalPriceIdr: 7_500, providerService: "JNE", shippingAmountIdr: 8_000, specialPriceIdr: 7_000 },
  { codEligible: false, deliveryEstimate: "2-3 hari", estimateServiceId: "00000000-0000-4000-8000-0000000002a2", insuranceAmountIdr: null, normalPriceIdr: null, providerService: "sicepat", shippingAmountIdr: 9_000, specialPriceIdr: null },
];
const optionsFor = (paymentMethod: "COD" | "COD_ONGKIR" | "NON_COD", role: "TENANT_ADMIN" | "OPERATOR") =>
  issuanceOptionsForRole(buildShipmentEstimateOptions({ codFormulaRetired: false, declaredValueIdr: 150_000, paymentMethod, services }), paymentMethod, role);

function renderChooser(options: ShipmentEstimateOption[], paymentMethod: "COD" | "COD_ONGKIR" | "NON_COD") {
  const props = {
    declaredValueIdr: 150_000,
    fixtureEnabled: true,
    options,
    paymentMethod,
    shipmentId: "00000000-0000-4000-8000-000000000273",
    snapshotId: "00000000-0000-4000-8000-000000000274",
  } as Parameters<typeof IssuanceProvider>[0];
  return renderToStaticMarkup(createElement(IssuanceProvider, props, createElement(IssuanceServiceChooser)));
}

describe("Buat kiriman issuance options by role (T-271, D-37/D-38)", () => {
  it("Tenant Admin: the options are unchanged, fee parts included", () => {
    for (const method of ["COD", "COD_ONGKIR", "NON_COD"] as const) {
      const built = buildShipmentEstimateOptions({ codFormulaRetired: false, declaredValueIdr: 150_000, paymentMethod: method, services });
      expect(optionsFor(method, "TENANT_ADMIN")).toEqual(built);
    }
    expect(optionsFor("COD", "TENANT_ADMIN")[0]!.codBreakdown).toMatchObject({ codFeeIdr: 5_443, shippingAmountIdr: 8_000 });
  });

  it("Operator, COD: only Ditagih ke penerima and its customer split reach the render payload", () => {
    const [jne, sicepat] = optionsFor("COD", "OPERATOR");
    expect(jne).toEqual({
      codBreakdown: null,
      codEligible: true,
      customerCharge: { collectIdr: 163_443, goodsValueIdr: 150_000, ongkirIdr: 13_443 },
      deliveryEstimate: "1-2 hari",
      estimateServiceId: services[0]!.estimateServiceId,
      insuranceAmountIdr: 1_500,
      providerService: "JNE",
      shippingAmountIdr: 13_443,
    });
    // Not COD-eligible: nothing collected, nothing to split.
    expect(sicepat).toMatchObject({ codBreakdown: null, customerCharge: null });
    // The serialized props (what an RSC payload would carry): no quote, deducted shipping or fee.
    const payload = JSON.stringify([jne, sicepat]);
    expect(payload).not.toMatch(/"shippingDeductedIdr"|"codFeeIdr"|"roundingIdr"|:8000\b|:7000\b|:5443\b/);

    expect(issuanceCharges({ declaredValueIdr: 150_000, option: jne!, paymentMethod: "COD" })).toEqual({
      note: "Ditagih kurir ke penerima saat serah terima.",
      rows: [{ amountIdr: 150_000, label: "Nilai barang" }, { amountIdr: 13_443, label: "Ongkir" }],
      total: { amountIdr: 163_443, label: "Ditagih ke penerima" },
    });
    const html = renderChooser([jne!, sicepat!], "COD");
    expect(text(html)).toContain("Rp 13.443");
    expect(text(html)).not.toMatch(/Rp 8\.000|Rp 5\.443/);
    expect(text(html)).not.toMatch(SELLER_WORDS);
  });

  it("Operator, COD Ongkir: the whole charge as Ongkir, no fee parts in the payload or the rail", () => {
    const [jne] = optionsFor("COD_ONGKIR", "OPERATOR");
    const charge = codOngkirAmount(7_000)!;
    expect(jne).toMatchObject({ codBreakdown: null, customerCharge: { collectIdr: charge.chargeIdr, goodsValueIdr: null, ongkirIdr: charge.chargeIdr }, shippingAmountIdr: charge.chargeIdr });
    expect(JSON.stringify(jne)).not.toMatch(/"shippingDeductedIdr"|:7000\b|:8000\b/);
    expect(issuanceCharges({ declaredValueIdr: 150_000, option: jne!, paymentMethod: "COD_ONGKIR" })).toEqual({
      note: "Ongkir saja, barang sudah dibayar.",
      rows: [{ amountIdr: charge.chargeIdr, label: "Ongkir" }],
      total: { amountIdr: charge.chargeIdr, label: "Ditagih ke penerima" },
    });
    // The Tenant Admin's rail keeps the full breakdown.
    const [adminJne] = optionsFor("COD_ONGKIR", "TENANT_ADMIN");
    expect(issuanceCharges({ declaredValueIdr: 150_000, option: adminJne!, paymentMethod: "COD_ONGKIR" })!.rows.map((row) => row.label))
      .toEqual(["Nilai barang (sudah dibayar)", "Ongkir ditagih ke penerima", "Biaya COD (termasuk PPN)", "Pembulatan"]);
  });

  it("Operator, Non-COD: unchanged (nothing is collected, no fee exists)", () => {
    expect(optionsFor("NON_COD", "OPERATOR")).toEqual(optionsFor("NON_COD", "TENANT_ADMIN"));
  });
});
