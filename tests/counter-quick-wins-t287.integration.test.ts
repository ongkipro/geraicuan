import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * T-287 (market scan 2026-10-06): Cek tarif hands its checked route and weight to Buat kiriman, and
 * the shipment detail offers "Kirim resi via WhatsApp". Canned props; no database, no Mengantar.
 */
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
  usePathname: () => "/app/pengiriman/baru",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/db/client", () => ({ db: {} }));

const { parseShipmentPrefill, prefillWeightKg, shipmentPrefillHref } = await import("@/lib/shipment-prefill");
const { resiWhatsappHref, resiWhatsappText, whatsappHref } = await import("@/lib/whatsapp");
const { WhatsAppButton } = await import("@/app/app/kontak/contact-quick-actions");
const { ShipmentCreateForm } = await import("@/app/app/pengiriman/baru/shipment-create-form");
const { RateResults } = await import("@/app/app/cek-tarif/rate-check");

const OUTLET = "00000000-0000-4000-8000-000000000287";
const prefill = { destination: { areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "KEBAYORAN BARU, JAKARTA SELATAN", query: "kebayoran" }, outletId: OUTLET, weightGrams: 1250 };
const params = (href: string) => Object.fromEntries(new URL(href, "http://x").searchParams);

describe("Cek tarif → Buat kiriman prefill", () => {
  it("round-trips the route and weight through the URL", () => {
    const href = shipmentPrefillHref(prefill);
    expect(href.startsWith("/app/pengiriman/baru?")).toBe(true);
    expect(parseShipmentPrefill(params(href), [OUTLET])).toEqual(prefill);
  });

  it("trusts nothing: another gerai's outlet, a malformed area id, control characters or a missing query give no prefill", () => {
    const good = params(shipmentPrefillHref(prefill));
    expect(parseShipmentPrefill(good, ["another-outlet"])).toBeNull();
    expect(parseShipmentPrefill({ ...good, area: "../x" }, [OUTLET])).toBeNull();
    expect(parseShipmentPrefill({ ...good, area: "a".repeat(161) }, [OUTLET])).toBeNull();
    expect(parseShipmentPrefill({ ...good, areaLabel: "KEBAYORAN\u0000" }, [OUTLET])).toBeNull();
    expect(parseShipmentPrefill({ ...good, q: "" }, [OUTLET])).toBeNull();
    // A bad weight drops only the weight.
    for (const berat of ["0", "100001", "1.5", "-1", "abc"]) {
      expect(parseShipmentPrefill({ ...good, berat }, [OUTLET])?.weightGrams, berat).toBeNull();
    }
  });

  it("writes grams as the form's kilogram text", () => {
    expect([1250, 1000, 5, 100_000, null].map(prefillWeightKg)).toEqual(["1,25", "1", "0,005", "100", ""]);
  });

  it("opens Buat kiriman on the prefilled outlet, destination and weight", () => {
    const html = renderToStaticMarkup(createElement(ShipmentCreateForm, {
      gerai: { name: "Gerai Uji", phone: "081234567890" },
      nowIso: "2026-09-26T03:00:00.000Z",
      outlets: [
        { id: "00000000-0000-4000-8000-000000000001", name: "Outlet Lain", pickupPoints: [{ isDefault: true, originAreaLabel: "Coblong, Kota Bandung", pickupAddressId: "P-0", pickupAddressLabel: "Jl. A" }] },
        { id: OUTLET, name: "Outlet Uji", pickupPoints: [{ isDefault: true, originAreaLabel: "Coblong, Kota Bandung", pickupAddressId: "P-1", pickupAddressLabel: "Gudang, Jl. Dago 1" }] },
      ],
      prefill,
      sellerMoney: false,
      steps: [{ detail: "a", label: "Isi data", state: "current" as const }],
      submissionId: "00000000-0000-4000-8000-000000000288",
    }));
    expect(html).toContain(`<input type="hidden" name="destinationAreaId" value="${prefill.destination.areaId}"/>`);
    expect(html).toContain(`<input type="hidden" name="destinationAreaLabel" value="${prefill.destination.areaLabel}"/>`);
    expect(html).toContain('value="1,25"');
    // The picker posts what the save re-validates (review: the form's own fields alone would pass
    // even with the picker unseeded, and the save would refuse "Cari dan pilih ulang").
    expect(html).toContain(`<input type="hidden" name="areaOutletId" value="${OUTLET}"/>`);
    expect(html).toContain(`<input type="hidden" name="areaQuery" value="${prefill.destination.query}"/>`);
    expect(html).toContain('<input type="hidden" name="areaSelectionChanged" value="1"/>');
    expect(html).toContain(`<input type="hidden" name="outletId" value="${OUTLET}"/>`);
  });

  it("puts the prefill link on a quote with services only", () => {
    const quote = {
      destinationAreaId: prefill.destination.areaId, destinationAreaLabel: prefill.destination.areaLabel, destinationQuery: "kebayoran",
      originAreaLabel: "SURABAYA", outletId: OUTLET, retrievedAt: "2026-09-26T03:00:00.000Z", weightGrams: 1250,
      services: [{ codEligible: true, deliveryEstimate: "1-2 Hari", providerService: "JT", shippingAmountIdr: 24_000 }],
    };
    const html = renderToStaticMarkup(createElement(RateResults, { quote }));
    const link = /<a[^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>)[\s\S])*Buat kiriman ke tujuan ini/.exec(html);
    expect(link).not.toBeNull();
    expect(parseShipmentPrefill(params(link![1].replaceAll("&amp;", "&")), [OUTLET])).toEqual(prefill);
    expect(renderToStaticMarkup(createElement(RateResults, { quote: { ...quote, services: [] } }))).not.toContain("Buat kiriman ke tujuan ini");
  });
});

