import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  CompactShipmentStepIndicator,
  ShipmentStepIndicator,
  type ShipmentStep,
} from "@/app/app/pengiriman/baru/shipment-step-indicator";

const STEPS: ShipmentStep[] = [
  { detail: "Selesai · Outlet Bandung", label: "Draf", state: "done" },
  { label: "Estimasi", state: "current" },
  { label: "Konfirmasi", state: "pending" },
  { label: "AWB", state: "pending" },
];

describe("shipment step indicator (design spec §7.1/§7.3)", () => {
  it("marks exactly one current step with aria-current and a visible state word, never colour alone", () => {
    const html = renderToStaticMarkup(createElement(ShipmentStepIndicator, { steps: STEPS }));

    expect(html.match(/aria-current="step"/g) ?? []).toHaveLength(1);
    expect(html).toContain("Sedang dikerjakan");
    expect(html).toContain("Selesai · Outlet Bandung");
    expect(html).toContain("Menunggu");
    // A stepper is a list of states, not tabs (design spec §7.1, pinned sweep rule).
    expect(html).not.toContain('role="tablist"');
    // The done marker carries a distinct glyph (Check icon), not colour alone.
    expect(html).toContain("<nav");
    expect(html.match(/<svg/g) ?? []).toHaveLength(1);
  });

  it("fails to mark a current step when every step is done or pending (mutation guard)", () => {
    const noCurrent: ShipmentStep[] = STEPS.map((step) => (step.state === "current" ? { ...step, state: "pending" } : step));
    const html = renderToStaticMarkup(createElement(ShipmentStepIndicator, { steps: noCurrent }));
    expect(html.match(/aria-current="step"/g) ?? []).toHaveLength(0);
  });

  it("renders the compact mobile bar hidden at the split breakpoint with sr-only per-segment state", () => {
    const html = renderToStaticMarkup(createElement(CompactShipmentStepIndicator, { steps: STEPS }));

    expect(html).toContain("@4xl/page:hidden");
    expect(html).toContain("Langkah 2 dari 4 · Estimasi");
    expect(html).toContain("sr-only");
    expect(html).toContain("Langkah Estimasi: Sedang dikerjakan");
    // The bars are decoration and say so: with the words on the page ground, a
    // set of empty `<li>` carrying `aria-current="step"` announced three blank
    // list items ahead of the sentence that states where the operator is. The
    // heading line and the sr-only list are what a screen reader reads.
    expect(html).toMatch(/<ol[^>]*aria-hidden="true"/);
    expect(html.match(/aria-current="step"/g) ?? []).toHaveLength(0);
  });

  it("keeps the per-step words off the tinted bars", () => {
    const html = renderToStaticMarkup(createElement(CompactShipmentStepIndicator, { steps: STEPS }));

    // Each bar is a fill on --ok, --primary or --hairline. A `sr-only` span is
    // clipped to a pixel but still painted, so text placed inside a bar
    // inherits page ink over that fill: the current bar measured 2.57:1 in the
    // T-159 browser sweep at 1024 and 390. The bars carry no text at all; the
    // words live in one line on the page ground.
    const bars = html.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? [];
    expect(bars).toHaveLength(STEPS.length);
    for (const bar of bars) expect(bar.replace(/^<li[^>]*>|<\/li>$/g, "")).toBe("");
    for (const step of STEPS) expect(html).toContain(`Langkah ${step.label}:`);
  });
});

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => { throw new Error(`REDIRECT:${href}`); }),
}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, _userId, _tenantId, callback) =>
    callback({}, { role: "TENANT_ADMIN", tenantId: "00000000-0000-4000-8000-000000000701", userId: "draft-render-user" }),
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
  it("wraps the draft form in the two-column form pattern with the stepper and summary in the rail", async () => {
    const { default: NewShipmentPage } = await import("@/app/app/pengiriman/baru/page");
    const html = renderToStaticMarkup(await NewShipmentPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("@4xl/page:grid-cols-[minmax(0,1fr)_22rem]");
    expect(html).toContain('aria-label="Ringkasan pembuatan kiriman"');
    expect(html).toContain("Tahapan pembuatan kiriman");
    // One marker, from the desktop stepper. The compact bars became decoration
    // (`aria-hidden`) once the per-step words moved onto the page ground, so a
    // screen reader hears the current step once rather than twice.
    expect(html.match(/aria-current="step"/g) ?? []).toHaveLength(1);
    expect(html).not.toContain('role="tablist"');
    // T-149: the single frame ships without a per-page width prop.
    expect(html).not.toMatch(/<div[^>]*width=/);
  });
});
