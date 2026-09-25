import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The issuance panel is rendered with one service chosen (the same stub the
// required-checkbox test uses): `useState("")` is the selected service id.
const state = vi.hoisted(() => ({ selected: "" }));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useActionState: (_action: unknown, initial: unknown) => [initial, () => {}, false],
    useState: (initial: unknown) => [initial === "" ? state.selected : typeof initial === "function" ? (initial as () => unknown)() : initial, () => {}],
  };
});
vi.mock("@/app/app/actions", () => ({
  saveShipmentDraft: vi.fn(),
  searchRecipientShipmentContacts: vi.fn(),
  searchSenderShipmentContacts: vi.fn(),
  selectShipmentContact: vi.fn(),
  verifyShipmentDraftDestinationArea: vi.fn(),
}));
vi.mock("@/app/app/pengiriman/[shipmentId]/actions", () => ({ confirmShipmentIssuance: vi.fn() }));
vi.mock("@/app/app/location-actions", () => ({ searchMengantarDestinationAreas: vi.fn() }));

import { issuanceGate, ShipmentIssuancePanel, type ShipmentEstimateOption } from "@/app/app/pengiriman/[shipmentId]/issuance-panel";
import { composeProductRows, parseProductRows } from "@/app/app/shipment-draft-experience";
import { ShipmentDraftForm } from "@/app/app/shipment-draft-form";
import { validateShipmentDraft } from "@/lib/shipment-draft";

describe("T-205 product rows compose into the stored content and quantity", () => {
  it("lists each named product with its quantity and sums the total", () => {
    expect(composeProductRows([
      { name: "Kain batik", quantity: "2" },
      { name: " Daster ", quantity: "1" },
    ])).toEqual({ packageContent: "Kain batik (2), Daster", packageQuantity: "3" });
  });

  it("leaves unused blank rows out of both fields", () => {
    expect(composeProductRows([
      { name: "Kain batik", quantity: "2" },
      { name: "  ", quantity: "5" },
    ])).toEqual({ packageContent: "Kain batik (2)", packageQuantity: "2" });
    // Nothing named yet: content is empty (the server asks for it) and the typed
    // quantity still counts, so no spurious quantity error joins it.
    expect(composeProductRows([{ name: "", quantity: "1" }])).toEqual({ packageContent: "", packageQuantity: "1" });
  });

  it("sends an empty total for an unreadable quantity, so the server's message answers it", () => {
    expect(composeProductRows([
      { name: "Kain batik", quantity: "2" },
      { name: "Daster", quantity: "" },
    ]).packageQuantity).toBe("");
    expect(composeProductRows([{ name: "Kain batik", quantity: "0" }]).packageQuantity).toBe("0");
  });

  it("round-trips a refused form back into its rows, and never splits text it cannot rebuild", () => {
    expect(parseProductRows("Kain batik (2), Daster", "3")).toEqual([
      { name: "Kain batik", quantity: "2" },
      { name: "Daster", quantity: "1" },
    ]);
    // A pre-T-205 free-text content, a name containing ", ", or a total that does not
    // match stays one row with every character kept.
    expect(parseProductRows("Baju, celana", "2")).toEqual([{ name: "Baju, celana", quantity: "2" }]);
    expect(parseProductRows("Kain batik (2), Daster", "4")).toEqual([{ name: "Kain batik (2), Daster", quantity: "4" }]);
    expect(parseProductRows(undefined, undefined)).toEqual([{ name: "", quantity: "1" }]);
  });

  it("produces values the unchanged server validation accepts", () => {
    const composed = composeProductRows([
      { name: "Kain batik", quantity: "2" },
      { name: "Daster", quantity: "1" },
    ]);
    const formData = new FormData();
    for (const [name, value] of Object.entries({
      declaredValue: "150000",
      destinationAreaId: "AREA-1",
      destinationAreaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
      destinationMode: "manual",
      outletId: "00000000-0000-4000-8000-000000000205",
      packageWeightGrams: "1200",
      paymentType: "NON_COD",
      recipientAddress: "Jalan Contoh 2",
      recipientName: "Budi Santoso",
      recipientPhone: "081234567891",
      senderAddress: "Jalan Contoh 1",
      senderName: "Gerai Bandung",
      senderPhone: "081234567890",
      ...composed,
    })) formData.set(name, value);
    const validated = validateShipmentDraft(formData);
    expect(validated.ok ? validated.input : validated.errors).toMatchObject({
      packageContent: "Kain batik (2), Daster",
      packageQuantity: 3,
    });
  });
});

