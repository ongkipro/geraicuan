import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "00000000-0000-4000-8000-000000000451";
const OUTLET_ONE = "00000000-0000-4000-8000-000000000452";
const OUTLET_TWO = "00000000-0000-4000-8000-000000000453";
const SECRET_SENTINEL = "vault://t157/credential-fragment-must-stay-server-side";

const errors = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
}));

const actionMocks = vi.hoisted(() => ({
  addOutletPickupPoint: vi.fn(async () => ({})),
  loadMengantarPickupOptions: vi.fn(async () => ({})),
  removeOutletPickupPoint: vi.fn(async () => ({})),
  setDefaultOutletPickupPoint: vi.fn(async () => ({})),
}));

const mocks = vi.hoisted(() => ({
  authorizationDenied: false,
  contextCalls: 0,
  listCalls: 0,
  pickupCalls: 0,
  outlets: [] as Array<Record<string, unknown>>,
  points: [] as Array<Record<string, unknown>>,
  principal: {
    role: "TENANT_ADMIN" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as "platform" | "tenant",
    tenantId: "00000000-0000-4000-8000-000000000451",
    userId: "pickup-admin",
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: vi.fn(() => [{}, vi.fn(), false]) };
});

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("@/db/client", () => ({ db: {} }));

vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, userId, tenantId, callback) => {
    mocks.contextCalls += 1;
    return callback({}, { role: mocks.principal.role, tenantId, userId });
  }),
}));

vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: errors.CmsAuthorizationDeniedError,
  requireCmsScope: vi.fn(async () => {
    if (mocks.authorizationDenied) throw new errors.CmsAuthorizationDeniedError();
    return mocks.principal;
  }),
}));

vi.mock("@/db/outlet-readiness-repository", () => ({
  listOutletReadiness: vi.fn(async () => {
    mocks.listCalls += 1;
    return mocks.outlets;
  }),
}));

vi.mock("@/db/outlet-pickup-point-repository", () => ({
  listOutletPickupPoints: vi.fn(async () => {
    mocks.pickupCalls += 1;
    return mocks.points;
  }),
}));

vi.mock("@/app/app/pengaturan/actions", () => actionMocks);

function outlet(overrides: Record<string, unknown> = {}) {
  return {
    connectionSource: "platform_default",
    connectionStatus: "platform_default",
    connectionIssue: null,
    connectionUpdatedAt: null,
    defaultOriginAreaId: "origin-1",
    defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
    defaultPickupAddressId: "pickup-1",
    defaultPickupAddressLabel: "Gudang Utama, Jalan Contoh 1",
    id: OUTLET_ONE,
    name: "Outlet Satu",
    readinessStatus: "ready",
    updatedAt: new Date("2026-09-01T01:00:00.000Z"),
    ...overrides,
  };
}

function pickupPoint(index: number, isDefault = false) {
  return {
    outletId: OUTLET_ONE,
    pickupAddressId: `pickup-${index}`,
    pickupAddressLabel: `Gudang ${index}, Jalan Contoh ${index}`,
    originAreaId: `origin-${index}`,
    originAreaLabel: `Kecamatan ${index}, Kota Bandung, Jawa Barat`,
    isDefault,
    updatedAt: new Date("2026-09-01T01:00:00.000Z"),
  };
}

async function renderPage(activeOutletId?: string) {
  const { default: PickupSettingsPage } = await import("@/app/app/pengaturan/pickup/page");
  return renderToStaticMarkup(await PickupSettingsPage({
    searchParams: Promise.resolve(activeOutletId ? { outlet: activeOutletId } : {}),
  }));
}

function occurrences(markup: string, value: string) {
  return markup.split(value).length - 1;
}

beforeEach(() => {
  mocks.authorizationDenied = false;
  mocks.contextCalls = 0;
  mocks.listCalls = 0;
  mocks.pickupCalls = 0;
  mocks.outlets = [outlet()];
  mocks.points = [pickupPoint(1, true), pickupPoint(2)];
  mocks.principal = {
    role: "TENANT_ADMIN",
    scope: "tenant",
    tenantId: TENANT_ID,
    userId: "pickup-admin",
  };
});

