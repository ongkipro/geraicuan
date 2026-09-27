// T-176 — thermal label: sizes, the sender stub and its exclusions, Code 128.
// Print geometry (page box, cut line, quiet zone, text floor, black-on-white) is
// measured in a real browser by scripts/ui-audit/thermal-label.mjs.
import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { awbBarcodeFits, LabelBarcode } from "@/app/app/label/[shipmentId]/label-barcode";
import { LabelPrintContext, type LabelPrintContextValue } from "@/app/app/label/[shipmentId]/label-print-context";
import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import type { PrintableLabel } from "@/db/label-print-repository";
import { CODE128_PATTERNS, CODE128_QUIET_ZONE_MODULES, encodeCode128B } from "@/lib/code128";
import { formatAddressArea, formatPhoneGroups, formatWibDateTime, recipientDensity } from "@/lib/label-format";
import { geraiSenderIdentity } from "@/lib/shipment-draft-logic";
import {
  DEFAULT_LABEL_SIZE,
  labelSizeStorageKey,
  parseLabelSize,
  readStoredLabelSize,
  THERMAL,
  writeStoredLabelSize,
} from "@/lib/label-size";

const RECIPIENT = { address: "Jl. Kenari Dalam No. 42 RT 003 RW 007", name: "Sulastri Penerima", phone: "081377772222" };
const SENDER = { address: "Ruko Pengirim Blok B7", name: "Toko Pengirim Jaya", phone: "081255553333" };
const AREA = "Kebon Kacang, Tanah Abang, Jakarta Pusat, DKI Jakarta, 10240";

function printableLabel(overrides: Partial<PrintableLabel> = {}): PrintableLabel {
  return {
    awb: "JX1234567890",
    // T-193: goods 425 000 + shipping 17 000, formula version 2: COD 457 226, Mengantar's fee 15 226, no rounding.
    codBreakdown: { codFeeIdr: 15_226, codFeeVatIncludedIdr: 1_509, goodsValueIdr: 425_000, providerCodAmountIdr: 457_226, roundingIdr: 0, shippingAmountIdr: 17_000 },
    courier: "JNE",
    destinationAreaLabel: AREA,
    insuranceAmountIdr: 2_000,
    isCod: true,
    paymentMethod: "COD",
    issuedAt: new Date("2026-09-14T08:24:00.000Z"),
    lastPrintedAt: null,
    outletName: "Outlet Tanah Abang",
    package: { content: "Kain batik tulis", declaredValueIdr: 425_000, heightCm: 12, lengthCm: 25, quantity: 2, weightGrams: 2_125, widthCm: 18 },
    printCount: 0,
    providerCodAmountIdr: 457_226,
    providerService: "JNE REG",
    publicReference: "GC-10024",
    recipient: RECIPIENT,
    sender: SENDER,
    shipmentId: "00000000-0000-4000-8000-000000000176",
    shippingAmountIdr: 17_000,
    ...overrides,
  };
}

function render(label: PrintableLabel, context?: Partial<LabelPrintContextValue>) {
  const sheet = createElement(LabelSheet, { label });
  const tree: ReactElement = context
    ? createElement(LabelPrintContext.Provider, { value: { printedAt: null, size: DEFAULT_LABEL_SIZE, ...context } }, sheet)
    : sheet;
  return renderToStaticMarkup(tree);
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const part = (html: string, label: RegExp) => html.match(new RegExp(`<section aria-label="${label.source}"[^>]*>[\\s\\S]*?</section>`))?.[0] ?? "";
const stubOf = (html: string) => part(html, /Bukti serah terima pengirim 10 × 5 cm/);
const packageOf = (html: string) => part(html, /Label paket 10 × 10 cm/);

describe("label size choice", () => {
  it("defaults to 10 × 15 cm and accepts only the two sizes", () => {
    expect(DEFAULT_LABEL_SIZE).toBe("10x15");
    for (const value of [null, undefined, "", "10X15", "10x20", "100x150", 42]) {
      expect(parseLabelSize(value)).toBe("10x15");
    }
    expect(parseLabelSize("10x10")).toBe("10x10");
    expect(parseLabelSize("10x15")).toBe("10x15");
  });

  it("remembers the choice per operator and falls back to the default when storage is unavailable", () => {
    const store = new Map<string, string>();
    const storage = () => ({ getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) });

    expect(readStoredLabelSize(storage, "operator-a")).toBe("10x15");
    writeStoredLabelSize(storage, "operator-a", "10x10");
    expect(readStoredLabelSize(storage, "operator-a")).toBe("10x10");
    expect(readStoredLabelSize(storage, "operator-b")).toBe("10x15");
    expect(labelSizeStorageKey("operator-a")).not.toBe(labelSizeStorageKey("operator-b"));

    const blocked = () => { throw new DOMException("blocked", "SecurityError"); };
    const throwingItems = () => ({ getItem: () => { throw new Error("quota"); }, setItem: () => { throw new Error("quota"); } });
    expect(readStoredLabelSize(blocked, "operator-a")).toBe("10x15");
    expect(readStoredLabelSize(throwingItems, "operator-a")).toBe("10x15");
    expect(readStoredLabelSize(() => undefined, "operator-a")).toBe("10x15");
    expect(() => writeStoredLabelSize(blocked, "operator-a", "10x10")).not.toThrow();
    expect(() => writeStoredLabelSize(throwingItems, "operator-a", "10x10")).not.toThrow();
  });
});