describe("T-205 draft form", () => {
  beforeEach(() => { state.selected = ""; });
  const outlets = [{
    id: "00000000-0000-4000-8000-000000000205",
    name: "Outlet Bandung",
    pickupPoints: [{ isDefault: true, originAreaLabel: "Coblong, Kota Bandung", pickupAddressId: "P-1", pickupAddressLabel: "Gudang Dago, Jl. Ir. H. Juanda No. 12, Dago, Coblong, Kota Bandung, Jawa Barat, 40135" }],
  }];

  it("renders product rows with a labelled quantity stepper and submits the composed fields", () => {
    const markup = renderToStaticMarkup(createElement(ShipmentDraftForm, {
      autoFocusFirstField: false,
      outlets,
      submissionId: "00000000-0000-4000-8000-000000000206",
    }));

    // The first row keeps the ids the error summary links to (#packageContent, #packageQuantity).
    expect(markup).toMatch(/<input[^>]*id="packageContent"/);
    expect(markup).toMatch(/<input[^>]*id="packageQuantity"/);
    expect(markup).not.toMatch(/<input[^>]*id="packageContent"[^>]*name=/);
    expect(markup).toMatch(/<input type="hidden" name="packageContent" value=""\/>/);
    expect(markup).toMatch(/<input type="hidden" name="packageQuantity" value="1"\/>/);
    // At 1 the minus step is disabled; both steps are buttons that never submit.
    const minus = markup.match(/<button[^>]*aria-label="Kurangi jumlah produk 1"[^>]*>/)?.[0] ?? "";
    const plus = markup.match(/<button[^>]*aria-label="Tambah jumlah produk 1"[^>]*>/)?.[0] ?? "";
    expect(minus).toContain('disabled=""');
    expect(plus).not.toContain('disabled=""');
    for (const step of [minus, plus]) {
      expect(step).toContain('type="button"');
      expect(step).toContain('aria-controls="packageQuantity"');
    }
    expect(markup).toContain("Tambah produk");
    // One row: nothing to remove.
    expect(markup).not.toContain('aria-label="Hapus');
  });

  it("offers the gerai as the label sender and fills it from the gerai and its pickup point", () => {
    const markup = renderToStaticMarkup(createElement(ShipmentDraftForm, {
      autoFocusFirstField: false,
      outlets,
      senderIdentity: { name: "Gerai Bandung", phone: "081234567890" },
      submissionId: "00000000-0000-4000-8000-000000000207",
    }));

    expect(markup).toMatch(/<input[^>]*checked=""[^>]*value="gerai"|<input[^>]*value="gerai"[^>]*checked=""/);
    expect(markup).toMatch(/<input[^>]*id="senderName"[^>]*value="Gerai Bandung"|<input[^>]*value="Gerai Bandung"[^>]*id="senderName"/);
    // Review must-fix: the address only — no Mengantar pickup name, no repeated area.
    expect(markup).toContain(">Jl. Ir. H. Juanda No. 12, Dago, Coblong, Kota Bandung, Jawa Barat, 40135</textarea>");
    expect(markup).not.toMatch(/<textarea[^>]*>Gudang Dago,/);
    // The rail follows the form: origin from the pickup point, sender from the fields.
    expect(markup).toContain("Coblong, Kota Bandung");
    expect(markup).toMatch(/Pengirim di label<\/dt><dd[^>]*>Gerai Bandung<\/dd>/);
    // Not built: pickup vs drop-off, the pickup slot and vehicle type are not rendered.
    expect(markup).not.toMatch(/Penjemputan Terjadwal|Drop sendiri|Waktu Penjemputan|Kendaraan/i);
  });
});

