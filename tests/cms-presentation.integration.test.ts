import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";

// T-149/B5: FormLayout, DetailLayout, PageAside and fieldWidth previously had
// zero production importers, so every assertion below rendered the components
// directly and compared their output to their own hardcoded source strings —
// it could not fail from a real regression in a consuming page. `/app/kontak/baru`
// and `/app/kontak/[contactId]` are now real consumers; render them instead.
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => { throw new Error(`REDIRECT:${href}`); }),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, _userId, _tenantId, callback) =>
    callback({}, { role: "TENANT_ADMIN", tenantId: "00000000-0000-4000-8000-000000000801", userId: "presentation-render-user" }),
  ),
}));
vi.mock("@/db/outlet-readiness-repository", () => ({
  listReadyShipmentOutlets: vi.fn(async () => [{ id: "00000000-0000-4000-8000-000000000802", name: "Outlet Uji" }]),
}));
vi.mock("@/db/contact-repository", () => ({
  getContact: vi.fn(async () => ({
    archivedAt: null,
    id: "00000000-0000-4000-8000-000000000803",
    isRecipient: true,
    isSender: true,
    name: "Kontak Uji",
    phone: "081200000000",
    updatedAt: new Date("2026-09-14T00:00:00.000Z"),
  })),
  listContactAddresses: vi.fn(async () => []),
}));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({ role: "TENANT_ADMIN", scope: "tenant" as const, tenantId: "00000000-0000-4000-8000-000000000801", userId: "presentation-render-user" })),
}));
vi.mock("@/app/app/kontak/actions", () => ({ saveContact: vi.fn() }));
vi.mock("@/app/app/kontak/[contactId]/actions", () => ({
  addContactAddressAction: vi.fn(),
  archiveContactAction: vi.fn(),
  updateContactAction: vi.fn(),
  updateContactAddressAction: vi.fn(),
}));
vi.mock("@/app/app/location-actions", () => ({ searchMengantarDestinationAreas: vi.fn(async () => ({ options: [], success: true })) }));

