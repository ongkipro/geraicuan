import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * T-242 (owner 2026-09-26: "cek-tarif.html | cek-resi.html → sempurnakan pakai shadcn"): Cek tarif
 * highlights, courier chips and the T-237 "quotable, not orderable" note; Cek resi facts, copy,
 * idle state and payment line. No database and no Mengantar: the Server Action modules are replaced.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/cek-tarif",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/app/cek-resi/actions", () => ({ lookupShipmentTracking: vi.fn() }));
vi.mock("@/app/app/cek-tarif/actions", () => ({ checkShippingRates: vi.fn() }));
vi.mock("@/app/app/location-actions", () => ({ searchMengantarDestinationAreas: vi.fn() }));

const { RateCheck, RateResults, estimateDays, rateHighlights } = await import("@/app/app/cek-tarif/rate-check");
const { TrackingLookup, TrackingResultCard } = await import("@/app/app/cek-resi/tracking-lookup");
const { mengantarOrderableService } = await import("@/lib/mengantar-couriers");

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const filledPrimaries = (html: string) => html.match(/data-slot="button" data-variant="default"/g)?.length ?? 0;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Cek tarif (T-242)", () => {
  const services = [
    { codEligible: false, deliveryEstimate: "2-3 Day", providerService: "JNE", shippingAmountIdr: 22_000 },
    { codEligible: true, deliveryEstimate: "1-2 Hari", providerService: "JT", shippingAmountIdr: 24_000 },
    { codEligible: false, deliveryEstimate: "3 - 5 days", providerService: "SAPLite", shippingAmountIdr: 17_500 },
    { codEligible: true, deliveryEstimate: "1-3 Hari", providerService: "spx", shippingAmountIdr: 20_000 },
  ];
  const quote = { destinationAreaLabel: "KEBAYORAN BARU, JAKARTA SELATAN", originAreaLabel: "SURABAYA", outletId: "o1", retrievedAt: "2026-09-14T17:00:00Z", services, weightGrams: 1000 };

  it("reads day ranges from the courier's estimate, and nothing from text without days", () => {
    expect(estimateDays("2-3 Day")).toEqual([2, 3]);
    expect(estimateDays("4 HARI")).toEqual([4, 4]);
    expect(estimateDays("-")).toBeNull();
    expect(estimateDays("Next day")).toBeNull();
  });

  it("picks the cheapest and the fastest (smallest upper bound, then lower bound, then price)", () => {
    const { cheapest, fastest } = rateHighlights(services);
    expect(cheapest?.providerService).toBe("SAPLite");
    expect(fastest?.providerService).toBe("JT");
    const tie = rateHighlights([
      { codEligible: true, deliveryEstimate: "1-2 Hari", providerService: "JT", shippingAmountIdr: 24_000 },
      { codEligible: true, deliveryEstimate: "1-2 Hari", providerService: "JNE", shippingAmountIdr: 21_000 },
    ]);
    expect(tie.fastest?.providerService).toBe("JNE");
    expect(rateHighlights([{ codEligible: true, deliveryEstimate: "-", providerService: "JNE", shippingAmountIdr: 1 }]).fastest).toBeNull();
    expect(rateHighlights([]).cheapest).toBeNull();
  });

  it("marks exactly the services the order builder refuses (spx, paxel, SAPLite) as not orderable", () => {
    const catalogue = JSON.parse(readFileSync("tests/fixtures/mengantar-couriers.catalogue.json", "utf8")) as { serviceKeys: string[] };
    const notOrderable = catalogue.serviceKeys.filter((key) => key !== "Ninja" && mengantarOrderableService(key) === null);
    expect(notOrderable.sort()).toEqual(["SAPLite", "paxel", "spx"]);
    expect(mengantarOrderableService("JNECargo")).toEqual({ cargo: true, courier: "JNE", documented: "JNE" });
    expect(mengantarOrderableService("SapCargo")).toEqual({ cargo: true, courier: "SAP", documented: "Sap" });
    expect(mengantarOrderableService("lion")).toEqual({ cargo: false, courier: "lion", documented: "lion" });
    // The builder refuses through this same helper, so the note and the refusal cannot drift.
    expect(readFileSync("src/lib/mengantar-order.ts", "utf8")).toMatch(/const orderable = mengantarOrderableService\(order\.providerService\);\s*if \(!orderable\) throw new MengantarOrderPayloadError\("ORDER_SERVICE_UNDOCUMENTED"\)/);
  });

  it("labels the result an estimate and shows highlights, chip counts and the not-orderable note", () => {
    const html = render(createElement(RateResults, { quote }));
    const plain = text(html);
    expect(html).toContain(">Estimasi</span>");
    expect(plain).toContain("Tarif resmi tercatat saat resi diterbitkan.");
    expect(plain).toMatch(/Termurah Rp\s?17\.500 SAP Lite · 3–5 hari/);
    expect(plain).toMatch(/Tercepat 1–2 hari J&amp;T · Rp\s?24\.000/);
    expect(plain).toContain("4 layanan");
    expect(plain).toContain("4 kurir · 2 bisa COD");
    expect(html).toContain('aria-label="Saring kurir"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(plain).toContain("Semua 4 layanan");
    // Two services (desktop row + phone card each) carry the note; JNE and J&T do not.
    expect(html.match(/belum bisa dipesan lewat API Mengantar/g)).toHaveLength(4);
    expect(plain).toContain("Menampilkan 4 dari 4 layanan");
  });

  it("shows no highlight tags when only one service is quoted", () => {
    const html = render(createElement(RateResults, { quote: { ...quote, services: [services[0]] } }));
    expect(html).not.toContain(">Termurah</span>");
    expect(html).not.toContain('aria-label="Saring kurir"');
  });

  it("keeps an idle placeholder before the first check and offers Coba lagi after a provider error", () => {
    const outlets = [{ id: "o1", name: "Outlet Utama" }];
    const idle = render(createElement(RateCheck, { canManageSettings: false, outlets }));
    expect(idle).toContain("Tarif muncul di sini");
    expect(filledPrimaries(idle)).toBe(1);
    expect(idle).toContain('id="rate-weight-help"');
    expect(text(idle)).toContain("Setara 1 kg.");
    const failed = render(createElement(RateCheck, { canManageSettings: false, initialState: { error: "Tarif belum dapat dimuat dari Mengantar. Coba lagi." }, outlets }));
    expect(failed).toContain('role="alert"');
    expect(text(failed)).toContain("Coba lagi");
    expect(failed).not.toContain("Tarif muncul di sini");
    expect(filledPrimaries(failed)).toBe(1);
  });
});

