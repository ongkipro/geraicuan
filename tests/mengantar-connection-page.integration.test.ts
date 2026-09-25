import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "00000000-0000-4000-8000-000000000451";
const OUTLET_ONE = "00000000-0000-4000-8000-000000000452";
const SECRET_SENTINEL = "vault://t158/credential-fragment-must-stay-server-side";

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
  const { default: OutletSettingsPage } = await import("@/app/app/pengaturan/koneksi/page");
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

describe("PR-46 Koneksi Mengantar page", () => {
  it("redirects an unauthenticated request before entering tenant context or reading settings", async () => {
    mocks.authorizationDenied = true;
    const { default: ConnectionPage } = await import("@/app/app/pengaturan/koneksi/page");

    await expect(ConnectionPage({})).rejects.toThrow("REDIRECT:/login/tenant");
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.listCalls).toBe(0);
  });

  it.each([
    ["OPERATOR", "tenant", "/app"],
    ["TENANT_ADMIN", "platform", "/login/tenant"],
  ] as const)(
    "redirects a %s/%s principal before protected credential reads",
    async (role, scope, destination) => {
      mocks.principal.role = role;
      mocks.principal.scope = scope;
      const { default: ConnectionPage } = await import("@/app/app/pengaturan/koneksi/page");

      await expect(ConnectionPage({})).rejects.toThrow(`REDIRECT:${destination}`);
      expect(mocks.contextCalls).toBe(0);
      expect(mocks.listCalls).toBe(0);
    },
  );

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

  it("distinguishes the persisted connection source from the draft choice", async () => {
    mocks.outlets = [outlet({
      defaultOriginAreaId: "origin-ready",
      defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
      defaultPickupAddressId: "pickup-ready",
      defaultPickupAddressLabel: "Gudang siap, Jalan Contoh 1",
      readinessStatus: "ready",
    })];

    const html = await renderPage();

    expect(html).toContain('aria-labelledby="outlet-connection-title"');
    expect(occurrences(html, "Digunakan")).toBe(1);
    expect(html).toContain("Akun Mengantar sendiri");
  });

  it("carries no pickup or location editor: those belong to other settings pages", async () => {
    mocks.outlets = [outlet()];

    const html = await renderPage();

    expect(html).not.toContain("Simpan lokasi");
    expect(html).not.toContain('name="defaultPickupAddressId"');
    expect(html).not.toContain("Ringkasan kesiapan outlet");
    expect(html).not.toContain(SECRET_SENTINEL);
  });

  it("keeps the shadcn connection workflow explicit and free of secret-derived UI", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/app/pengaturan/mengantar-connection-form.tsx"),
      "utf8",
    );

    for (const component of ["AlertDialog", "Alert", "Badge", "Button", "Field", "Input", "RadioGroup"]) {
      expect(source).toContain(component);
    }
    expect(source).toContain("Akun Mengantar sendiri");
    expect(source).toContain("Gunakan koneksi bawaan GeraiCUAN untuk {outlet.name}?");
    expect(source).toContain('variant="destructive"');
    expect(source).toContain("Hapus API key & gunakan default");
    expect(source).toContain('key={credentialState.resultToken');
    expect(source).toContain('type="password"');
    expect(source).not.toMatch(/baseURL|baseUrl|secretReference|ciphertext|apiKeyFragment/);
    expect(source).not.toContain("Tersambung");
  });

  it("marks Koneksi Mengantar current in the settings menu", async () => {
    mocks.outlets = [outlet()];
    const html = await renderPage();
    const menu = html.match(/<nav[^>]*aria-label="Menu pengaturan"[\s\S]*?<\/nav>/)?.[0] ?? "";

    expect(menu.match(/<a[^>]*aria-current="true"[^>]*>/g) ?? []).toHaveLength(1);
    expect(menu).toMatch(/<a[^>]*aria-current="true"[^>]*href="\/app\/pengaturan\/koneksi"/);
    expect(occurrences(html, 'aria-current="page"')).toBe(0);
  });
});

describe("Koneksi Mengantar route boundaries", () => {
  it("keeps loading semantics local to the page", async () => {
    const { default: ConnectionLoading } = await import("@/app/app/pengaturan/koneksi/loading");
    const html = renderToStaticMarkup(createElement(ConnectionLoading));

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Memuat koneksi Mengantar"');
    expect(html).not.toContain('aria-label="Memuat ringkasan koneksi outlet"');
  });

  it("renders a sanitized focusable route error with retry and escape actions", async () => {
    const { default: ConnectionError } = await import("@/app/app/pengaturan/koneksi/error");
    const html = renderToStaticMarkup(createElement(ConnectionError, { reset: vi.fn() }));

    expect(html).toContain('role="alert"');
    expect(html).toMatch(/tabindex="-1">Koneksi Mengantar belum dapat dimuat/);
    expect(html).toContain("Coba lagi");
    expect(html).toContain('href="/app"');
    expect(html).not.toContain(SECRET_SENTINEL);
  });
});