describe("CMS presentation contract", () => {
  // Widths were retuned in Phase 13 (wide 88rem, data 7xl, form 5xl). Bind to the contract instead
  // of literal classes: every width caps the page, never adds route gutters, and a wider width never
  // renders narrower than a smaller one (form <= standard <= data <= wide).
  const tailwindRem: Record<string, number> = { "3xl": 48, "4xl": 56, "5xl": 64, "6xl": 72, "7xl": 80 };
  function maxWidthRem(width: "wide" | "data" | "standard" | "form") {
    const html = renderToStaticMarkup(createElement(PageContainer, { width }, "Content"));
    expect(html).toContain("min-w-0");
    expect(html).not.toContain("px-4");
    const named = html.match(/\bmax-w-(\dxl)\b/)?.[1];
    const arbitrary = html.match(/\bmax-w-\[(\d+(?:\.\d+)?)rem\]/)?.[1];
    const rem = named ? tailwindRem[named] : arbitrary ? Number(arbitrary) : undefined;
    expect(rem, `${width} max width`).toBeTypeOf("number");
    return rem as number;
  }

  it.each(["wide", "data", "standard", "form"] as const)("caps the %s page width without adding route gutters", (width) => {
    maxWidthRem(width);
  });

  it("orders page widths from form to wide", () => {
    const [form, standard, data, wide] = (["form", "standard", "data", "wide"] as const).map(maxWidthRem);
    expect(form).toBeLessThanOrEqual(standard);
    expect(standard).toBeLessThan(data);
    expect(data).toBeLessThan(wide);
  });

  // T-149: one frame. Four centred caps put the page title at a different x on
  // every route (measured 373/437/565 px at 1920), so pages stop choosing a width.
  it("defaults to the single wide frame and names the page container query", () => {
    const html = renderToStaticMarkup(createElement(PageContainer, null, "Content"));
    expect(html).toContain("max-w-[88rem]");
    expect(html).toContain("@container/page");
    expect(html).toContain("mx-auto");
  });

  it("wraps a real Pattern B page (kontak/baru) in the form-layout rail geometry with a named aside", async () => {
    const { default: NewContactPage } = await import("@/app/app/kontak/baru/page");
    const html = renderToStaticMarkup(await NewContactPage({ searchParams: Promise.resolve({}) }));

    // minmax(0,1fr) and not a bare 1fr: a wide table inside a grid item with
    // min-width auto is what blows the frame out.
    expect(html).toContain("@4xl/page:grid-cols-[minmax(0,1fr)_22rem]");
    expect(html).toContain("@4xl/page:items-start");
    expect(html).toContain('aria-label="Bantuan kontak baru"');
    expect(html).toContain("@4xl/page:top-[calc(var(--cms-header-h,4rem)+1rem)]");
    expect(html).toContain("@4xl/page:overflow-y-auto");
  });

  it("wraps a real Pattern C page (kontak/[contactId]) in the same detail-layout rail geometry", async () => {
    const { default: ContactDetailPage } = await import("@/app/app/kontak/[contactId]/page");
    const html = renderToStaticMarkup(await ContactDetailPage({
      params: Promise.resolve({ contactId: "00000000-0000-4000-8000-000000000803" }),
      searchParams: Promise.resolve({ dari: "pengirim" }),
    }));

    expect(html).toContain("@4xl/page:grid-cols-[minmax(0,1fr)_22rem]");
    expect(html).toContain('aria-label="Ringkasan kontak"');
  });

  // Review follow-up: the rail geometry was only asserted on two of the seven
  // converted pages, so the other five could each lose their layout with the suite
  // green. One table, every page, with its own aside name.
  it.each([
    ["/app/cek-resi", () => import("@/app/app/cek-resi/page"), "Bantuan cek resi"],
    ["/app/cek-tarif", () => import("@/app/app/cek-tarif/page"), "Bantuan cek tarif"],
    ["/app/impor", () => import("@/app/app/impor/page"), "Bantuan impor massal"],
  ] as const)("keeps %s inside the shared rail geometry", async (_route, load, asideLabel) => {
    const { default: Page } = await load();
    const html = renderToStaticMarkup(await (Page as () => Promise<ReactElement>)());

    expect(html).toContain("@4xl/page:grid-cols-[minmax(0,1fr)_22rem]");
    expect(html).toContain(`aria-label="${asideLabel}"`);
  });

  it("sizes named controls by their data instead of stretching to the column (B5)", async () => {
    const { default: NewContactPage } = await import("@/app/app/kontak/baru/page");
    const html = renderToStaticMarkup(await NewContactPage({ searchParams: Promise.resolve({}) }));

    // Every `data-slot="field"` div's own class attribute; the nearest one
    // preceding a given `for="…"` label is that field's own wrapper.
    const fieldOpenTags = [...html.matchAll(/<div[^>]*data-slot="field"[^>]*>/g)];
    const classOf = (labelFor: string) => {
      const labelIndex = html.indexOf(`for="${labelFor}"`);
      const enclosing = fieldOpenTags.filter((match) => match.index! < labelIndex).at(-1);
      return enclosing?.[0].match(/class="([^"]*)"/)?.[1] ?? "";
    };

    // "Nama" is field-w-lg (320px); "Nomor telepon" is field-w-md (192px). Both
    // rendered inside a flex FieldRow, not the old `sm:grid-cols-2` grid that
    // stretched every control to its column regardless of this class.
    expect(classOf("contactName")).toContain("sm:w-80");
    expect(classOf("contactPhone")).toContain("sm:w-48");
    expect(html).not.toContain("sm:grid-cols-2");
  });

  it("gives a real page's header actions a touch target", async () => {
    const { default: ContactDetailPage } = await import("@/app/app/kontak/[contactId]/page");
    const html = renderToStaticMarkup(await ContactDetailPage({
      params: Promise.resolve({ contactId: "00000000-0000-4000-8000-000000000803" }),
      searchParams: Promise.resolve({ dari: "pengirim" }),
    }));

    expect(html).toMatch(/<h1[^>]*>/);
    expect(html).toContain("[&amp;&gt;*]:min-h-11");
  });

  it("keeps header actions touch-sized and the heading hierarchy semantic", () => {
    const html = renderToStaticMarkup(createElement(PageHeader, {
      actions: createElement("button", { type: "button" }, "Action"),
      eyebrow: "Scope",
      title: "Page title",
    }));

    expect(html).toContain("<h1");
    expect(html).toContain("[&amp;&gt;*]:min-h-11");
  });
});