describe("Cek resi (T-242)", () => {
  const result = {
    awb: "11LP1700187536",
    courier: "lion",
    declaredValueIdr: 250_000,
    destinationAreaLabel: "PANAKKUKANG, MAKASSAR",
    historyEvents: [{ description: "Paket tiba di gudang transit", occurredAtIso: "2026-09-25T03:00:00Z" }],
    observation: { observedAtIso: "2026-09-25T03:13:00Z", providerStatus: "ON PROCESS" },
    paymentMethod: "COD" as const,
    providerCodAmountIdr: 119_479,
    providerService: "lion",
    publicReference: "GC-10058",
    returnAwb: null as string | null,
    status: "IN_TRANSIT" as const,
    updatedAtIso: "2026-09-25T02:45:00Z",
  };

  it("shows the courier, payment and destination facts, a copy button and WIB freshness", () => {
    const html = render(createElement(TrackingResultCard, { result }));
    const plain = text(html);
    expect(plain).toContain("Ekspedisi Lion Parcel");
    expect(plain).toMatch(/Pembayaran COD Rp\s?119\.479 Total COD/);
    expect(plain).toContain("Tujuan Panakkukang, Makassar");
    expect(html).toContain('aria-label="Salin nomor resi"');
    expect(plain).toMatch(/Diperbarui \d{1,2} Sep 2026,? \d{2}[.:]\d{2} WIB/);
    expect(plain).toContain("WIB · Kurir");
    expect(plain).toContain("WIB · Mengantar");
  });

  it("names the COD Ongkir charge, never the goods; Non-COD without an order reads Belum ada layanan", () => {
    const codOngkir = text(render(createElement(TrackingResultCard, { result: { ...result, paymentMethod: "COD_ONGKIR", providerCodAmountIdr: 20_000 } })));
    expect(codOngkir).toMatch(/Pembayaran COD Ongkir Rp\s?20\.000 Ongkir ditagih/);
    expect(codOngkir).not.toMatch(/250\.000/);
    const nonCod = render(createElement(TrackingResultCard, { result: { ...result, awb: null, courier: null, paymentMethod: "NON_COD", providerService: null } }));
    expect(text(nonCod)).toContain("Belum ada layanan");
    expect(text(nonCod)).toMatch(/Non-COD Rp\s?250\.000 Nilai asuransi/);
    expect(nonCod).not.toContain("Salin nomor resi");
  });

  it("shows the idle placeholder, and keeps it for an invalid key with the inline error", () => {
    expect(render(createElement(TrackingLookup, {}))).toContain("Perjalanan paket muncul di sini");
    const invalid = render(createElement(TrackingLookup, { initialState: { kind: "invalid", query: "??" } }));
    expect(invalid).toContain('aria-invalid="true"');
    expect(invalid).toContain("Masukkan nomor kiriman (contoh GC-10013)");
    expect(filledPrimaries(invalid)).toBe(1);
  });
});
