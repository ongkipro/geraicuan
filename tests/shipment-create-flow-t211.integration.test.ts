import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { validateShipmentDraft } from "@/lib/shipment-draft";
import {
  availablePickupSlots,
  checkPickupSchedule,
  composeProductRows,
  composeProductWeightGrams,
  geraiSenderIdentity,
  issuanceCharges,
  issuanceGate,
  jakartaDateKey,
  kilogramsToGrams,
  pickupDateOptions,
  pickupSlotLabel,
} from "@/lib/shipment-draft-logic";

/**
 * T-211 (Buat kiriman, PR-68–PR-72): pure rules and key markup. No database, no provider call.
 */

// The form's Server Actions are stubs here: its markup is rendered, nothing is saved (T-249).
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/pengiriman/baru",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/app/actions", () => ({
  saveShipmentDraft: async () => ({}),
  searchRecipientShipmentContacts: async () => ({}),
  searchSenderShipmentContacts: async () => ({}),
  selectShipmentContact: async () => ({}),
}));
vi.mock("@/app/app/location-actions", () => ({ searchMengantarDestinationAreas: async () => ({}) }));

// 26 Sep 2026, 10.00 WIB (03.00 UTC).
const TEN_AM_WIB = new Date("2026-09-26T03:00:00.000Z");

describe("PR-72 product weight in kg becomes grams exactly", () => {
  it("converts decimal kilograms without float error", () => {
    expect(kilogramsToGrams("2")).toBe("2000");
    expect(kilogramsToGrams("0,25")).toBe("250");
    expect(kilogramsToGrams("1.5")).toBe("1500");
    expect(kilogramsToGrams("0.001")).toBe("1");
    expect(kilogramsToGrams("0.1")).toBe("100");
    expect(kilogramsToGrams("1,005")).toBe("1005");
  });

  it("refuses what it cannot read exactly, so the server's weight message answers it", () => {
    for (const value of ["", "0", "0,0", "1.2345", "abc", "-1", "1,2,3"]) expect(kilogramsToGrams(value)).toBe("");
  });

  it("sums each named row's weight and keeps content and quantity composition unchanged", () => {
    const rows = [
      { name: "Kemeja batik", quantity: "2", weightKg: "0,7" },
      { name: "Daster", quantity: "1", weightKg: "0.35" },
      { name: " ", quantity: "5", weightKg: "" },
    ];
    expect(composeProductWeightGrams(rows)).toBe("1050");
    expect(composeProductRows(rows)).toEqual({ packageContent: "Kemeja batik (2), Daster", packageQuantity: "3" });
    expect(composeProductWeightGrams([{ name: "A", quantity: "1", weightKg: "" }])).toBe("");
  });
});

