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
  saveOutletSettings: vi.fn(async () => ({})),
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

async function renderPage() {
  const { default: OutletSettingsPage } = await import("@/app/app/pengaturan/page");
  return renderToStaticMarkup(await OutletSettingsPage());
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
    const { default: OutletSettingsPage } = await import("@/app/app/pengaturan/page");

    await expect(OutletSettingsPage()).rejects.toThrow("REDIRECT:/login/tenant");
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
      const { default: OutletSettingsPage } = await import("@/app/app/pengaturan/page");

      await expect(OutletSettingsPage()).rejects.toThrow(`REDIRECT:${destination}`);
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
    expect(html).toContain(`id="pickup-${OUTLET_ONE}"`);
    expect(html).toContain("Akan terisi setelah pickup dipilih");
    expect(html).toContain('name="connectionMode"');
    expect(html).not.toContain("ID alamat pickup");
    expect(html).not.toContain("ID area asal");
    expect(html).not.toContain(SECRET_SENTINEL);
  });

  it("renders many mixed outlets with truthful counts, stable order, and opaque private attention", async () => {
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

    expect(occurrences(html, "<form")).toBe(5);
    expect(html.indexOf("A — Belum siap")).toBeLessThan(
      html.indexOf("C — Privat perlu perhatian"),
    );
    expect(html.indexOf("C — Privat perlu perhatian")).toBeLessThan(
      html.indexOf("B — Privat siap"),
    );
    expect(html).toMatch(/Total outlet<\/dt><dd[^>]*>3<\/dd>/);
    expect(html).toMatch(/Siap dipakai<\/dt><dd[^>]*>1<\/dd>/);
    expect(html).toMatch(/Koneksi privat<\/dt><dd[^>]*>2<\/dd>/);
    expect(html).toMatch(/Default platform<\/dt><dd[^>]*>1<\/dd>/);
    expect(html).toContain("API key tersimpan");
    expect(html).toContain("Tersimpan, belum diverifikasi");
    expect(html).toContain("API key privat perlu diganti");
    expect(html).not.toContain(SECRET_SENTINEL);
    expect(html).not.toContain("secretReference");
    expect(html).not.toContain("vault://");
  });

  it("renders the saved readable selection, described errors, and a focusable result", async () => {
    mocks.outlets = [outlet({
      defaultOriginAreaId: "origin-safe-preserved",
      defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
      defaultPickupAddressId: "pickup-safe-preserved",
      defaultPickupAddressLabel: "Gudang utama, Jalan Contoh 1",
    })];
    mocks.locationState = {
      errors: { defaultPickupAddressId: "Pilihan pickup sudah berubah." },
      message: "Periksa kembali pengaturan yang ditandai.",
      success: false,
      values: {
        connectionMode: "private",
        defaultPickupAddressId: "pickup-safe-preserved",
        outletId: OUTLET_ONE,
      },
    };

    const html = await renderPage();

    expect(html).toMatch(/name="defaultPickupAddressId"[^>]*value="pickup-safe-preserved"/);
    expect(html).toContain(`aria-describedby="pickup-error-${OUTLET_ONE}"`);
    expect(html).toContain("Pilihan pickup sudah berubah.");
    expect(html).toContain("Gudang utama, Jalan Contoh 1");
    expect(html).toContain("Coblong, Kota Bandung, Jawa Barat");
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/tabindex="-1">Lokasi belum tersimpan/);
    expect(html).not.toContain(SECRET_SENTINEL);
  });

  it("renders a pending form as busy with a disabled, truthful submit control", async () => {
    mocks.outlets = [outlet()];
    mocks.locationPending = true;

    const html = await renderPage();

    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Menyimpan lokasi…<\/button>/);
  });

  it("renders a focusable success result and the route that proves drafting readiness", async () => {
    mocks.outlets = [outlet({
      defaultOriginAreaId: "origin-ready",
      defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
      defaultPickupAddressId: "pickup-ready",
      defaultPickupAddressLabel: "Gudang siap, Jalan Contoh 1",
      name: "Outlet Siap",
      readinessStatus: "ready",
    })];
    mocks.locationState = {
      message: "Pengaturan outlet tersimpan.",
      success: true,
    };

    const html = await renderPage();

    expect(html).toContain("Outlet Siap");
    expect(html).toContain("Dapat dipakai untuk membuat kiriman");
    expect(html).toContain('role="status"');
    expect(html).toMatch(/tabindex="-1">Lokasi tersimpan/);
    expect(html).toContain('href="/app/pengiriman/baru"');
    expect(html).toContain("Buat kiriman");
  });

  it("renders a private replacement field blank with a safe stored timestamp", async () => {
    mocks.outlets = [outlet({
      connectionSource: "private",
      connectionStatus: "private_ready",
      connectionUpdatedAt: new Date("2026-09-01T02:00:00.000Z"),
      defaultOriginAreaId: "origin-ready",
      defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
      defaultPickupAddressId: "pickup-ready",
      defaultPickupAddressLabel: "Gudang siap, Jalan Contoh 1",
      readinessStatus: "ready",
    })];

    const html = await renderPage();

    expect(html).toContain("API key tersimpan");
    expect(html).toContain("1 Sep 2026");
    expect(html).toMatch(/<input type="password"[^>]*autoComplete="new-password"[^>]*name="apiKey"/);
    expect(html).not.toMatch(/name="apiKey"[^>]*value=/);
    expect(html).toContain("Ganti API key");
    expect(html).not.toContain("Tersambung");
    expect(html).not.toContain(SECRET_SENTINEL);
  });

  it("keeps the shadcn connection workflow explicit and free of secret-derived UI", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/app/pengaturan/outlet-settings-form.tsx"),
      "utf8",
    );

    for (const component of [
      "AlertDialog", "Alert", "Badge", "Button", "Command", "Field", "Input", "Popover", "RadioGroup",
    ]) {
      expect(source).toContain(component);
    }
    expect(source).toContain("Akun Mengantar sendiri");
    expect(source).toContain("Gunakan Default GeraiCUAN untuk {outlet.name}?");
    expect(source).toContain('variant="destructive"');
    expect(source).toContain("Hapus API key & gunakan default");
    expect(source).toContain('key={credentialState.resultToken');
    expect(source).toContain('type="password"');
    expect(source).not.toMatch(/baseURL|baseUrl|secretReference|ciphertext|apiKeyFragment/);
    expect(source).not.toContain("Tersambung");
  });

  it("keeps the outlet form mounted when the connection source changes", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/app/pengaturan/page.tsx"),
      "utf8",
    );

    expect(source).toContain("key={outlet.id}");
    expect(source).not.toContain("outlet.id}:${outlet.connectionSource");
  });
});

describe("Outlet settings route boundaries", () => {
  it("keeps loading semantics local to the page", async () => {
    const { default: OutletSettingsLoading } = await import(
      "@/app/app/pengaturan/loading"
    );
    const html = renderToStaticMarkup(createElement(OutletSettingsLoading));

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Memuat pengaturan outlet"');
    expect(html).toContain('aria-label="Memuat ringkasan kesiapan outlet"');
  });

  it("renders a sanitized focusable route error with retry and escape actions", async () => {
    const { default: OutletSettingsError } = await import("@/app/app/pengaturan/error");
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