const OPTIONS: ShipmentEstimateOption[] = [
  {
    codBreakdown: { codFeeIdr: 3_789, codFeeVatIncludedIdr: 375, goodsValueIdr: 100_000, providerCodAmountIdr: 113_790, roundingIdr: 1, shippingAmountIdr: 10_000 },
    codEligible: true,
    deliveryEstimate: "1-2 Day",
    estimateServiceId: "svc-jne",
    insuranceAmountIdr: null,
    providerService: "JNE REG",
    shippingAmountIdr: 10_000,
  },
  {
    codBreakdown: null,
    codEligible: false,
    deliveryEstimate: "2-3 Day",
    estimateServiceId: "svc-sap",
    insuranceAmountIdr: null,
    providerService: "SAPLite",
    shippingAmountIdr: 8_000,
  },
];

function renderRail() {
  return renderToStaticMarkup(createElement(ShipmentIssuancePanel, {
    fixtureEnabled: true,
    isCod: true,
    options: OPTIONS,
    paymentMethod: "COD",
    shipmentId: "shipment",
    snapshotId: "snapshot",
    summary: {
      declaredValueIdr: 100_000,
      destination: "Dago, Coblong, Kota Bandung",
      draftHref: "/app/pengiriman/GC-10001",
      origin: "Outlet Bandung · Coblong",
      packageLabel: "1.000 g · 3 barang",
      sender: "Gerai Bandung",
    },
  }));
}

function submitButtons(markup: string) {
  return markup.match(/<button[^>]*type="submit"[^>]*>Konfirmasi &amp; terbitkan resi<\/button>/g) ?? [];
}

