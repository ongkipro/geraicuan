// T-222 / T-230: invoice sheet markup and the batch print URL contract. No database.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InvoiceSheet, invoiceCollectionLine } from "@/app/app/invoice/invoice-sheet";
import { rollPageHeightMm } from "@/app/app/invoice/print-group";
import { batchPrintHref, parseBatchPrintQuery } from "@/app/app/label/cetak/batch-query";
import type { ShipmentInvoice } from "@/db/shipment-invoice-repository";

function invoice(overrides: Partial<ShipmentInvoice> = {}): ShipmentInvoice {
  return {
    collectionMode: "NON_COD",
    courierCollectionIdr: null,
    declaredValueIdr: 150_000,
    document: {
      courierService: "JNE REG",
      deliveryEstimate: "1-2 hari",
      gerai: { address: "Jl. Kenanga 5, Menteng, Jakarta Pusat", name: "Gerai Nota A", whatsapp: "081234567890" },
      items: [{ name: "Kain batik", quantity: 2 }, { name: "Daster", quantity: 1 }],
      recipient: { city: "Menteng, Jakarta Pusat", name: "Penerima Sintetis" },
      resi: "JNE-T222-000001",
      sender: { city: "Jl. Kenanga 5, Menteng, Jakarta Pusat", name: "Gerai Sintetis", phone: "081211110000" },
      weightGrams: 1_250,
    },
    id: "00000000-0000-4000-8000-000000000222",
    insuranceIdr: 1_500,
    invoiceNumber: "INV-GC-10222",
    issuedAt: new Date("2026-09-26T03:13:00.000Z"),
    issuedByUserId: "user-1",
    shipmentId: "00000000-0000-4000-8000-000000000223",
    shippingChargeIdr: 8_000,
    templateVersion: 1,
    totalIdr: 9_500,
    ...overrides,
  };
}

const render = (value: ShipmentInvoice, medium: "80mm" | "a4" = "80mm") =>
  renderToStaticMarkup(createElement(InvoiceSheet, { invoice: value, medium }));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("InvoiceSheet", () => {
  it("renders the stored snapshot and money columns", () => {
    const html = render(invoice());
    const body = text(html);

    expect(html).toMatch(/<article aria-label="Invoice INV-GC-10222" class="invoice-sheet" data-medium="80mm">/);
    for (const value of [
      "Gerai Nota A", "WhatsApp 081234567890", "Jl. Kenanga 5, Menteng, Jakarta Pusat", "INVOICE", "INV-GC-10222",
      "26 Sep 2026, 10.13 WIB", "JNE-T222-000001", "JNE REG", "1-2 hari", "Gerai Sintetis · 081211110000",
      "Penerima Sintetis · Menteng, Jakarta Pusat", "Kain batik", "2×", "Daster", "1,25 kg",
      "Nota ini bukan bukti pembayaran.",
    ]) expect(body).toContain(value);
    expect(body).toMatch(/Ongkir Rp\s8\.000/);
    expect(body).toMatch(/Asuransi Rp\s1\.500/);
    expect(body).toMatch(/Total ongkir Rp\s9\.500/);
    expect(body).toMatch(/Nilai barang \(informasi\): Rp\s150\.000/);
    // Resi mono, total its own emphasised row.
    expect(html).toContain('<p class="invoice-resi">JNE-T222-000001</p>');
    expect(html).toMatch(/class="invoice-row invoice-total"/);
    expect(render(invoice(), "a4")).toContain('data-medium="a4"');
  });

  it("never renders payment status, method, QR, bank or tax words", () => {
    for (const mode of [invoice(), invoice({ collectionMode: "COD", courierCollectionIdr: 111_721 }), invoice({ collectionMode: "COD_SHIPPING_ONLY", courierCollectionIdr: 8_277 })]) {
      expect(text(render(mode))).not.toMatch(/lunas|belum dibayar|sudah dibayar|\bpaid\b|unpaid|\bQR\b|QRIS|rekening|\bbank\b|transfer|PPN|pajak|\btax\b|refund|metode pembayaran/i);
    }
  });

  it("hides zero insurance and caps the item lines at five", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({ name: `Produk ${index + 1}`, quantity: 1 }));
    const body = text(render(invoice({ document: { ...invoice().document, items }, insuranceIdr: 0, totalIdr: 8_000 })));
    expect(body).not.toContain("Asuransi");
    expect(body).toContain("Produk 5");
    expect(body).not.toContain("Produk 6");
    expect(body).toContain("+3 lainnya");
  });
});

describe("invoice money lines (PR-78)", () => {
  it("shows no courier collection for NON_COD", () => {
    const body = text(render(invoice()));
    expect(invoiceCollectionLine(invoice())).toBe("Non-COD — dibayar di gerai");
    expect(body).not.toMatch(/ditagih kurir/);
  });

  it("shows the COD amount on its own line, apart from Total ongkir", () => {
    const cod = invoice({ collectionMode: "COD", courierCollectionIdr: 111_721, insuranceIdr: 0, totalIdr: 8_000 });
    const body = text(render(cod));
    expect(body).toMatch(/Total ongkir Rp\s8\.000/);
    expect(body).toMatch(/Pembayaran: COD — ditagih kurir ke penerima: Rp\s111\.721/);
    expect(body).not.toMatch(/Total ongkir Rp\s111\.721/);

    const shippingOnly = invoice({ collectionMode: "COD_SHIPPING_ONLY", courierCollectionIdr: 8_277 });
    expect(invoiceCollectionLine(shippingOnly)).toMatch(/^COD ongkir — ditagih kurir: Rp\s8\.277$/);
  });
});

describe("batch print URL (PR-87)", () => {
  it("parses numbers, size and content, dropping invalid and duplicate numbers", () => {
    expect(parseBatchPrintQuery({ isi: "keduanya", n: "10175, 10176,10175,abc,01234,99999999999,GC-10177", ukuran: "10x10" })).toEqual({
      content: "keduanya",
      invalid: ["abc", "01234", "99999999999", "GC-10177"],
      numbers: [10175, 10176],
      size: "10x10",
    });
  });

  it("falls back to labels at 10 × 15 cm and caps the batch", () => {
    const many = Array.from({ length: 60 }, (_, index) => 10_000 + index).join(",");
    const query = parseBatchPrintQuery({ isi: "semua", n: [many, "10999"], ukuran: "8x6" });
    expect(query.content).toBe("label");
    expect(query.size).toBe("10x15");
    expect(query.numbers).toHaveLength(50);
    expect(parseBatchPrintQuery({}).numbers).toEqual([]);
  });

  it("builds a URL that parses back to the same batch", () => {
    const href = batchPrintHref({ content: "invoice", numbers: [10175, 10176], size: "10x10" });
    expect(href).toBe("/app/label/cetak?n=10175,10176&ukuran=10x10&isi=invoice");
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseBatchPrintQuery(params)).toMatchObject({ content: "invoice", numbers: [10175, 10176], size: "10x10" });
  });
});

describe("80 mm roll page", () => {
  it("sizes the page to the sheet height in whole millimetres plus a margin", () => {
    expect(rollPageHeightMm(96)).toBe(28); // 25.4 mm → 26 + 2
    expect(rollPageHeightMm(0)).toBe(2);
  });
});