describe("PR-70 pickup schedule: 09.00–18.00 WIB (D-27, T-237), ≥ 90 minutes ahead today", () => {
  it("keeps same-day slots starting at least 90 minutes from now (WIB)", () => {
    expect(jakartaDateKey(TEN_AM_WIB)).toBe("2026-09-26");
    // 10.00 now → 11.00 is only 60 minutes ahead; 12.00 is the first bookable slot.
    expect(availablePickupSlots("2026-09-26", TEN_AM_WIB)[0]).toBe("12:00");
    expect(availablePickupSlots("2026-09-27", TEN_AM_WIB)).toEqual(
      ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"],
    );
    expect(availablePickupSlots("2026-09-25", TEN_AM_WIB)).toEqual([]);
    expect(pickupSlotLabel("09:00")).toBe("09.00–10.00 WIB");
    expect(pickupSlotLabel("17:00")).toBe("17.00–18.00 WIB");
    // A legacy D-25 draft's 08:00 start still reads correctly.
    expect(pickupSlotLabel("08:00")).toBe("08.00–09.00 WIB");
  });

  it("drops today once its last slot has passed and offers a 7-day window", () => {
    const evening = new Date("2026-09-26T10:00:00.000Z"); // 17.00 WIB
    const options = pickupDateOptions(evening);
    expect(options[0].value).toBe("2026-09-27");
    expect(pickupDateOptions(TEN_AM_WIB)).toHaveLength(7);
    // The last slot starts 17.00: today stays until 15.30 WIB and drops a minute later.
    expect(pickupDateOptions(new Date("2026-09-26T08:30:00.000Z"))[0].value).toBe("2026-09-26");
    expect(availablePickupSlots("2026-09-26", new Date("2026-09-26T08:30:00.000Z"))).toEqual(["17:00"]);
    expect(pickupDateOptions(new Date("2026-09-26T08:31:00.000Z"))[0].value).toBe("2026-09-27");
  });

  it("checks a date inside the window and a still-bookable slot", () => {
    expect(checkPickupSchedule("2026-09-26", "12:00", TEN_AM_WIB)).toBeNull();
    expect(checkPickupSchedule("2026-09-26", "11:00", TEN_AM_WIB)).toBe("slot");
    expect(checkPickupSchedule("2026-09-26", "18:00", TEN_AM_WIB)).toBe("slot");
    expect(checkPickupSchedule("2026-09-27", "09:00", TEN_AM_WIB)).toBeNull();
    expect(checkPickupSchedule("2026-09-27", "17:00", TEN_AM_WIB)).toBeNull();
    expect(checkPickupSchedule("2026-09-27", "07:00", TEN_AM_WIB)).toBe("slot");
    // D-27: 08:00 (D-25) can no longer be picked; saved 08:00 drafts stay valid in the DB.
    expect(checkPickupSchedule("2026-09-27", "08:00", TEN_AM_WIB)).toBe("slot");
    expect(checkPickupSchedule("2026-10-03", "09:00", TEN_AM_WIB)).toBe("date");
    expect(checkPickupSchedule("2026-09-25", "09:00", TEN_AM_WIB)).toBe("date");
    expect(checkPickupSchedule("bukan-tanggal", "09:00", TEN_AM_WIB)).toBe("date");
    // Review 2026-09-26: an impossible date must not roll over into the window.
    expect(checkPickupSchedule("2026-09-31", "09:00", TEN_AM_WIB)).toBe("date");
    expect(checkPickupSchedule("2026-02-30", "09:00", new Date("2026-02-27T03:00:00.000Z"))).toBe("date");
  });
});

function draftForm(extra: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries({
    declaredValue: "150000",
    destinationAreaId: "AREA-1",
    destinationAreaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
    outletId: "00000000-0000-4000-8000-000000000211",
    packageContent: "Kemeja batik (2)",
    packageQuantity: "2",
    packageWeightGrams: "700",
    paymentType: "NON_COD",
    recipientAddress: "Jalan Contoh 2",
    recipientName: "Budi Santoso",
    recipientPhone: "081234567891",
    senderAddress: "Jalan Gerai 1",
    senderName: "Gerai 88",
    senderPhone: "081234567890",
    ...extra,
  })) formData.set(name, value);
  return formData;
}

describe("PR-70 server validation of the handover", () => {
  it("stores a pickup with its date and slot", () => {
    const result = validateShipmentDraft(draftForm({ handoverType: "PICKUP", pickupDate: "2026-09-27", pickupSlot: "17:00" }), TEN_AM_WIB);
    expect(result.ok && result.input).toMatchObject({ handoverType: "PICKUP", pickupDate: "2026-09-27", pickupSlot: "17:00" });
    const early = validateShipmentDraft(draftForm({ handoverType: "PICKUP", pickupDate: "2026-09-27", pickupSlot: "08:00" }), TEN_AM_WIB);
    expect(early.ok ? null : early.errors.pickupSlot).toMatch(/09\.00–18\.00 WIB/);
  });

  it("refuses a slot under 90 minutes away and an unknown type", () => {
    const soon = validateShipmentDraft(draftForm({ handoverType: "PICKUP", pickupDate: "2026-09-26", pickupSlot: "11:00" }), TEN_AM_WIB);
    expect(soon.ok ? null : soon.errors.pickupSlot).toMatch(/90 menit/);
    const unknown = validateShipmentDraft(draftForm({ handoverType: "KURIR" }), TEN_AM_WIB);
    expect(unknown.ok ? null : unknown.errors.handoverType).toBeTruthy();
  });

  it("drops date and slot for Drop di outlet, and records nothing when a caller sends no handover", () => {
    const drop = validateShipmentDraft(draftForm({ handoverType: "DROP_OFF", pickupDate: "2026-09-27", pickupSlot: "09:00" }), TEN_AM_WIB);
    expect(drop.ok && drop.input).toMatchObject({ handoverType: "DROP_OFF", pickupDate: null, pickupSlot: null });
    const legacy = validateShipmentDraft(draftForm({}), TEN_AM_WIB);
    expect(legacy.ok && legacy.input).toMatchObject({ handoverType: null, pickupDate: null, pickupSlot: null });
  });

  it("maps the COD card with 'COD Ongkir' ticked to the COD_ONGKIR method", () => {
    const result = validateShipmentDraft(draftForm({ paymentType: "COD_ONGKIR" }), TEN_AM_WIB);
    expect(result.ok && result.input).toMatchObject({ isCod: true, paymentMethod: "COD_ONGKIR" });
  });
});