describe("T-205 physical-check gate on issuing", () => {
  beforeEach(() => { state.selected = ""; });

  it("opens only when a service is chosen and the physical check is ticked", () => {
    const base = { codFormulaRetired: false, codOngkirBlocked: false, consented: false, fixtureEnabled: true, pending: false, physicalCheck: true, selected: true };
    expect(issuanceGate(base)).toEqual({ confirmDisabled: false, message: "Centang “Paket sudah dicek fisik” terlebih dahulu.", submitDisabled: true });
    expect(issuanceGate({ ...base, consented: true })).toEqual({ confirmDisabled: false, message: null, submitDisabled: false });
    // The tick never overrides an existing refusal.
    expect(issuanceGate({ ...base, consented: true, fixtureEnabled: false }).submitDisabled).toBe(true);
    expect(issuanceGate({ ...base, consented: true, codOngkirBlocked: true }).submitDisabled).toBe(true);
    expect(issuanceGate({ ...base, consented: true, selected: false }).submitDisabled).toBe(true);
    expect(issuanceGate({ ...base, consented: true, pending: true }).submitDisabled).toBe(true);
    expect(issuanceGate({ ...base, codFormulaRetired: true }).message).toBeNull();
  });

  it("renders the check on the rail, tied to the issuance form, with both primaries disabled until ticked", () => {
    state.selected = "svc-jne";
    const markup = renderRail();

    const checkbox = markup.match(/<input\b[^>]*name="confirmation"[^>]*>/)?.[0] ?? "";
    expect(checkbox).toContain('form="shipment-issuance-form"');
    expect(checkbox).toContain('required=""');
    expect(checkbox).not.toContain("checked");
    expect(markup).toMatch(/<label[^>]*for="issuance-confirmation"[^>]*>Paket sudah dicek fisik<\/label>/);
    expect(markup).toContain("Berat dan jumlah sesuai (1.000 g · 3 barang)");

    // One primary per width: the rail's (from the split) and the bottom bar's (below it).
    const buttons = submitButtons(markup);
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toContain('form="shipment-issuance-form"');
      expect(button).toContain('disabled=""');
    }
    expect(buttons.filter((button) => /\bhidden\b[^"]*@4xl\/page:inline-flex/.test(button))).toHaveLength(1);
    expect(markup).toContain("Centang “Paket sudah dicek fisik” terlebih dahulu.");
    expect(markup).toContain('href="/app/pengiriman/GC-10001"');
  });

  it("shows the chosen service's breakdown and highlighted total on the rail", () => {
    state.selected = "svc-jne";
    const markup = renderRail();
    const text = markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

    expect(text).toContain("Layanan JNE Reg · 1–2 hari");
    expect(text).toContain("Biaya COD Mengantar 3,33% (termasuk PPN Rp 375) Rp 3.789");
    expect(markup).toMatch(/<div class="[^"]*bg-accent[^"]*text-accent-foreground[^"]*" data-summary-total="true">/);
    expect(text).toContain("Total ditagih ke pelanggan Rp 113.790");
  });

  it("chooses a service from courier filters and radio cards, not a wide table", () => {
    const markup = renderRail();

    expect(markup).not.toContain("<table");
    expect(markup).toMatch(/aria-pressed="true"/);
    expect(markup).toMatch(/aria-pressed="false"/);
    expect(markup).toContain('src="/couriers/jne.svg"');
    expect(markup).toContain('src="/couriers/sap.svg"');
    // Every service stays in the form under one radio name; only the other courier's group is hidden.
    expect(markup.match(/role="radiogroup"/g)).toHaveLength(2);
    expect(markup.match(/<input[^>]*name="estimateServiceId"/g)).toHaveLength(2);
    expect(markup).toMatch(/<div aria-label="Layanan SAP"[^>]*hidden=""|<div[^>]*hidden=""[^>]*aria-label="Layanan SAP"/);
    // A service that cannot carry COD is shown and cannot be chosen.
    expect(markup).toMatch(/<input[^>]*disabled=""[^>]*value="svc-sap"|<input[^>]*value="svc-sap"[^>]*disabled=""/);
    expect(markup).toContain("COD tidak didukung");
    // Nothing chosen yet: the rail asks for a service before any total.
    expect(markup).toContain("Pilih layanan untuk melihat rincian biaya dan total.");
  });
});

describe("T-205 review: Alamat gerai sender address", () => {
  it("drops the leading pickup name, never repeats the area and respects the 500-character limit", async () => {
    const { geraiAddress } = await import("@/app/app/shipment-draft-form");
    expect(geraiAddress({ pickupAddressLabel: "Gudang Dago, Jl. Juanda 12, Dago, Coblong, Kota Bandung, Jawa Barat, 40135" }))
      .toBe("Jl. Juanda 12, Dago, Coblong, Kota Bandung, Jawa Barat, 40135");
    expect(geraiAddress({ pickupAddressLabel: "Alamat tunggal" })).toBe("Alamat tunggal");
    expect(geraiAddress(null)).toBe("");
    expect(geraiAddress({ pickupAddressLabel: `Nama, ${"x".repeat(700)}` })).toHaveLength(500);
  });
});

describe("T-205 review: the detail page explains a disabled issue button", () => {
  it("renders the physical check and a reason line tied to the disabled submit", () => {
    state.selected = "";
    const markup = renderToStaticMarkup(createElement(ShipmentIssuancePanel, {
      fixtureEnabled: true,
      isCod: true,
      options: OPTIONS,
      paymentMethod: "COD",
      shipmentId: "shipment",
      snapshotId: "snapshot",
    }));
    expect(markup).toContain(">Paket sudah dicek fisik</label>");
    const button = markup.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";
    expect(button).toMatch(/disabled=""/);
    expect(button).toContain('aria-describedby="issuance-gate-detail"');
    expect(markup).toMatch(/<p[^>]*id="issuance-gate-detail"[^>]*>[^<]+<\/p>/);
  });
});
