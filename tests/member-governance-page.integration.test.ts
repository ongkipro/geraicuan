import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "00000000-0000-4000-8000-000000000461";
const ADMIN_MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000462";
const OPERATOR_MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000463";
const INACTIVE_MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000464";
const SECRET_SENTINEL = "session://t46/private-token-must-not-reach-html";

const errors = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
}));

const mocks = vi.hoisted(() => ({
  actionState: {} as Record<string, unknown>,
  auditScenario: null as string | null,
  authorizationDenied: false,
  contextCalls: 0,
  listCalls: 0,
  members: [] as Array<Record<string, unknown>>,
  pending: false,
  principal: {
    role: "TENANT_ADMIN" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as "platform" | "tenant",
    tenantId: "00000000-0000-4000-8000-000000000461",
    userId: "admin-user",
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: vi.fn(() => [mocks.actionState, vi.fn(), mocks.pending]),
  };
});

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(
    mocks.auditScenario ? { "x-geraicuan-ui-audit": mocks.auditScenario } : {},
  )),
}));

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

vi.mock("@/db/member-governance-repository", () => ({
  listTenantMembers: vi.fn(async () => {
    mocks.listCalls += 1;
    return mocks.members;
  }),
}));

vi.mock("@/app/app/anggota/actions", () => ({
  changeMemberRoleAction: vi.fn(async () => ({})),
  deactivateMemberAction: vi.fn(async () => ({})),
  inviteMemberAction: vi.fn(async () => ({})),
}));

function member(overrides: Record<string, unknown> = {}) {
  return {
    email: "admin@example.com",
    id: ADMIN_MEMBERSHIP_ID,
    name: "Ayu Admin",
    role: "TENANT_ADMIN",
    status: "ACTIVE",
    updatedAt: new Date("2026-09-01T01:00:00.000Z"),
    userId: "admin-user",
    ...overrides,
  };
}

async function renderPage() {
  const { default: TenantMembersPage } = await import("@/app/app/anggota/page");
  return renderToStaticMarkup(await TenantMembersPage());
}

function occurrences(markup: string, value: string) {
  return markup.split(value).length - 1;
}

beforeEach(() => {
  mocks.actionState = {};
  mocks.auditScenario = null;
  mocks.authorizationDenied = false;
  mocks.contextCalls = 0;
  mocks.listCalls = 0;
  mocks.members = [];
  mocks.pending = false;
  mocks.principal = {
    role: "TENANT_ADMIN",
    scope: "tenant",
    tenantId: TENANT_ID,
    userId: "admin-user",
  };
});