describe("thermal sheet layouts", () => {
  it("prints 10 × 15 cm by default: the package label, a cut line and the sender stub", () => {
    const html = render(printableLabel());

    expect(html).toMatch(/<article[^>]*class="label-sheet"[^>]*data-label-size="10x15"/);
    expect(packageOf(html)).not.toBe("");
    expect(stubOf(html)).not.toBe("");
    const cut = html.match(/<div aria-hidden="true" class="label-cut">[\s\S]*?<\/span><span class="label-cut-rule"><\/span><\/div>/)?.[0] ?? "";
    expect(cut.match(/class="label-cut-rule"/g)).toHaveLength(2);
    expect(cut).toMatch(/lucide-scissors/);
    expect(text(cut)).toContain("potong di sini");
    // Package label, then the cut, then the stub.
    expect(html.indexOf("label-package")).toBeLessThan(html.indexOf("label-cut"));
    expect(html.indexOf("label-cut")).toBeLessThan(html.indexOf("label-stub"));
  });

  it("prints 10 × 10 cm as the package label alone, with no cut line and no stub", () => {
    const html = render(printableLabel(), { size: "10x10" });

    expect(html).toMatch(/<article[^>]*aria-label="Label paket 10 × 10 cm"[^>]*data-label-size="10x10"/);
    expect(packageOf(html)).not.toBe("");
    expect(html).not.toContain("label-stub");
    expect(html).not.toContain("label-cut");
    expect(text(html)).not.toMatch(/potong di sini|Bukti serah terima|Diserahkan/i);
  });

  it("keeps everything the courier needs on the package label", () => {
    const pkg = text(packageOf(render(printableLabel())));

    // T-243: the courier prints as its black print logo (alt "JNE"), the service beside it.
    expect(packageOf(render(printableLabel()))).toContain('alt="JNE" class="label-courier-logo" src="/couriers/print/jne.svg"');
    for (const expected of [
      // T-255: phones grouped for reading (same digits), the area as its hierarchy lines.
      "REG", "JX1234567890", RECIPIENT.name, "0813-7777-2222", RECIPIENT.address,
      "Kebon Kacang, Kec. Tanah Abang, Jakarta Pusat", "DKI Jakarta 10240",
      SENDER.name, "0812-5555-3333", SENDER.address, "COD — TAGIH KE PENERIMA", "Rp 457.226",
      "Nilai barang", "Rp 425.000", "Ongkir Mengantar", "Rp 17.000", "Biaya COD (termasuk PPN)", "Rp 15.226",
      "Kain batik tulis", "2,125 kg · 2 koli", "25 × 18 × 12 cm", "Asuransi Mengantar", "Rp 2.000",
      "GC-10024", formatWibDateTime(new Date("2026-09-14T08:24:00.000Z")),
    ]) {
      expect(pkg).toContain(expected);
    }
    // T-193: one COD fee — never a separate VAT line that reads as added on top — and a
    // rounding line only when the round-up leaves one.
    expect(pkg).not.toMatch(/PPN biaya COD|Pembulatan/);
    const rounded = text(packageOf(render(printableLabel({
      codBreakdown: { codFeeIdr: 3_789, codFeeVatIncludedIdr: 375, goodsValueIdr: 100_000, providerCodAmountIdr: 113_790, roundingIdr: 1, shippingAmountIdr: 10_000 },
      providerCodAmountIdr: 113_790,
    }))));
    for (const expected of ["Rp 113.790", "Nilai barang Rp 100.000", "Ongkir Mengantar Rp 10.000", "Biaya COD (termasuk PPN) Rp 3.789", "Pembulatan Rp 1 "]) {
      expect(rounded).toContain(expected);
    }
    expect(packageOf(render(printableLabel())).match(/<svg[^>]*class="label-barcode"/g)).toHaveLength(1);
    expect(text(packageOf(render(printableLabel({ codBreakdown: null, isCod: false, paymentMethod: "NON_COD", providerCodAmountIdr: null }))))).toContain("NON-COD — JANGAN TAGIH PENERIMA");
  });

  it("puts on the sender stub exactly what proves and traces the handover", () => {
    const printedAt = "2026-09-17T07:05:00.000Z";
    const stubHtml = stubOf(render(printableLabel(), { printedAt }));
    const stub = text(stubHtml);

    expect(stub).toContain("GC-10024");
    expect(stub).toContain("JX1234567890");
    expect(stubHtml.match(/<svg[^>]*class="label-barcode"/g)).toHaveLength(1);
    expect(stub).toMatch(/JNE\s+REG/);
    expect(stub).toContain("Tanah Abang, Jakarta Pusat");
    expect(stub).toContain("COD Rp 457.226");
    // The recorded print request's time is the handover time, in WIB.
    expect(stub).toContain(`Diserahkan ${formatWibDateTime(printedAt)}`);
    expect(formatWibDateTime(printedAt)).toMatch(/14\.05 WIB$/);
    expect(stub).toContain("Outlet Tanah Abang");
  });

  it("never puts parcel-only or personal data on the stub that leaves with the sender", () => {
    const stub = text(stubOf(render(printableLabel())));

    // Recipient: no street address, no phone, and no name either — the area is enough to trace.
    expect(stub).not.toContain(RECIPIENT.address);
    expect(stub).not.toContain("Kenari");
    expect(stub).not.toContain(RECIPIENT.phone);
    expect(stub).not.toContain(RECIPIENT.name);
    // The full area label narrows to district and city: no subdistrict, province or postal code.
    expect(stub).not.toContain("Kebon Kacang");
    expect(stub).not.toContain("DKI Jakarta");
    expect(stub).not.toContain("10240");
    // Sender contact, package contents and value, and the COD breakdown stay on the parcel.
    expect(stub).not.toContain(SENDER.phone);
    expect(stub).not.toContain(SENDER.address);
    expect(stub).not.toContain("Kain batik tulis");
    expect(stub).not.toMatch(/Nilai barang|Biaya layanan|PPN|Asuransi|Rp 425\.000|Rp 13\.260/);
  });

  it("shows no money on a non-COD stub", () => {
    const stub = text(stubOf(render(printableLabel({ codBreakdown: null, insuranceAmountIdr: null, isCod: false, paymentMethod: "NON_COD", providerCodAmountIdr: null }))));

    expect(stub).toContain("NON-COD");
    expect(stub).not.toContain("Rp");
  });

  it("uses the current minute until a print is recorded, never an unrelated stored time", () => {
    const stub = text(stubOf(render(printableLabel({ lastPrintedAt: new Date("2026-09-01T01:00:00.000Z") }))));

    // Server render: the client clock has not run yet, so it says when the time is set.
    expect(stub).toContain("Diserahkan Saat label dicetak");
    expect(stub).not.toContain(formatWibDateTime(new Date("2026-09-01T01:00:00.000Z")));
    expect(stub).not.toContain(formatWibDateTime(new Date("2026-09-14T08:24:00.000Z")));
  });
});