describe("PR-46 Titik pickup page", () => {
  it("redirects an unauthenticated request before entering tenant context", async () => {
    mocks.authorizationDenied = true;
    const { default: PickupSettingsPage } = await import("@/app/app/pengaturan/pickup/page");

    await expect(PickupSettingsPage({})).rejects.toThrow("REDIRECT:/login/tenant");
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.pickupCalls).toBe(0);
  });

  it.each([
    ["OPERATOR", "tenant", "/app"],
    ["TENANT_ADMIN", "platform", "/login/tenant"],
  ] as const)("redirects a %s/%s principal before reading pickup points", async (role, scope, destination) => {
    mocks.principal.role = role;
    mocks.principal.scope = scope;
    const { default: PickupSettingsPage } = await import("@/app/app/pengaturan/pickup/page");

    await expect(PickupSettingsPage({})).rejects.toThrow(`REDIRECT:${destination}`);
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.pickupCalls).toBe(0);
  });

  it("lists every pickup point with its origin area and marks the default one", async () => {
    const html = await renderPage();

    expect(html).toContain('aria-label="Daftar titik pickup"');
    expect(html).toContain("Gudang 1, Jalan Contoh 1");
    expect(html).toContain("Gudang 2, Jalan Contoh 2");
    expect(html).toContain("Kecamatan 2, Kota Bandung, Jawa Barat");
    // Exactly one entry is the outlet default, and it is the one flagged.
    expect(occurrences(html, "Utama")).toBe(1);
    expect(html.indexOf("Gudang 1, Jalan Contoh 1")).toBeLessThan(html.indexOf("Utama"));
    expect(html).not.toContain(SECRET_SENTINEL);
  });

  it("offers set-default only for the points that are not already default", async () => {
    const html = await renderPage();

    // Two points, one default: exactly one promotion control.
    expect(occurrences(html, "Jadikan utama")).toBe(1);
    expect(occurrences(html, ">Hapus<")).toBe(2);
    expect(html).toMatch(/<input type="hidden" name="pickupAddressId" value="pickup-2"/);
  });

  it("puts removal behind a confirmation dialog rather than a bare button", async () => {
    const html = await renderPage();

    // The dialog body is portalled and closed on the server, so what the page
    // must prove here is that "Hapus" only opens it. The confirmation token
    // itself is bound by the Server Action test.
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>Hapus<\/button>/);
    expect(html).not.toMatch(/<form[^>]*>(?:(?!<\/form>)[\s\S])*?>Hapus</);
  });

  it("states an empty outlet explicitly instead of pretending it can ship", async () => {
    mocks.points = [];
    const html = await renderPage();

    expect(html).toContain("Belum ada titik pickup");
    expect(html).toContain("Outlet ini belum dapat mengirim");
    expect(html).not.toContain("Jadikan utama");
  });

  it("scopes the add form to the active outlet and derives the origin area", async () => {
    const html = await renderPage();

    expect(html).toContain('id="add-pickup-point-form"');
    expect(html).toMatch(new RegExp(`<input type="hidden" name="outletId" value="${OUTLET_ONE}"`));
    expect(html).toContain("Akan terisi setelah pickup dipilih");
    expect(html).toContain("Tambah titik pickup");
  });

  it("selects only a tenant-listed outlet from the URL and falls back safely", async () => {
    mocks.outlets = [outlet(), outlet({ id: OUTLET_TWO, name: "Outlet Dua" })];

    const selected = await renderPage(OUTLET_TWO);
    expect(selected).toContain("Outlet Dua");
    expect(selected).toContain(`href="/app/pengaturan/pickup?outlet=${OUTLET_TWO}#pickup-points-title"`);

    const fallback = await renderPage("00000000-0000-4000-8000-999999999999");
    expect(fallback).toContain("Outlet Satu");
  });

  it("marks Titik pickup current in the settings menu and offers the back link", async () => {
    const html = await renderPage();
    const menu = html.match(/<nav[^>]*aria-label="Menu pengaturan"[\s\S]*?<\/nav>/)?.[0] ?? "";

    expect(menu.match(/<a[^>]*aria-current="true"[^>]*>/g) ?? []).toHaveLength(1);
    expect(menu).toMatch(/<a[^>]*aria-current="true"[^>]*href="\/app\/pengaturan\/pickup"/);
    expect(html).toContain('aria-label="Kembali ke Pengaturan"');
    expect(occurrences(html, 'aria-current="page"')).toBe(0);
  });
});

describe("Titik pickup route boundaries", () => {
  it("keeps loading semantics local to the page", async () => {
    const { default: PickupSettingsLoading } = await import("@/app/app/pengaturan/pickup/loading");
    const html = renderToStaticMarkup(createElement(PickupSettingsLoading));

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Memuat titik pickup"');
  });

  it("renders a sanitized focusable route error with retry and escape actions", async () => {
    const { default: PickupSettingsError } = await import("@/app/app/pengaturan/pickup/error");
    const html = renderToStaticMarkup(createElement(PickupSettingsError, { reset: vi.fn() }));

    expect(html).toContain('role="alert"');
    expect(html).toMatch(/tabindex="-1">Titik pickup belum dapat dimuat/);
    expect(html).toContain("Coba lagi");
    expect(html).toContain('href="/app"');
    expect(html).not.toContain(SECRET_SENTINEL);
  });
});