describe("PR-71 sender while masking is off", () => {
  it("prints the gerai's name, WhatsApp and pickup address, never Mengantar's pickup name", () => {
    expect(geraiSenderIdentity(
      { name: "Sekar Batik", phone: "081290000100" },
      { pickupAddressLabel: "Gudang Mengantar, Jl. Panjang No. 18, Kebon Jeruk, Jakarta Barat" },
    )).toEqual({ address: "Jl. Panjang No. 18, Kebon Jeruk, Jakarta Barat", name: "Sekar Batik", phone: "081290000100" });
  });
});

describe("issuance gate (moved from the old issuance panel)", () => {
  const base = { codFormulaRetired: false, codOngkirBlocked: false, consented: false, fixtureEnabled: true, pending: false, physicalCheck: true, selected: false };
  it("says the one unmet guard, in order", () => {
    expect(issuanceGate(base)).toMatchObject({ message: "Pilih layanan terlebih dahulu.", submitDisabled: true });
    expect(issuanceGate({ ...base, selected: true }).message).toMatch(/Paket sudah dicek fisik/);
    expect(issuanceGate({ ...base, codOngkirBlocked: true, selected: true }).message).toMatch(/Nilai COD Ongkir/);
    expect(issuanceGate({ ...base, fixtureEnabled: false, selected: true }).message).toBe("Penerbitan dikunci untuk data ini.");
    expect(issuanceGate({ ...base, consented: true, selected: true })).toEqual({ confirmDisabled: false, message: null, submitDisabled: false });
    expect(issuanceGate({ ...base, codFormulaRetired: true, consented: true, selected: true })).toMatchObject({ message: null, submitDisabled: true });
  });
});

describe("rail charges", () => {
  const option = {
    codBreakdown: { codFeeIdr: 6_976, goodsValueIdr: 170_000, providerCodAmountIdr: 209_476, roundingIdr: 0, shippingAmountIdr: 32_500 },
    insuranceAmountIdr: null,
    shippingAmountIdr: 32_500,
    shippingDeductedIdr: 30_000,
  };
  it("adds COD lines up to the total the courier collects", () => {
    const charges = issuanceCharges({ declaredValueIdr: 170_000, option, paymentMethod: "COD" })!;
    expect(charges.rows.reduce((sum, row) => sum + (row.amountIdr ?? 0), 0)).toBe(charges.total.amountIdr);
    expect(charges.total).toEqual({ amountIdr: 209_476, label: "Total tagihan COD" });
  });
  it("shows the computed COD Ongkir amount (D-28) and the Non-COD ongkir as their totals", () => {
    expect(issuanceCharges({ declaredValueIdr: 170_000, option, paymentMethod: "COD_ONGKIR" })!.total.amountIdr).toBe(31_034);
    expect(issuanceCharges({ declaredValueIdr: 170_000, option, paymentMethod: "NON_COD" })!.total.amountIdr).toBe(32_500);
    expect(issuanceCharges({ declaredValueIdr: 1, option: null, paymentMethod: "NON_COD" })).toBeNull();
  });
});