// T-255 — the owner's cleaner label: recipient first and largest, one rule, one inverted
// block for the amount to collect. Print geometry (one page per label, no clipping, 7 pt
// floor) is measured in a real browser; these pin what prints and in which order.
describe("T-255 label anatomy", () => {
  it("prints a service that only repeats the courier once, and strips a repeated courier prefix", () => {
    const repeated = text(render(printableLabel({ courier: "JT", providerService: "JT" })));
    expect(repeated).not.toMatch(/\bJT JT\b/);
    expect(repeated).toMatch(/\bJT\b/);
    const prefixed = text(render(printableLabel({ courier: "JNE", providerService: "JNE REG" })));
    expect(prefixed).toMatch(/\bJNE REG\b/);
    expect(prefixed).not.toMatch(/\bJNE JNE\b/);
  });

  const recipientOf = (html: string) => html.match(/<div class="label-party label-recipient"[\s\S]*?<\/div>/)?.[0] ?? "";

  it("prints the recipient as name, phone, street, then kecamatan/kota and provinsi with the kode pos last", () => {
    const html = packageOf(render(printableLabel()));
    const recipient = recipientOf(html);
    const order = [
      "Penerima", RECIPIENT.name, "0813-7777-2222", RECIPIENT.address,
      "Kebon Kacang, Kec. Tanah Abang, Jakarta Pusat", "DKI Jakarta", "10240",
    ].map((piece) => recipient.indexOf(piece));
    expect(order.every((index) => index >= 0), String(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The kode pos is bold at the end of the provinsi line, not a separate line.
    expect(recipient).toMatch(/<p class="label-party-area label-party-region"><span>DKI Jakarta<\/span> <b class="label-postal">10240<\/b><\/p>/);
    // The recipient reads before the sender, and the sender before the payment.
    expect(html.indexOf("label-recipient")).toBeLessThan(html.indexOf("label-sender"));
    expect(html.indexOf("label-sender")).toBeLessThan(html.indexOf("label-payment-block"));
  });

  it("composes the area lines from the stored label's hierarchy and never invents a part", () => {
    expect(formatAddressArea(AREA)).toEqual({ lines: ["Kebon Kacang, Kec. Tanah Abang, Jakarta Pusat", "DKI Jakarta"], postalCode: "10240" });
    // No kelurahan: kecamatan, kota / provinsi.
    expect(formatAddressArea("Coblong, Kota Bandung, Jawa Barat, 40135")).toEqual({ lines: ["Kec. Coblong, Kota Bandung", "Jawa Barat"], postalCode: "40135" });
    // Counted from the end: a comma inside the kelurahan stays in the kelurahan.
    expect(formatAddressArea("Kebon Jeruk, Blok A, Kebon Jeruk, Jakarta Barat, DKI Jakarta, 11530").lines)
      .toEqual(["Kebon Jeruk, Blok A, Kec. Kebon Jeruk, Jakarta Barat", "DKI Jakarta"]);
    // Kabupaten keeps its stored name; an already prefixed kecamatan is not prefixed twice.
    expect(formatAddressArea("Caturtunggal, Kecamatan Depok, Kabupaten Sleman, DI Yogyakarta, 55281").lines)
      .toEqual(["Caturtunggal, Kecamatan Depok, Kabupaten Sleman", "DI Yogyakarta"]);
    // Fewer than three parts cannot say which is which: printed as stored, no "Kec.".
    expect(formatAddressArea("Gambir, Jakarta Pusat")).toEqual({ lines: ["Gambir, Jakarta Pusat"], postalCode: null });
    expect(formatAddressArea(" , 10110")).toEqual({ lines: [], postalCode: "10110" });
    const noPostal = recipientOf(packageOf(render(printableLabel({ destinationAreaLabel: "Gambir, Jakarta Pusat" }))));
    expect(noPostal).toContain("Gambir, Jakarta Pusat");
    expect(noPostal).not.toContain("label-postal");
    expect(noPostal).not.toContain("Kec.");
  });

  it("groups phones for reading without changing a digit", () => {
    for (const [raw, grouped] of [
      ["081377772222", "0813-7777-2222"],
      ["08137777222", "0813-7777-222"],
      ["0813777722223", "0813-7777-22223"],
      ["0813 7777-2222", "0813-7777-2222"],
      ["+6281377772222", "+62 813-7777-2222"],
      ["6281377772222", "62 813-7777-2222"],
    ] as const) {
      expect(formatPhoneGroups(raw)).toBe(grouped);
      expect(formatPhoneGroups(raw).replace(/\D/g, "")).toBe(raw.replace(/\D/g, ""));
    }
    // Anything that is not a plain number prints exactly as stored.
    for (const raw of ["0813-7777-2222 (WA)", "ext 12", "1234567"]) expect(formatPhoneGroups(raw)).toBe(raw);
  });

  it("prints the sender as stored after masking: the gerai identity when off, the typed identity when on", () => {
    // Masking off (PR-71): the gerai's name, WhatsApp and pickup street — never Mengantar's pickup name.
    const gerai = geraiSenderIdentity(
      { name: "Gerai Sinar", phone: "081234560001" },
      { pickupAddressLabel: "Gudang Mengantar Pusat, Jl. Pickup 9, Kebon Kacang, Tanah Abang, Jakarta Pusat, DKI Jakarta, 10240" },
    );
    const off = text(packageOf(render(printableLabel({ sender: gerai }))));
    expect(off).toContain("Pengirim Gerai Sinar · 0812-3456-0001 Jl. Pickup 9, Kebon Kacang");
    expect(off).not.toContain("Gudang Mengantar Pusat");
    expect(text(render(printableLabel({ sender: gerai })))).not.toContain("Gudang Mengantar Pusat");
    // Masking on: the operator-typed name, phone and kota print instead, unchanged.
    const masked = { address: "Kota Bandung", name: "Butik Kirana", phone: "081299990002" };
    const on = text(packageOf(render(printableLabel({ sender: masked }))));
    expect(on).toContain("Pengirim Butik Kirana · 0812-9999-0002 Kota Bandung");
    expect(on).not.toContain("Gerai Sinar");
  });

  it("inverts only an amount to collect: COD and COD Ongkir in the black block, non-COD as plain text", () => {
    const payment = (label: PrintableLabel) => packageOf(render(label)).match(/<div class="label-payment"[^>]*>/g) ?? [];
    expect(payment(printableLabel())).toEqual(['<div class="label-payment" data-cod="">']);
    expect(payment(printableLabel({ codBreakdown: null, paymentMethod: "COD_ONGKIR", providerCodAmountIdr: 20_000 }))).toEqual(['<div class="label-payment" data-cod="">']);
    const nonCod = printableLabel({ codBreakdown: null, isCod: false, paymentMethod: "NON_COD", providerCodAmountIdr: null });
    expect(payment(nonCod)).toEqual(['<div class="label-payment">']);
    expect(text(packageOf(render(nonCod)))).toContain("NON-COD — JANGAN TAGIH PENERIMA");
    // The stylesheet fills only [data-cod], and keeps that fill when printing.
    const css = readFileSync("src/app/label.css", "utf8");
    expect(css).toMatch(/\.label-payment\[data-cod\] \{[^}]*background:#000;[^}]*print-color-adjust:exact;/);
    expect(css.match(/background:#000/g)).toHaveLength(1);
  });

  it("keeps a long address on the label: smallest tier, one merged area line, kode pos kept", () => {
    const address = "Jl. Raya Kebon Jeruk Gg. Haji Mawar No. 17B RT 004 RW 011 ".repeat(9).slice(0, 484);
    const label = printableLabel({ recipient: { ...RECIPIENT, address } });
    expect(recipientDensity({ addressLength: 484, areaLabelLength: AREA.length, nameLength: RECIPIENT.name.length })).toMatchObject({ omitAreaLine: true, overCapacity: false, tier: "ultra" });
    for (const size of ["10x15", "10x10"] as const) {
      const recipient = recipientOf(packageOf(render(label, { size })));
      expect(recipient).toContain('data-density="ultra"');
      expect(recipient).toContain(address.trim());
      // Past 480 characters the two area lines share one line instead of dropping it.
      expect(recipient.match(/class="label-party-area/g)).toHaveLength(1);
      expect(recipient).toContain("Kebon Kacang, Kec. Tanah Abang, Jakarta Pusat, DKI Jakarta</span> <b class=\"label-postal\">10240</b>");
    }
    // In the browser the street clamps last (label.css --street-lines) so the area lines print whole.
    expect(readFileSync("src/app/label.css", "utf8")).toContain('.label-recipient[data-density="ultra"] .label-party-address { -webkit-line-clamp:var(--street-lines,7);');
  });

  it("prints the same package label at 10 × 10 cm, only without the stub", () => {
    const wide = packageOf(render(printableLabel()));
    const square = packageOf(render(printableLabel(), { size: "10x10" }));
    expect(square).toBe(wide);
  });

  it("widens the package barcode to the largest whole-dot module that fits 94 mm", () => {
    const symbol = encodeCode128B("JX1234567890")!;
    const width = packageOf(render(printableLabel())).match(/<svg[^>]*class="label-barcode"[^>]*style="height:10mm;width:([\d.]+)mm"/)?.[1];
    expect(Number(width)).toBe(symbol.modules * 0.5);
    expect(symbol.modules * 0.5).toBeLessThanOrEqual(THERMAL.contentWidthMm);
    // A longer AWB steps down to 3 dots, then 2; the encoded bars are the same.
    const spx = encodeCode128B("SPXID048001169536")!;
    const spxWidth = renderToStaticMarkup(createElement(LabelBarcode, { fill: true, heightMm: 10, value: "SPXID048001169536" })).match(/width:([\d.]+)mm/)?.[1];
    expect(Number(spxWidth)).toBe(spx.modules * 0.375);
    expect(renderToStaticMarkup(createElement(LabelBarcode, { fill: true, heightMm: 10, value: "A".repeat(29) }))).toContain(`width:${(20 + 11 * 31 + 13) * 0.25}mm`);
  });
});

describe("Code 128 barcode", () => {
  it("has 107 distinct, well-formed symbol patterns", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((pattern, value) => {
      const widths = [...pattern].map(Number);
      const bars = widths.filter((_, index) => index % 2 === 0).reduce((a, b) => a + b, 0);
      const spaces = widths.filter((_, index) => index % 2 === 1).reduce((a, b) => a + b, 0);
      expect(widths.every((width) => width >= 1 && width <= 4), `symbol ${value}`).toBe(true);
      expect(bars + spaces, `symbol ${value} width`).toBe(value === 106 ? 13 : 11);
      expect(bars % 2, `symbol ${value} bar parity`).toBe(0);
    });
  });

  it("encodes start B, data, modulo-103 check and stop between 10-module quiet zones", () => {
    const symbol = encodeCode128B("JX1234567890");
    if (!symbol) throw new Error("expected an encodable AWB");
    const data = [..."JX1234567890"].map((character) => character.charCodeAt(0) - 32);
    const check = (104 + data.reduce((sum, value, index) => sum + value * (index + 1), 0)) % 103;

    expect(symbol.values).toEqual([104, ...data, check, 106]);
    expect(symbol.modules).toBe(CODE128_QUIET_ZONE_MODULES * 2 + 11 * (data.length + 2) + 13);
    expect(symbol.bars[0][0]).toBe(CODE128_QUIET_ZONE_MODULES);
    const [lastStart, lastWidth] = symbol.bars[symbol.bars.length - 1];
    expect(symbol.modules - (lastStart + lastWidth)).toBe(CODE128_QUIET_ZONE_MODULES);
    expect(encodeCode128B("")).toBeNull();
    expect(encodeCode128B("RESIé")).toBeNull();
  });

  it("draws 2-dot modules with the quiet zone inside the box, and prints text only when it cannot fit 94 mm", () => {
    const html = renderToStaticMarkup(createElement(LabelBarcode, { heightMm: 10, value: "JX1234567890" }));
    const modules = 20 + 11 * 14 + 13;

    expect(html).toContain(`data-modules="${modules}"`);
    expect(html).toContain(`width:${modules * THERMAL.barcodeModuleMm}mm`);
    expect(html).toContain(`viewBox="0 0 ${modules} 1"`);
    expect(html).toMatch(/<rect fill="#000" height="1" width="\d" x="10" y="0"><\/rect>/);
    expect(html).not.toMatch(/fill="(?!#000)/);

    const longest = "A".repeat(29);
    expect(awbBarcodeFits(longest)).toBe(true);
    expect((20 + 11 * 31 + 13) * THERMAL.barcodeModuleMm).toBeLessThanOrEqual(94);
    expect(awbBarcodeFits(`${longest}A`)).toBe(false);
    expect(renderToStaticMarkup(createElement(LabelBarcode, { heightMm: 10, value: `${longest}A` }))).toBe("");
    const tooLong = render(printableLabel({ awb: `${longest}A` }));
    expect(tooLong).not.toContain("label-barcode");
    expect(text(tooLong)).toContain(`${longest}A`);
  });
});
