import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { administrationNavigation } from "@/app/app/pengaturan/settings-nav";

const TENANT_ID = "00000000-0000-4000-8000-000000000451";
const SECRET_SENTINEL = "vault://t156/credential-fragment-must-stay-server-side";

const errors = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
}));

const actionMocks = vi.hoisted(() => ({
  saveShipmentPrefix: vi.fn(async () => ({})),
}));

const prefixState = vi.hoisted(() => ({
  value: { prefix: "GC", lockedAt: null as Date | null, tenantName: "Toko Kopi Pagi" },
}));

const mocks = vi.hoisted(() => ({
  authorizationDenied: false,
  contextCalls: 0,
  prefixCalls: 0,
  prefixFormState: {} as Record<string, unknown>,
  principal: {
    role: "TENANT_ADMIN" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as "platform" | "tenant",
    tenantId: "00000000-0000-4000-8000-000000000451",
    userId: "profile-admin",
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: vi.fn(() => [mocks.prefixFormState, vi.fn(), false]),
  };
});

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("@/db/client", () => ({ db: {} }));

vi.mock("@/db/shipment-number-repository", () => ({
  loadTenantShipmentPrefix: vi.fn(async () => {
    mocks.prefixCalls += 1;
    return prefixState.value;
  }),
}));

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

vi.mock("@/app/app/pengaturan/actions", () => actionMocks);

async function renderPage() {
  const { default: TenantProfileSettingsPage } = await import("@/app/app/pengaturan/page");
  return renderToStaticMarkup(await TenantProfileSettingsPage({}));
}

function occurrences(markup: string, value: string) {
  return markup.split(value).length - 1;
}

beforeEach(() => {
  mocks.authorizationDenied = false;
  mocks.contextCalls = 0;
  mocks.prefixCalls = 0;
  mocks.prefixFormState = {};
  mocks.principal = {
    role: "TENANT_ADMIN",
    scope: "tenant",
    tenantId: TENANT_ID,
    userId: "profile-admin",
  };
  prefixState.value = { prefix: "GC", lockedAt: null, tenantName: "Toko Kopi Pagi" };
});

describe("PR-46 Profil gerai page", () => {
  it("redirects an unauthenticated request before entering tenant context", async () => {
    mocks.authorizationDenied = true;
    const { default: TenantProfileSettingsPage } = await import("@/app/app/pengaturan/page");

    await expect(TenantProfileSettingsPage({})).rejects.toThrow("REDIRECT:/login/tenant");
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.prefixCalls).toBe(0);
  });

  it.each([
    ["OPERATOR", "tenant", "/app"],
    ["TENANT_ADMIN", "platform", "/login/tenant"],
  ] as const)(
    "redirects a %s/%s principal before protected profile reads",
    async (role, scope, destination) => {
      mocks.principal.role = role;
      mocks.principal.scope = scope;
      const { default: TenantProfileSettingsPage } = await import("@/app/app/pengaturan/page");

      await expect(TenantProfileSettingsPage({})).rejects.toThrow(`REDIRECT:${destination}`);
      expect(mocks.contextCalls).toBe(0);
      expect(mocks.prefixCalls).toBe(0);
    },
  );

  it("shows the tenant name as read-only text, never an editable field", async () => {
    const html = await renderPage();

    expect(html).toContain("Toko Kopi Pagi");
    expect(html).toContain("Hubungi Super Admin");
    // No input, textarea or submit binds the tenant name on this page.
    expect(html).not.toMatch(/<input[^>]*name="(?:name|tenantName)"/);
    expect(html).not.toContain("Simpan nama gerai");
    expect(html).not.toContain(SECRET_SENTINEL);
  });

  it("states the fixed id-ID and WIB basis every displayed date uses", async () => {
    const html = await renderPage();

    expect(html).toContain("id-ID");
    expect(html).toContain("Asia/Jakarta");
    expect(html).toContain("WIB");
    expect(html).toContain("Tetap untuk semua tenant, tidak dapat diubah.");
  });

  it("carries the shipment prefix card with its one-time confirmation contract", async () => {
    const html = await renderPage();

    expect(html).toMatch(/<h2[^>]*id="shipment-prefix-title"[^>]*>Awalan nomor kiriman<\/h2>/);
    expect(html).toMatch(/<input[^>]*id="shipment-prefix"[^>]*value="TKP"/);
    expect(html).toContain("TKP-10013");
    expect(html).toContain("Simpan dan kunci awalan");
    expect(html).toContain("Hanya dapat diatur sekali");
    // The submit lives in the card footer and still drives the prefix form.
    expect(html).toMatch(/<button[^>]*form="shipment-prefix-form"[^>]*type="submit"/);
  });

  it("shows a locked prefix read-only with no editable field", async () => {
    prefixState.value = {
      prefix: "TKP",
      lockedAt: new Date("2026-09-15T03:00:00.000Z"),
      tenantName: "Toko Kopi Pagi",
    };
    const html = await renderPage();

    expect(html).toContain("Awalan terkunci");
    expect(html).toContain("TKP-10013");
    expect(html).not.toContain('id="shipment-prefix"');
    expect(html).not.toContain("Simpan dan kunci awalan");
  });

  it("renders the settings menu in PR-46 order and marks Profil gerai current", async () => {
    const html = await renderPage();
    const menu = html.match(/<nav[^>]*aria-label="Menu pengaturan"[\s\S]*?<\/nav>/)?.[0] ?? "";

    expect(menu).toBeTruthy();
    expect([...menu.matchAll(/href="([^"]+)"/g)].map(([, href]) => href))
      .toEqual(administrationNavigation.map(({ href }) => href));
    for (const { description, label } of administrationNavigation) {
      expect(menu).toContain(label.replace(/&/g, "&amp;"));
      expect(menu).toContain(description);
    }
    expect(menu.match(/<a[^>]*aria-current="true"[^>]*>/g) ?? []).toHaveLength(1);
    expect(menu).toMatch(/<a[^>]*aria-current="true"[^>]*href="\/app\/pengaturan"/);
    // The shell sidebar still owns the single page-level current destination.
    expect(occurrences(html, 'aria-current="page"')).toBe(0);
  });

  it("sends a legacy ?outlet= link to the page that owns the outlet", async () => {
    const { default: TenantProfileSettingsPage } = await import("@/app/app/pengaturan/page");

    await expect(TenantProfileSettingsPage({
      searchParams: Promise.resolve({ outlet: "79000000-0000-4000-8000-000000000004" }),
    })).rejects.toThrow(
      "REDIRECT:/app/pengaturan/outlet?outlet=79000000-0000-4000-8000-000000000004",
    );
    // The redirect happens before any tenant read: no prefix is loaded for it.
    expect(mocks.prefixCalls).toBe(0);
  });

  it("opens the index with the full menu and no back link", async () => {
    const html = await renderPage();
    const menu = html.match(/<nav[^>]*aria-label="Menu pengaturan"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(menu).toContain('href="/app/pengaturan"');
    expect(html).not.toContain('aria-label="Kembali ke Pengaturan"');
    expect(html.match(/<aside[^>]*>/)?.[0]).not.toContain("max-lg:hidden");
  });
});

describe("Profil gerai route boundaries", () => {
  it("keeps loading semantics local to the page", async () => {
    const { default: TenantProfileSettingsLoading } = await import(
      "@/app/app/pengaturan/loading"
    );
    const html = renderToStaticMarkup(createElement(TenantProfileSettingsLoading));

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Memuat profil gerai"');
    expect(html).toContain("Profil gerai");
  });

  it("renders a sanitized focusable route error with retry and escape actions", async () => {
    const { default: TenantProfileSettingsError } = await import("@/app/app/pengaturan/error");
    const html = renderToStaticMarkup(createElement(TenantProfileSettingsError, {
      reset: vi.fn(),
    }));

    expect(html).toContain('role="alert"');
    expect(html).toMatch(/tabindex="-1">Profil gerai belum dapat dimuat/);
    expect(html).toContain("Coba lagi");
    expect(html).toContain('href="/app"');
    expect(html).not.toContain(SECRET_SENTINEL);
    expect(html).not.toContain("route failure");
  });
});
