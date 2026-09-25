import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ShipmentStepIndicator,
  type ShipmentStep,
} from "@/app/app/pengiriman/baru/shipment-step-indicator";

const STEPS: ShipmentStep[] = [
  { detail: "Selesai · Outlet Bandung", label: "Isi data", state: "done" },
  { label: "Cek tarif", state: "current" },
  { label: "Terbitkan resi", state: "pending" },
];

// T-205 replaced the rail list and the separate mobile progress bar with one step card
// under the page header (the owner's reference), read once at every width. The pins
// below keep the §7.1 intent of the earlier pair.
describe("shipment step indicator (design spec §7.1)", () => {
  it("marks exactly one current step with aria-current and a visible state word, never colour alone", () => {
    const html = renderToStaticMarkup(createElement(ShipmentStepIndicator, { steps: STEPS }));

    expect(html.match(/aria-current="step"/g) ?? []).toHaveLength(1);
    expect(html).toContain("Sedang dikerjakan");
    expect(html).toContain("Selesai · Outlet Bandung");
    expect(html).toContain("Menunggu");
    // A stepper is a list of states, not tabs (design spec §7.1, pinned sweep rule).
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain("<nav");
    expect(html).toMatch(/<ol[^>]*>/);
    // The done marker carries a distinct glyph (Check icon), not colour alone.
    expect(html.match(/<svg/g) ?? []).toHaveLength(1);
  });

  it("fails to mark a current step when every step is done or pending (mutation guard)", () => {
    const noCurrent: ShipmentStep[] = STEPS.map((step) => (step.state === "current" ? { ...step, state: "pending" } : step));
    const html = renderToStaticMarkup(createElement(ShipmentStepIndicator, { steps: noCurrent }));
    expect(html.match(/aria-current="step"/g) ?? []).toHaveLength(0);
  });

  it("keeps every step's words visible at every width and the connectors decorative", () => {
    const html = renderToStaticMarkup(createElement(ShipmentStepIndicator, { steps: STEPS }));

    // One tree for all widths: no step text is hidden below a breakpoint or left to sr-only.
    expect(html).not.toContain("sr-only");
    expect(html).not.toMatch(/@4xl\/page:hidden|max-sm:hidden/);
    for (const step of STEPS) expect(html).toContain(`>${step.label}</span>`);
    // The hairlines between steps carry no text and are hidden from assistive technology.
    const connectors = html.match(/<span aria-hidden="true" class="hidden h-px[^"]*"><\/span>/g) ?? [];
    expect(connectors).toHaveLength(STEPS.length - 1);
  });
});

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => { throw new Error(`REDIRECT:${href}`); }),
}));
vi.mock("@/db/client", () => ({ db: {} }));
// T-205: the page reads the gerai's name and WhatsApp for the "Alamat gerai" sender
// source; the stub transaction answers that one select with the gerai below.
const tenantSelect = {
  from: () => tenantSelect,
  limit: async () => [{ name: "Gerai Bandung", phone: "081234567890" }],
  where: () => tenantSelect,
};
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, _userId, _tenantId, callback) =>
    callback({ select: () => tenantSelect }, { role: "TENANT_ADMIN", tenantId: "00000000-0000-4000-8000-000000000701", userId: "draft-render-user" }),
  ),
}));
vi.mock("@/db/outlet-pickup-point-repository", () => ({
  listOutletPickupPoints: vi.fn(async () => []),
}));

vi.mock("@/db/outlet-readiness-repository", () => ({
  listReadyShipmentOutlets: vi.fn(async () => [{ id: "00000000-0000-4000-8000-000000000702", name: "Outlet Bandung" }]),
}));
vi.mock("@/db/estimate-repository", () => ({ loadLatestEstimateSnapshot: vi.fn(async () => null) }));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({ role: "TENANT_ADMIN", scope: "tenant" as const, tenantId: "00000000-0000-4000-8000-000000000701", userId: "draft-render-user" })),
}));
vi.mock("@/app/app/actions", () => ({
  saveShipmentDraft: vi.fn(),
  searchRecipientShipmentContacts: vi.fn(),
  searchSenderShipmentContacts: vi.fn(),
  selectShipmentContact: vi.fn(),
}));
vi.mock("@/app/app/estimate-actions", () => ({ loadShipmentEstimate: vi.fn() }));
vi.mock("@/app/app/location-actions", () => ({ searchMengantarDestinationAreas: vi.fn(async () => ({ options: [], success: true })) }));

describe("pengiriman/baru page layout (design spec §2.2/§7)", () => {
  it("wraps the draft form in the two-column form pattern with the stepper above and the summary in the rail", async () => {
    const { default: NewShipmentPage } = await import("@/app/app/pengiriman/baru/page");
    const html = renderToStaticMarkup(await NewShipmentPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("@4xl/page:grid-cols-[minmax(0,1fr)_22rem]");
    expect(html).toContain('aria-label="Ringkasan pembuatan kiriman"');
    expect(html).toContain("Tahapan pembuatan kiriman");
    // One step card at every width, so a screen reader hears the current step once.
    expect(html.match(/aria-current="step"/g) ?? []).toHaveLength(1);
    // The steps sit above the two columns, not inside the rail (T-205, the owner's reference).
    expect(html.indexOf("Tahapan pembuatan kiriman")).toBeLessThan(html.indexOf('aria-label="Ringkasan pembuatan kiriman"'));
    // The "Alamat gerai" source is offered and prefills the label sender from the gerai.
    expect(html).toContain("Alamat gerai");
    expect(html).toMatch(/<input[^>]*id="senderName"[^>]*value="Gerai Bandung"/);
    // One primary per width: the rail's submit shows from the split, the bottom bar's below it.
    const submits = html.match(/<button[^>]*type="submit"[^>]*>Simpan &amp; cek tarif<\/button>/g) ?? [];
    expect(submits).toHaveLength(2);
    expect(submits.filter((button) => /\bhidden\b[^"]*@4xl\/page:inline-flex/.test(button))).toHaveLength(1);
    expect(html).toMatch(/<div class="sticky bottom-0[^"]*@4xl\/page:hidden"/);
    expect(html).not.toContain('role="tablist"');
    // T-149: the single frame ships without a per-page width prop.
    expect(html).not.toMatch(/<div[^>]*width=/);
  });
});