describe("PR-90 pickup vehicle (T-232, D-19)", () => {
  const pickup = { handoverType: "PICKUP", pickupDate: "2026-09-27", pickupSlot: "09:00" };

  it("stores an optional Motor/Mobil/Truk for a pickup and NULL when none is chosen", () => {
    for (const vehicle of ["MOTOR", "MOBIL", "TRUK"]) {
      const result = validateShipmentDraft(draftForm({ ...pickup, pickupVehicle: vehicle }), TEN_AM_WIB);
      expect(result.ok && result.input.pickupVehicle, vehicle).toBe(vehicle);
    }
    const none = validateShipmentDraft(draftForm({ ...pickup, pickupVehicle: "" }), TEN_AM_WIB);
    expect(none.ok && none.input).toMatchObject({ handoverType: "PICKUP", pickupVehicle: null });
  });

  it("refuses an unknown vehicle and ignores one sent with Drop di outlet", () => {
    const unknown = validateShipmentDraft(draftForm({ ...pickup, pickupVehicle: "PESAWAT" }), TEN_AM_WIB);
    expect(unknown.ok ? null : unknown.errors.pickupVehicle).toMatch(/Motor, Mobil, atau Truk/);
    const drop = validateShipmentDraft(draftForm({ handoverType: "DROP_OFF", pickupVehicle: "TRUK" }), TEN_AM_WIB);
    expect(drop.ok && drop.input).toMatchObject({ handoverType: "DROP_OFF", pickupVehicle: null });
  });

  it("shows the vehicle in the handover summary used by the saved view, rail and detail", async () => {
    const { handoverSummary } = await import("@/app/app/pengiriman/baru/saved-draft-sections");
    expect(handoverSummary({ handoverType: "PICKUP", pickupDate: "2026-09-30", pickupSlot: "10:00", pickupVehicle: "MOBIL" }))
      .toMatch(/^Penjemputan terjadwal · .+ · 10\.00–11\.00 WIB · Mobil$/);
    expect(handoverSummary({ handoverType: "PICKUP", pickupDate: "2026-09-30", pickupSlot: "10:00", pickupVehicle: null }))
      .not.toMatch(/Motor|Mobil|Truk/);
    expect(handoverSummary({ handoverType: "DROP_OFF", pickupDate: null, pickupSlot: null, pickupVehicle: null })).toBe("Drop di outlet");
  });

  it("D-26: is sent only as the documented scheduled-pickup `volume`", async () => {
    const { buildMengantarOrderRequest } = await import("@/lib/mengantar-order");
    const source = {
      courier: "JNE", declaredValueIdr: 1, destinationAreaId: "A", destinationAreaLabel: "A", destinationAreaVerifiedAt: new Date(),
      isCod: false, isHazardous: false, packageContent: "Kain", pickupAddressId: "P", providerCodAmountIdr: null, providerService: "JNE",
      quantity: 1, recipientAddress: "Jl", recipientAddressLandmark: null, recipientName: "B", recipientPhone: "081234567890",
      senderAddress: "Jl", senderName: "G", senderPhone: "081234567891", shipmentId: "S", shippingInstruction: null, weightGrams: 1_000,
      handoverType: "PICKUP" as const, pickupVehicle: "MOTOR" as const, pickupDate: "2026-09-27", pickupSlot: "09:00",
    };
    expect(buildMengantarOrderRequest(source, { pickupTimeId: "T" }).pickup).toMatchObject({ volume: "volumeMotor" });
    expect(buildMengantarOrderRequest({ ...source, handoverType: "DROP_OFF", pickupVehicle: null }).pickup).toEqual({ type: "dropOff", address_id: "P" });
  });
});

describe("Buat kiriman markup", () => {
  it("renders the stepper with the current step and the rail with its source badge and one primary", async () => {
    const { FlowStepper, SectionCard } = await import("@/app/app/pengiriman/baru/flow-parts");
    const { SummaryRail } = await import("@/app/app/pengiriman/baru/summary-rail");
    const stepper = renderToStaticMarkup(createElement(FlowStepper, {
      steps: [
        { detail: "a", label: "Isi data", state: "done" },
        { detail: "b", label: "Cek tarif", state: "current" },
        { detail: "c", label: "Terbitkan resi", state: "pending" },
      ],
    }));
    expect(stepper.match(/aria-current="step"/g)).toHaveLength(1);
    const section = renderToStaticMarkup(createElement(SectionCard, { id: "s5", number: 5, state: "current", title: "Pilih layanan ekspedisi" } as Parameters<typeof SectionCard>[0], "x"));
    expect(section).toContain('aria-labelledby="s5"');
    expect(section.match(/<h2/g)).toHaveLength(1);
    const rail = renderToStaticMarkup(createElement(SummaryRail, {
      actions: createElement("button", { "data-variant": "default", type: "submit" }, "Simpan & cek tarif"),
      destination: null,
      moneyRows: [{ amountIdr: null, label: "Ongkir" }],
      origin: null,
      rows: [{ label: "Metode bayar", value: "Non-COD" }],
      source: "Tarif resmi",
      total: { amountIdr: 209_476, label: "Total tagihan COD", note: "n" },
    }));
    expect(rail).toContain("Tarif resmi");
    expect(rail).toMatch(/Rp\s209\.476/);
    expect(rail.match(/data-variant="default"/g)).toHaveLength(1);
  });
});