describe("Member governance page acceptance", () => {
  it("redirects an unauthenticated request before entering tenant context or listing members", async () => {
    mocks.authorizationDenied = true;
    const { default: TenantMembersPage } = await import("@/app/app/anggota/page");

    await expect(TenantMembersPage()).rejects.toThrow("REDIRECT:/login/tenant");
    expect(mocks.contextCalls).toBe(0);
    expect(mocks.listCalls).toBe(0);
  });

  it.each([
    ["OPERATOR", "tenant", "/app"],
    ["TENANT_ADMIN", "platform", "/login/tenant"],
  ] as const)(
    "redirects a %s/%s principal before the protected member read",
    async (role, scope, destination) => {
      mocks.principal.role = role;
      mocks.principal.scope = scope;
      const { default: TenantMembersPage } = await import("@/app/app/anggota/page");

      await expect(TenantMembersPage()).rejects.toThrow(`REDIRECT:${destination}`);
      expect(mocks.contextCalls).toBe(0);
      expect(mocks.listCalls).toBe(0);
    },
  );

  it("renders the single-admin state with truthful counts and an explicit last-admin warning", async () => {
    mocks.members = [member()];

    const html = await renderPage();

    expect(html).toContain("Ayu Admin (Anda)");
    expect(html).toMatch(/Total anggota<\/dt><dd[^>]*>1<\/dd>/);
    expect(html).toMatch(/Aktif<\/dt><dd[^>]*>1<\/dd>/);
    expect(html).toMatch(/Tenant Admin aktif<\/dt><dd[^>]*>1<\/dd>/);
    expect(html).toMatch(/(?:satu-satunya|terakhir)[^<]*Tenant Admin|Tenant Admin[^<]*(?:satu-satunya|terakhir)/i);
    expect(html).toContain("Tenant Admin aktif terakhir");
    expect(html).not.toContain("Simpan peran");
    expect(html).not.toContain("Nonaktifkan anggota");
  });

  it("renders populated and inactive members in stable order with actions only for an active peer", async () => {
    mocks.members = [
      member(),
      member({
        email: "bima@example.com",
        id: OPERATOR_MEMBERSHIP_ID,
        name: "Bima Operator",
        role: "OPERATOR",
        userId: "operator-user",
      }),
      member({
        email: "citra@example.com",
        id: INACTIVE_MEMBERSHIP_ID,
        name: "Citra Nonaktif",
        role: "OPERATOR",
        status: "SUSPENDED",
        userId: "inactive-user",
      }),
    ];

    const html = await renderPage();

    expect(html.indexOf("Ayu Admin")).toBeLessThan(html.indexOf("Bima Operator"));
    expect(html.indexOf("Bima Operator")).toBeLessThan(html.indexOf("Citra Nonaktif"));
    expect(html).toMatch(/Total anggota<\/dt><dd[^>]*>3<\/dd>/);
    expect(html).toMatch(/Aktif<\/dt><dd[^>]*>2<\/dd>/);
    expect(html).toContain("Anggota nonaktif tidak dapat memakai CMS tenant");
    expect(occurrences(html, "Kelola akses")).toBe(1);
    expect(html).not.toContain(SECRET_SENTINEL);
  });

  it("preserves safe invite values and exposes a focusable validation result", async () => {
    mocks.members = [member()];
    mocks.actionState = {
      errors: { email: "Masukkan email akun GeraiCUAN yang valid." },
      message: "Periksa kembali undangan yang ditandai.",
      nextAttemptId: "00000000-0000-4000-8000-000000000465",
      resultToken: "00000000-0000-4000-8000-000000000466",
      status: "error",
      values: { email: "safe-preserved@example.com", role: "TENANT_ADMIN" },
    };

    const html = await renderPage();

    expect(html).toMatch(/name="email"[^>]*value="safe-preserved@example.com"/);
    expect(html).toMatch(/name="role"[^>]*>.*option value="TENANT_ADMIN" selected=""/);
    expect(html).toContain('aria-describedby="member-invite-email-error"');
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/tabindex="-1"[^>]*>[\s\S]*Tindakan belum selesai/);
    expect(html).not.toContain(SECRET_SENTINEL);
  });

  it("renders pending feedback and a disabled truthful submit control", async () => {
    mocks.members = [member()];
    mocks.pending = true;

    const html = await renderPage();

    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Memproses undangan…<\/button>/);
  });

  it("renders a focusable success result without exposing private repository fields", async () => {
    mocks.members = [member({
      authSession: SECRET_SENTINEL,
      passwordHash: SECRET_SENTINEL,
      providerToken: SECRET_SENTINEL,
    })];
    mocks.actionState = {
      message: "Bima Operator ditambahkan sebagai Operator.",
      nextAttemptId: "00000000-0000-4000-8000-000000000467",
      resultToken: "00000000-0000-4000-8000-000000000468",
      status: "success",
    };

    const html = await renderPage();

    expect(html).toContain('role="status"');
    expect(html).toMatch(/tabindex="-1"[^>]*>[\s\S]*Perubahan tersimpan/);
    expect(html).not.toContain(SECRET_SENTINEL);
    expect(html).not.toContain("passwordHash");
    expect(html).not.toContain("providerToken");
    expect(html).not.toContain("authSession");
  });
});

describe("Member governance interaction and route-boundary contracts", () => {
  it("keeps peer actions compact, confirms destructive writes in a dialog, and restores deterministic focus", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/app/anggota/member-governance-forms.tsx"),
      "utf8",
    );

    expect(source).toContain("@/components/ui/collapsible");
    expect(source).toContain("<Collapsible");
    expect(source).toContain("<CollapsibleTrigger asChild>");
    expect(source).toContain("<CollapsibleContent");
    expect(source).toContain("onOpenChange={setExpanded}");
    expect(source).toContain("open={expanded}");
    expect(source).toContain("setExpanded(true)");
    expect(source).not.toContain("open={expanded || hasResult}");
    expect(source).not.toContain("onToggle=");
    expect(source).toContain("Kelola akses");
    expect(source).toContain("@/components/ui/alert-dialog");
    expect(source).toContain("AlertDialog");
    expect(source).toContain("resultToken");
    expect(source).toContain("nextAttemptId");
    expect(source).toContain("open={roleDialogOpen}");
    expect(source).toContain("open={deactivateDialogOpen}");
    expect(source).toContain("onCloseAutoFocus");
    expect(source).toContain("Menyimpan…");
    expect(source).toContain("Menonaktifkan…");
    expect(source).not.toContain("AlertDialogAction");
    expect(source).toMatch(/useEffect/);
    expect(source).toMatch(/useRef/);
    expect(source).toMatch(/\.focus\(\)/);
  });

  it("keeps loading semantics local to the member page", async () => {
    const { default: TenantMembersLoading } = await import("@/app/app/anggota/loading");
    const html = renderToStaticMarkup(createElement(TenantMembersLoading));

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Memuat ringkasan anggota"');
    expect(html).toContain('aria-label="Memuat daftar anggota"');
  });

  it("renders a sanitized focusable route error with retry and escape actions", async () => {
    const { default: TenantMembersError } = await import("@/app/app/anggota/error");
    const html = renderToStaticMarkup(createElement(TenantMembersError, {
      reset: vi.fn(),
    }));

    expect(html).toContain('role="alert"');
    expect(html).toMatch(/tabindex="-1"[^>]*>[\s\S]*Pengelolaan anggota belum dapat dimuat/);
    expect(html).toContain("Coba lagi");
    expect(html).toContain('href="/app"');
    expect(html).not.toContain(SECRET_SENTINEL);
    expect(html).not.toContain("route failure");
  });
});
