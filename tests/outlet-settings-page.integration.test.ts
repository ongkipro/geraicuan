import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "00000000-0000-4000-8000-000000000451";
const OUTLET_ONE = "00000000-0000-4000-8000-000000000452";
const OUTLET_TWO = "00000000-0000-4000-8000-000000000453";
const OUTLET_THREE = "00000000-0000-4000-8000-000000000454";
const SECRET_SENTINEL = "vault://t45/credential-fragment-must-stay-server-side";

const errors = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
}));

const actionMocks = vi.hoisted(() => ({
  loadMengantarPickupOptions: vi.fn(async () => ({})),
  savePrivateMengantarCredential: vi.fn(async () => ({})),
  switchMengantarToPlatformDefault: vi.fn(async () => ({})),
}));

const mocks = vi.hoisted(() => ({
  credentialState: {} as Record<string, unknown>,
  fallbackState: {} as Record<string, unknown>,
  locationState: {} as Record<string, unknown>,
  authorizationDenied: false,
  contextCalls: 0,
  listCalls: 0,
  outlets: [] as Array<Record<string, unknown>>,
  credentialPending: false,
  fallbackPending: false,
  locationPending: false,
  principal: {
    role: "TENANT_ADMIN" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as "platform" | "tenant",
    tenantId: "00000000-0000-4000-8000-000000000451",
    userId: "outlet-admin",
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: vi.fn((action) => {
      if (action === actionMocks.savePrivateMengantarCredential) {
        return [mocks.credentialState, vi.fn(), mocks.credentialPending];
      }
      if (action === actionMocks.switchMengantarToPlatformDefault) {
        return [mocks.fallbackState, vi.fn(), mocks.fallbackPending];
      }
      return [mocks.locationState, vi.fn(), mocks.locationPending];
    }),
  };
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

vi.mock("@/app/app/pengaturan/actions", () => actionMocks);

function outlet(overrides: Record<string, unknown> = {}) {
  return {
    connectionSource: "platform_default",
    connectionStatus: "platform_default",
    connectionIssue: null,
    connectionUpdatedAt: null,
    defaultOriginAreaId: null,
    defaultOriginAreaLabel: null,
    defaultPickupAddressId: null,
    defaultPickupAddressLabel: null,
    id: OUTLET_ONE,
    name: "Outlet Belum Siap",
    readinessStatus: "needs_attention",
    updatedAt: new Date("2026-09-01T01:00:00.000Z"),
    ...overrides,
  };
}

async function renderPage(activeOutletId?: string) {
  const { default: OutletSettingsPage } = await import("@/app/app/pengaturan/outlet/page");
  return renderToStaticMarkup(await OutletSettingsPage({
    searchParams: Promise.resolve(activeOutletId ? { outlet: activeOutletId } : {}),
  }));
}

function occurrences(markup: string, value: string) {
  return markup.split(value).length - 1;
}

beforeEach(() => {
  mocks.credentialState = {};
  mocks.fallbackState = {};
  mocks.locationState = {};
  mocks.authorizationDenied = false;
  mocks.contextCalls = 0;
  mocks.listCalls = 0;
  mocks.outlets = [];
  mocks.credentialPending = false;
  mocks.fallbackPending = false;
  mocks.locationPending = false;
  mocks.principal = {
    role: "TENANT_ADMIN",
    scope: "tenant",
    tenantId: TENANT_ID,
    userId: "outlet-admin",
  };
});

describe("Outlet settings page acceptance", () => {
  it("redirects an unauthenticated request before entering tenant context or reading settings", async () => {
    mocks.authorizationDenied = true;
    const { default: OutletSettingsPage } = await import("@/app/app/pengaturan/outlet/page");

    await expect(OutletSettingsPage({})).rejects.toThrow("REDIRECT:/login/tenant");
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.listCalls).toBe(0);
  });

  it.each([
    ["OPERATOR", "tenant", "/app"],
    ["TENANT_ADMIN", "platform", "/login/tenant"],
  ] as const)(
    "redirects a %s/%s principal before protected settings reads",
    async (role, scope, destination) => {
      mocks.principal.role = role;
      mocks.principal.scope = scope;
      const { default: OutletSettingsPage } = await import("@/app/app/pengaturan/outlet/page");

      await expect(OutletSettingsPage({})).rejects.toThrow(`REDIRECT:${destination}`);
      expect(mocks.contextCalls).toBe(0);
      expect(mocks.listCalls).toBe(0);
    },
  );

  it("renders the zero-outlet first-run state without a settings form", async () => {
    const html = await renderPage();

    expect(html).toContain("Belum ada outlet");
    expect(html).toContain("Hubungi Super Admin");
    expect(html).not.toContain("Simpan pengaturan");
    expect(html).not.toContain("Ringkasan kesiapan outlet");
    expect(mocks.listCalls).toBe(1);
  });

  it("renders one incomplete platform outlet with labelled non-secret fields", async () => {
    mocks.outlets = [outlet()];

    const html = await renderPage();

    expect(html).toContain("Outlet Belum Siap");
    expect(html).toContain("Perlu dilengkapi");
    expect(html).toContain("Periksa alamat pickup, area asal.");
    expect(html).toContain("Default GeraiCUAN");
    // T-157: choosing a pickup point belongs to Titik pickup; this page states
    // the resulting pair and links there instead of carrying a second editor.
    expect(html).toContain("Belum ada titik pickup");
    expect(html).toContain("Akan terisi setelah pickup dipilih");
    expect(html).toContain(`href="/app/pengaturan/pickup?outlet=${OUTLET_ONE}"`);
    expect(html).not.toContain(`id="pickup-${OUTLET_ONE}"`);
    expect(html).not.toContain('name="defaultPickupAddressId"');
    expect(html).not.toContain("ID alamat pickup");
    expect(html).not.toContain("ID area asal");
    expect(html).not.toContain(SECRET_SENTINEL);
  });

  it("renders many mixed outlets as one URL-addressable list-detail workspace", async () => {
    mocks.outlets = [
      outlet({
        name: "A — Belum siap",
        secretReference: SECRET_SENTINEL,
      }),
      outlet({
        connectionSource: "private",
        connectionStatus: "private_ready",
        connectionUpdatedAt: new Date("2026-09-01T02:00:00.000Z"),
        defaultOriginAreaId: "origin-ready",
        defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
        defaultPickupAddressId: "pickup-ready",
        defaultPickupAddressLabel: "Gudang siap, Jalan Contoh 1",
        id: OUTLET_TWO,
        name: "B — Privat siap",
        readinessStatus: "ready",
        secretReference: SECRET_SENTINEL,
        updatedAt: new Date("2026-09-01T02:00:00.000Z"),
      }),
      outlet({
        connectionSource: "private",
        connectionStatus: "private_attention",
        connectionIssue: "secret_unavailable",
        connectionUpdatedAt: new Date("2026-09-01T03:00:00.000Z"),
        defaultOriginAreaId: "origin-attention",
        defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
        defaultPickupAddressId: "pickup-attention",
        defaultPickupAddressLabel: "Gudang perhatian, Jalan Contoh 2",
        id: OUTLET_THREE,
        name: "C — Privat perlu perhatian",
        readinessStatus: "needs_attention",
        secretReference: SECRET_SENTINEL,
        updatedAt: new Date("2026-09-01T03:00:00.000Z"),
      }),
    ];

    const html = await renderPage();

    expect(occurrences(html, "<form")).toBe(0);
    expect(occurrences(html, 'id="outlet-detail-title"')).toBe(1);
    // The selector marks the active outlet with `aria-current="true"`, not
    // `"page"`. The shell navigation already owns the one truthful current
    // page, and browser screening found two visible `aria-current="page"` in
    // this document at 1280px — this selector and the shell's own nav item.
    // The Administrasi menu (SettingsLayout) marks its own item the same way.
    expect(occurrences(html, 'aria-current="page"')).toBe(0);
    const outletNav = html.match(/<nav[^>]*aria-label="Pilih outlet"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(occurrences(outletNav, 'aria-current="true"')).toBe(1);
    const settingsNav = html.match(/<nav[^>]*aria-label="Menu pengaturan"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(settingsNav.match(/<a[^>]*aria-current="true"[^>]*>/g) ?? []).toHaveLength(1);
    expect(settingsNav).toMatch(/<a[^>]*aria-current="true"[^>]*href="\/app\/pengaturan\/outlet"/);
    expect(occurrences(html, 'aria-current="true"')).toBe(2);
    expect(html).toContain('aria-label="Pilih outlet"');
    expect(html).toContain(`href="/app/pengaturan/outlet?outlet=${OUTLET_TWO}#outlet-detail-title"`);
    expect(html.indexOf("A — Belum siap")).toBeLessThan(
      html.indexOf("C — Privat perlu perhatian"),
    );
    expect(html.indexOf("C — Privat perlu perhatian")).toBeLessThan(
      html.indexOf("B — Privat siap"),
    );
    expect(html).toMatch(/Total outlet<\/dt><dd[^>]*>3<\/dd>/);
    expect(html).toMatch(/Siap dipakai<\/dt><dd[^>]*>1<\/dd>/);
    expect(html).toMatch(/Koneksi privat<\/dt><dd[^>]*>2<\/dd>/);
    expect(html).toMatch(/Perlu dilengkapi<\/dt><dd[^>]*>2<\/dd>/);
    expect(html).not.toContain("API key tersimpan");
    expect(html).not.toContain("API key privat perlu diganti");
    expect(html).not.toContain('name="apiKey"');
    expect(html).not.toContain(SECRET_SENTINEL);
    expect(html).not.toContain("secretReference");
    expect(html).not.toContain("vault://");
  });

  it("selects only a tenant-listed outlet from the URL and safely falls back for foreign input", async () => {
    mocks.outlets = [
      outlet({ name: "A — Belum siap" }),
      outlet({
        connectionSource: "private",
        connectionStatus: "private_ready",
        connectionUpdatedAt: new Date("2026-09-01T02:00:00.000Z"),
        defaultOriginAreaId: "origin-ready",
        defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
        defaultPickupAddressId: "pickup-ready",
        defaultPickupAddressLabel: "Gudang siap, Jalan Contoh 1",
        id: OUTLET_TWO,
        name: "B — Privat siap",
        readinessStatus: "ready",
      }),
    ];

    const selected = await renderPage(OUTLET_TWO);
    expect(selected).toContain("B — Privat siap");
    expect(selected).toContain("Akun sendiri");
    expect(selected).toMatch(new RegExp(`aria-current="true"[^>]*href="/app/pengaturan/outlet\\?outlet=${OUTLET_TWO}`));
    // The Outlet page carries no form at all after T-158's split.
    expect(occurrences(selected, "<form")).toBe(0);

    const fallback = await renderPage("00000000-0000-4000-8000-999999999999");
    expect(fallback).toContain("A — Belum siap");
    expect(fallback).toContain("Default GeraiCUAN");
    expect(occurrences(fallback, "<form")).toBe(0);
  });

  it("states the saved pickup pair read-only, with no second editor on this page", async () => {
    mocks.outlets = [outlet({
      defaultOriginAreaId: "origin-safe-preserved",
      defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
      defaultPickupAddressId: "pickup-safe-preserved",
      defaultPickupAddressLabel: "Gudang utama, Jalan Contoh 1",
    })];

    const html = await renderPage();

    expect(html).toContain("Gudang utama, Jalan Contoh 1");
    expect(html).toContain("Coblong, Kota Bandung, Jawa Barat");
    expect(html).toContain("Kelola titik pickup");
    // Nothing on this page can change the pair, so no save control exists.
    expect(html).not.toContain("Simpan lokasi");
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain(SECRET_SENTINEL);
  });

  it("keeps credential handling off the Outlet page entirely", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/app/pengaturan/outlet-detail.tsx"),
      "utf8",
    );

    // T-158: the credential workflow belongs to /app/pengaturan/koneksi, so
    // nothing on this page may read, show, or submit an API key.
    expect(source).not.toMatch(/apiKey|type="password"|savePrivateMengantarCredential/);
    expect(source).not.toMatch(/baseURL|baseUrl|secretReference|ciphertext|apiKeyFragment/);
    expect(source).toContain("/app/pengaturan/koneksi?outlet=");
  });

  it("keeps the outlet form mounted when the connection source changes", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/app/pengaturan/outlet/page.tsx"),
      "utf8",
    );

    expect(source).toContain("key={activeOutlet.id}");
    expect(source).not.toContain("outlet.id}:${outlet.connectionSource");
  });
});

describe("Outlet settings route boundaries", () => {
  it("keeps loading semantics local to the page", async () => {
    const { default: OutletSettingsLoading } = await import(
      "@/app/app/pengaturan/outlet/loading"
    );
    const html = renderToStaticMarkup(createElement(OutletSettingsLoading));

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Memuat pengaturan outlet"');
    expect(html).toContain('aria-label="Memuat ringkasan kesiapan outlet"');
  });

  it("renders a sanitized focusable route error with retry and escape actions", async () => {
    const { default: OutletSettingsError } = await import("@/app/app/pengaturan/outlet/error");
    const html = renderToStaticMarkup(createElement(OutletSettingsError, {
      reset: vi.fn(),
    }));

    expect(html).toContain('role="alert"');
    expect(html).toMatch(/tabindex="-1">Pengaturan outlet belum dapat dimuat/);
    expect(html).toContain("Pengaturan outlet belum dapat dimuat");
    expect(html).toContain("Coba lagi");
    expect(html).toContain('href="/app"');
    expect(html).not.toContain(SECRET_SENTINEL);
    expect(html).not.toContain("route failure");
  });
});