describe("T-249 section progress: states, sub-progress, rail checklist, bounded rail", async () => {
  const flow = await import("@/app/app/pengiriman/baru/flow-parts");
  const rail = await import("@/app/app/pengiriman/baru/summary-rail");
  const { ShipmentCreateForm } = await import("@/app/app/pengiriman/baru/shipment-create-form");

  const party = { address: "Jalan Contoh 2", name: "Budi", phone: "081234567891" };
  const filled = {
    declaredValue: "150000",
    destinationChosen: true,
    handoverType: "PICKUP" as const,
    pickupDate: "2026-09-27",
    pickupReady: true,
    pickupSlot: "09:00",
    products: [{ name: "Kemeja", quantity: "1", weightKg: "0,7" }],
    recipient: party,
    sender: { address: "Kota Surabaya", name: "Gerai 88", phone: "081234567890" },
  };

  it("counts only the empty required (*) fields per section, by label", () => {
    expect(flow.requiredFieldsMissing(filled)).toEqual([[], [], [], []]);
    const empty = flow.requiredFieldsMissing({
      ...filled,
      declaredValue: " ",
      destinationChosen: false,
      products: [{ name: "Kemeja", quantity: "1", weightKg: "" }, { name: "", quantity: "", weightKg: "" }],
      recipient: { address: "", name: "Budi", phone: "" },
    });
    expect(empty[1]).toEqual(["Nomor telepon", "Alamat lengkap penerima", "Kecamatan tujuan"]);
    expect(empty[2]).toEqual(["Nilai barang"]);
    expect(empty[3]).toEqual(["Berat (kg) 1", "Nama produk 2", "Jumlah 2", "Berat (kg) 2"]);
    // Drop di outlet needs no pickup date or slot.
    expect(flow.requiredFieldsMissing({ ...filled, handoverType: "DROP_OFF", pickupDate: "", pickupSlot: "" })[0]).toEqual([]);
    expect(flow.requiredFieldsMissing({ ...filled, pickupReady: false, pickupSlot: "" })[0]).toEqual(["Titik pickup", "Jam penjemputan"]);
  });

  it("marks complete / current (first incomplete, or the focused one) / pending / locked", () => {
    expect(flow.flowSectionStates([0, 4, 1, 2], null, true)).toEqual(["complete", "current", "pending", "pending", "locked"]);
    expect(flow.flowSectionStates([0, 4, 1, 2], 3, true)).toEqual(["complete", "pending", "pending", "current", "locked"]);
    expect(flow.flowSectionStates([0, 0, 0, 0], null, true)).toEqual(["complete", "complete", "complete", "complete", "locked"]);
    expect(flow.spineSegments(["complete", "complete", "current", "pending", "locked"])).toEqual(["done", "todo", "todo", "todo", undefined]);
    expect(flow.saveGuard([0, 4, 1, 2]).text).toBe("Belum lengkap: Pengirim & penerima, Pembayaran +1 lainnya.");
    expect(flow.saveGuard([0, 0, 1, 0]).text).toBe("Belum lengkap: Pembayaran.");
    expect(flow.saveGuard([0, 0, 0, 0]).text).toMatch(/^Semua bagian lengkap/);
  });

  it("draws each state's marker and header status", () => {
    const card = (state: "complete" | "current" | "locked" | "pending", missing: number) => renderToStaticMarkup(createElement(
      flow.SectionCard,
      { aside: createElement(flow.SectionStatus, { missing, state }), connector: "done", id: "s", number: 3, state, title: "Pembayaran" } as Parameters<typeof flow.SectionCard>[0],
      "x",
    ));
    const complete = card("complete", 0);
    expect(complete).toContain('data-state="complete"');
    expect(complete).toContain("lucide-check");
    expect(complete).toContain("Lengkap");
    expect(complete).toContain('data-connector="done"');
    expect(card("current", 1)).toMatch(/data-state="current"[^>]*>3</);
    expect(card("pending", 2)).toContain("2 isian belum diisi");
    const locked = card("locked", 0);
    expect(locked).toContain("lucide-lock");
    expect(locked).toContain("Terbuka setelah cek tarif");
  });

  it("renders the empty form: 1/4 in the top bar, rail checklist of five in-page links, guard naming the gaps", () => {
    const html = renderToStaticMarkup(createElement(ShipmentCreateForm, {
      gerai: { name: "Gerai Uji", phone: "081234567890" },
      nowIso: "2026-09-26T03:00:00.000Z",
      outlets: [{
        id: "00000000-0000-4000-8000-000000000249",
        name: "Outlet Uji",
        pickupPoints: [{ isDefault: true, originAreaLabel: "Coblong, Kota Bandung", pickupAddressId: "P-1", pickupAddressLabel: "Gudang, Jl. Dago 1" }],
      }],
      steps: [
        { detail: "a", label: "Isi data", state: "current" },
        { detail: "b", label: "Cek tarif", state: "pending" },
        { detail: "c", label: "Terbitkan resi", state: "pending" },
      ],
      submissionId: "00000000-0000-4000-8000-000000000250",
    }));
    expect([...html.matchAll(/data-flow-section="[^"]+" data-state="(\w+)"/g)].map((match) => match[1]))
      .toEqual(["complete", "current", "pending", "pending", "locked"]);
    expect(html).toMatch(/data-slot="step-progress"[^>]*>1\/4 bagian lengkap</);
    expect(html).toMatch(/data-slot="mobile-progress"[^>]*>1\/4 bagian lengkap</);
    const checklist = /data-slot="fill-checklist"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    expect([...checklist.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]))
      .toEqual(["section-handover", "section-parties", "section-payment", "section-package", "section-service"]);
    expect(checklist.match(/aria-current="step"/g)).toHaveLength(1);
    expect(checklist).toMatch(/1<\/span>\/4<\/span> lengkap|>1\/4<\/span> lengkap/);
    expect(html).toContain("Belum lengkap: Pengirim &amp; penerima, Pembayaran +1 lainnya.");
    // The rail's primary sits in the pinned footer, with its guard.
    const footer = /data-rail-region="footer"[\s\S]*?<\/aside>/.exec(html)?.[0] ?? "";
    expect(footer).toContain("Simpan &amp; cek tarif");
    expect(footer).toContain('id="save-guard"');
  });

  it("bounds the rail: header with the progress row, scrollable body, footer with the total and the primary", () => {
    const markup = renderToStaticMarkup(createElement(rail.RailColumn, null, createElement(rail.SummaryRail, {
      actions: createElement("button", { type: "submit" }, "Simpan & cek tarif"),
      destination: "Dago, Coblong, Kota Bandung",
      moneyRows: [{ amountIdr: 150_000, label: "Nilai barang" }],
      origin: "Tanah Abang, Kota Jakarta Pusat",
      progress: createElement(rail.FillChecklist, {
        items: flow.FLOW_SECTIONS.map((section, index) => ({ ...section, missing: 0, state: index < 4 ? "complete" as const : "current" as const })),
      }),
      rows: [{ label: "Pengirim di label", value: "Gerai 88 (081234567890)" }],
      source: "Estimasi",
      total: { amountIdr: 32_500, label: "Ongkir", note: "n" },
    })));
    expect(markup).toContain("lg:max-h-[calc(100svh-7rem)]");
    const regions = [...markup.matchAll(/data-rail-region="(\w+)"/g)].map((match) => match[1]);
    expect(regions).toEqual(["header", "body", "footer"]);
    const header = markup.slice(markup.indexOf('data-rail-region="header"'), markup.indexOf('data-rail-region="body"'));
    expect(header.match(/<a /g)).toHaveLength(5);
    expect(header).toContain(">4/4</span> lengkap");
    const body = markup.slice(markup.indexOf('data-rail-region="body"'), markup.indexOf('data-rail-region="footer"'));
    expect(markup).toMatch(/<div[^>]*class="[^"]*min-h-0[^"]*overflow-y-auto[^"]*"[^>]*data-rail-region="body"/);
    expect(body).toContain('title="Tanah Abang, Kota Jakarta Pusat"');
    const footer = markup.slice(markup.indexOf('data-rail-region="footer"'));
    expect(footer).toMatch(/Rp\s32\.500/);
    expect(footer).toContain("Simpan &amp; cek tarif");
  });
});
