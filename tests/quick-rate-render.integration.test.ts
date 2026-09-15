import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/cek-tarif/actions", () => ({ checkShippingRates: vi.fn() }));
vi.mock("@/app/app/location-actions", () => ({ searchMengantarDestinationAreas: vi.fn() }));
import { QuickRateForm, QuickRateResults } from "@/app/app/cek-tarif/quick-rate-form";
import type { ShippingRateActionState } from "@/app/app/cek-tarif/actions";
import { tenantCmsNavigation, tenantCmsSearchNavigation } from "@/lib/cms-shell-navigation";

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
    expect(html.includes('href="/app/pengaturan"')).toBe(canManageSettings);
    expect(html).not.toContain('type="submit"');
  });
  it("collects route and weight without recipient details or duplicate outlet context", () => {
    const html = renderToStaticMarkup(createElement(QuickRateForm, { outlets: [{ id: quote.outletId, name: "Outlet Uji" }], canManageSettings: true }));
    expect(html).toContain('name="weightGrams"');
    expect(html).toContain('max="100000"');
    expect(html).not.toContain("Sumber pencarian:");
    expect(html).not.toMatch(/recipientPhone|recipientName|draf kiriman/);
  });
  it.each(["TENANT_ADMIN", "OPERATOR"] as const)("exposes header search but no sidebar item for %s", (role) => {
    const sidebar = tenantCmsNavigation(role, "/app/cek-tarif").flatMap((group) => group.items);
    expect(sidebar.some((item) => item.href === "/app/cek-tarif" || item.current)).toBe(false);
    const tools = tenantCmsSearchNavigation(role, "/app/cek-tarif").flatMap((group) => group.items);
    expect(tools.filter((item) => item.current).map((item) => item.href)).toEqual(["/app/cek-tarif"]);
  });
});
