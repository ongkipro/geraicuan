import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/cek-tarif/actions", () => ({ checkShippingRates: vi.fn() }));
vi.mock("@/app/app/location-actions", () => ({ searchMengantarDestinationAreas: vi.fn() }));
import { QuickRateForm, QuickRateResults } from "@/app/app/cek-tarif/quick-rate-form";
import type { ShippingRateActionState } from "@/app/app/cek-tarif/actions";
import { tenantCmsNavigation } from "@/lib/cms-shell-navigation";

const quote: NonNullable<ShippingRateActionState["quote"]> = {
  outletId: "79000000-0000-4000-8000-000000000004",
  originAreaLabel: "SURABAYA", destinationAreaLabel: "JAKARTA", weightGrams: 1000,
  retrievedAt: "2026-09-14T17:00:00.000Z",
  services: [{ providerService: "JNE_REG", shippingAmountIdr: 20000, deliveryEstimate: "2–3 hari", codEligible: true }],
};

describe("quick-rate presentation", () => {
  it("shows a provider amount and WIB retrieval context without fabricating totals", () => {
    const html = renderToStaticMarkup(createElement(QuickRateResults, { quote }));
    expect(html).toContain("20.000");
    expect(html).toContain("15 Sep 2026");
    expect(html).toContain("WIB");
    expect(html).toContain("2–3 hari");
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Perbandingan estimasi ongkir"');
    expect(html).not.toMatch(/Bayar|Total tagihan|Buat pesanan/);
  });
  it("distinguishes no services from zero-cost shipping", () => {
    const html = renderToStaticMarkup(createElement(QuickRateResults, { quote: { ...quote, services: [] } }));
    expect(html).toContain("Belum ada layanan untuk rute ini");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("Rp");
  });
  it.each([true, false])("keeps unconfigured-outlet next action role appropriate: admin=%s", (canManageSettings) => {
    const html = renderToStaticMarkup(createElement(QuickRateForm, { outlets: [], canManageSettings }));
    expect(html).toContain("Siapkan outlet");
    expect(html.includes('href="/app/pengaturan/outlet"')).toBe(canManageSettings);
    expect(html).not.toContain('type="submit"');
  });
  it("collects route and weight without recipient details or duplicate outlet context", () => {
    const html = renderToStaticMarkup(createElement(QuickRateForm, { outlets: [{ id: quote.outletId, name: "Outlet Uji" }], canManageSettings: true }));
    expect(html).toContain('name="weightGrams"');
    // T-196: grams are a digits-only text field with a numeric keyboard, never a number spinner;
    // the 1–100.000 g range is the server's check and the hint's wording.
    const weight = html.match(/<input[^>]*name="weightGrams"[^>]*>/)?.[0] ?? "";
    expect(weight).toContain('type="text"');
    expect(weight).toContain('inputMode="numeric"');
    expect(weight).toContain('data-character-class="NUMERIC_INTEGER"');
    expect(html).toContain("Maksimal 100 kg.");
    expect(html).not.toContain("Sumber pencarian:");
    expect(html).not.toMatch(/recipientPhone|recipientName|draf kiriman/);
  });
  // PR-51: Cek tarif left the header button for the sidebar "Cek" group, keeping its URL.
  it.each(["TENANT_ADMIN", "OPERATOR"] as const)("sits in the sidebar Cek group and is current there for %s", (role) => {
    const groups = tenantCmsNavigation(role, "/app/cek-tarif");
    const cek = groups.find((group) => group.label === "Cek");

    expect(cek?.items.map((item) => item.href)).toEqual(["/app/cek-resi", "/app/cek-tarif"]);
    expect(groups.flatMap((group) => group.items).filter((item) => item.current).map((item) => item.href))
      .toEqual(["/app/cek-tarif"]);
  });
});