describe("Kirim resi via WhatsApp", () => {
  it("normalizes Indonesian numbers and refuses what is not one", () => {
    expect(whatsappHref("081234567890")).toBe("https://wa.me/6281234567890");
    expect(whatsappHref("+62 812-3456-7890")).toBe("https://wa.me/6281234567890");
    expect(whatsappHref("6281234567890")).toBe("https://wa.me/6281234567890");
    expect(whatsappHref("12345")).toBeNull();
    expect(whatsappHref("")).toBeNull();
    // A foreign or prefix-less number is not silently made Indonesian.
    expect(whatsappHref("+1 415 555 0100")).toBeNull();
    expect(whatsappHref("81234567890")).toBeNull();
  });

  it("sends the courier's resi and no amount or address", () => {
    const text = resiWhatsappText({ courierService: "J&T Express EZ", recipientName: "Budi", resi: "JX1234567890", senderName: "Gerai Uji" });
    expect(text).toBe("Halo Budi, paket Anda dari Gerai Uji sudah dikirim dengan J&T Express EZ. Nomor resi: JX1234567890.");
    const href = whatsappHref("081234567890", text)!;
    expect(new URL(href).searchParams.get("text")).toBe(text);
    expect(text).not.toMatch(/Rp|\d{3}\.\d{3}/);
    // No label sender: the sentence names nobody rather than the gerai behind a masked label.
    expect(resiWhatsappText({ courierService: "JNE Reg", recipientName: "Budi", resi: "R1", senderName: null })).toBe("Halo Budi, paket Anda sudah dikirim dengan JNE Reg. Nomor resi: R1.");
  });

  it("offers the link only while the parcel is on its way, with a resi and a valid number", () => {
    const base = { courierService: "JNE Reg", phone: "081234567890", recipientName: "Budi", resi: "R1", senderName: "Toko" };
    for (const status of ["ISSUED", "IN_TRANSIT"]) expect(resiWhatsappHref({ ...base, status }), status).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=/);
    for (const status of ["DELIVERED", "PROBLEM", "RTS_QUEUED", "RTS_IN_TRANSIT", "RTS_RECEIVED", "CANCELLED", "AWAITING_UPSTREAM_PAYMENT"]) {
      expect(resiWhatsappHref({ ...base, status }), status).toBeNull();
    }
    expect(resiWhatsappHref({ ...base, resi: null, status: "ISSUED" })).toBeNull();
    expect(resiWhatsappHref({ ...base, phone: "12", status: "ISSUED" })).toBeNull();
  });

  it("renders no contact WhatsApp button for a number that is not one", () => {
    expect(renderToStaticMarkup(createElement(WhatsAppButton, { name: "A", phone: "12" }))).toBe("");
    expect(renderToStaticMarkup(createElement(WhatsAppButton, { name: "A", phone: "081234567890" }))).toContain('href="https://wa.me/6281234567890"');
  });
});
