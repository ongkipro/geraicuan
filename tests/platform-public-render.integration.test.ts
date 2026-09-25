import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PlatformHealth, TenantUsageRow } from "@/db/platform-monitoring-repository";
import type { PlatformFilters } from "@/lib/platform-monitoring-filters";

/**
 * T-218 (UI v3): platform pages and the public/auth pages — pure logic and key markup. No
 * database: the server actions are replaced, so only rendering and wiring are exercised.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/app/verifikasi-email/actions", () => ({ confirmEmailVerification: vi.fn(), resendVerificationEmail: vi.fn() }));
vi.mock("@/app/daftar/actions", () => ({ registerStore: vi.fn() }));
vi.mock("@/app/lupa-password/actions", () => ({ requestPasswordReset: vi.fn() }));
vi.mock("@/app/atur-ulang-password/actions", () => ({ resetPassword: vi.fn() }));
vi.mock("@/app/platform/tenant/actions", () => ({ submitPlatformTenantLifecycle: vi.fn() }));
vi.mock("@/app/platform/tenant/shipment-prefix-actions", () => ({ unlockShipmentPrefix: vi.fn() }));
vi.mock("@/app/platform/pendaftaran/actions", () => ({ reviewRegistration: vi.fn() }));

const { demoPassword, resolveLoginNotice } = await import("@/app/login/_components/login-notices");
const { AuthShell } = await import("@/app/login/_components/auth-shell");
const { LoginForm } = await import("@/app/login/_components/login-form");
const { RegistrationForm } = await import("@/app/daftar/registration-form");
const { PasswordResetForm } = await import("@/app/atur-ulang-password/reset-form");
const { attentionItems, filtersChanged, registrationDecisions } = await import("@/app/platform/_components/platform-logic");
const { auditActor, formatSeconds, formatWib, severityBadge, tenantStatusChange } = await import("@/app/platform/_components/platform-format");
const { PlatformPagination } = await import("@/app/platform/_components/platform-ui");
const { TenantLifecycle } = await import("@/app/platform/tenant/_components/tenant-lifecycle");
const { RegistrationReview } = await import("@/app/platform/pendaftaran/_components/registration-review");

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const filledPrimaries = (html: string) => (html.match(/data-variant="default"/g) ?? []).length;

describe("login notices and the demo hint", () => {
  it("honours only the notices each surface knows and maps a failed verification link", () => {
    expect(resolveLoginNotice("tenant", { notice: "session-required" })).toBe("session-required");
    expect(resolveLoginNotice("tenant", { notice: ["kata-sandi-diperbarui", "x"] })).toBe("kata-sandi-diperbarui");
    expect(resolveLoginNotice("tenant", { error: "TOKEN_EXPIRED" })).toBe("verifikasi-gagal");
    expect(resolveLoginNotice("tenant", { notice: "<script>" })).toBeUndefined();
    expect(resolveLoginNotice("platform", { notice: "email-terverifikasi" })).toBeUndefined();
    expect(resolveLoginNotice("platform", { error: "TOKEN_EXPIRED" })).toBeUndefined();
    expect(resolveLoginNotice("platform", { notice: "access-unavailable" })).toBe("access-unavailable");
  });

  it("offers the local password only outside production with the hint switched on", () => {
    expect(demoPassword({ DEV_LOCAL_PASSWORD: "x", GERAICUAN_ENABLE_DEMO_LOGIN_HINT: "1", NODE_ENV: "development" })).toBe("x");
    expect(demoPassword({ DEV_LOCAL_PASSWORD: "x", GERAICUAN_ENABLE_DEMO_LOGIN_HINT: "1", NODE_ENV: "production" })).toBeUndefined();
    expect(demoPassword({ DEV_LOCAL_PASSWORD: "x", NODE_ENV: "development" })).toBeUndefined();
    expect(demoPassword({ DEV_LOCAL_PASSWORD: "", GERAICUAN_ENABLE_DEMO_LOGIN_HINT: "1" })).toBeUndefined();
  });
});

describe("public auth markup", () => {
  it("puts the Super Admin login on the dark ground with its own badge", () => {
    const html = render(createElement(AuthShell, { surface: "platform", title: "Masuk Super Admin" } as ComponentProps<typeof AuthShell>, createElement(LoginForm, { destination: "/platform" })));
    expect(html).toContain('data-surface="platform"');
    expect(html).toContain("bg-foreground");
    expect(html).toContain("Khusus Super Admin");
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
  });

  it("keeps the sign-in contract: named 48px fields, minimum 8, a password toggle, one primary", () => {
    const html = render(createElement(LoginForm, { destination: "/app", initialNotice: "session-required" }));
    expect(html).toMatch(/id="email"[^>]*name="email"|name="email"[^>]*id="email"/);
    expect(html).toMatch(/minLength="8"/);
    expect(html).toContain('aria-label="Tampilkan kata sandi"');
    expect(html).toContain("h-12");
    expect(html).toContain('role="status"');
    expect(html).toContain("Silakan masuk");
    expect(filledPrimaries(html)).toBe(1);
  });

  it("renders the demo account only when credentials are passed", () => {
    expect(render(createElement(LoginForm, { destination: "/app" }))).not.toContain("Isi otomatis");
    expect(render(createElement(LoginForm, { demoCredentials: { email: "tenant@geraicuan.com", password: "p" }, destination: "/app" }))).toContain("Isi otomatis");
  });

  it("keeps every registration field name the server action reads", () => {
    const html = render(createElement(RegistrationForm));
    for (const name of ["storeName", "whatsapp", "ownerName", "email", "password", "passwordConfirmation", "terms"]) {
      expect(html, name).toContain(`name="${name}"`);
    }
    expect(filledPrimaries(html)).toBe(1);
  });

  it("shows the expired state instead of the form when the reset link is unusable", () => {
    expect(render(createElement(PasswordResetForm, { token: null }))).toContain("Tautan sudah tidak berlaku");
    const form = render(createElement(PasswordResetForm, { token: "abcdefghijklmnopqrstu" }));
    expect(form).toContain('name="token"');
    expect(form).toContain('name="passwordConfirmation"');
  });
});

const tile = (severity: "normal" | "perhatian" | "kritis", count = 1) => ({ affectedTenants: 1, count, oldestMs: 60_000, severity });
const health = {
  accounts: [],
  failures: { ...tile("perhatian", 3), codes: [], share: 0.05 },
  generatedAt: new Date(),
  latency: { byCourier: [], p50Seconds: 12, p95Seconds: 90 },
  queue: tile("normal", 0),
  unknown: { ...tile("kritis", 2), batches: 1, orders: 1, recoveries: 0 },
  unpaid: { ...tile("normal", 0), recovering: 0 },
} as PlatformHealth;
const usage = (overrides: Partial<TenantUsageRow>): TenantUsageRow => ({
  batches: 0, failed: 0, issued: 0, lastActivityAt: null, members: 1, name: "Gerai", outletConfigured: 1,
  outletTotal: 1, shipments: 0, status: "ACTIVE", tenantId: "t", unknown: 0, unpaid: 0, ...overrides,
});

describe("platform logic", () => {
  it("lists only signals above Normal and tenants with problems, Kritis first", () => {
    const items = attentionItems(health, [
      usage({ name: "Sehat", tenantId: "a" }),
      usage({ name: "Belum bayar", tenantId: "b", unpaid: 2 }),
      usage({ failed: 1, name: "Gagal", tenantId: "c" }),
    ]);
    expect(items.map((item) => item.title)).toEqual(["Status tidak diketahui", "Gagal", "Kegagalan provider", "Belum bayar"]);
    expect(items.find((item) => item.title === "Gagal")?.href).toBe("/platform/tenant/c");
    expect(attentionItems(null, [])).toEqual([]);
  });

  it("treats only the default 30-day window without facets as unfiltered", () => {
    const base = { courier: null, outcome: null, outletId: null, page: 1, query: null, range: { presetId: "30-hari" }, scope: { kind: "global" }, status: null } as unknown as PlatformFilters;
    expect(filtersChanged(base)).toBe(false);
    expect(filtersChanged({ ...base, query: "ge" })).toBe(true);
    expect(filtersChanged({ ...base, range: { ...base.range, presetId: "7-hari" } })).toBe(true);
    expect(filtersChanged({ ...base, scope: { kind: "tenant", tenantId: "x" } })).toBe(true);
  });

  it("keeps successful registration decisions only, newest first, capped", () => {
    const rows = [
      { action: "PLATFORM_MONITORING_VIEWED", outcome: "SUCCESS" },
      { action: "TENANT_REGISTRATION_APPROVED", outcome: "SUCCESS" },
      { action: "TENANT_REGISTRATION_REJECTED", outcome: "DENIED" },
      { action: "TENANT_REGISTRATION_REJECTED", outcome: "SUCCESS" },
    ];
    expect(registrationDecisions(rows).map((row) => row.action)).toEqual(["TENANT_REGISTRATION_APPROVED", "TENANT_REGISTRATION_REJECTED"]);
    expect(registrationDecisions(rows, 1)).toHaveLength(1);
  });

  it("words severities, durations, status changes and actors", () => {
    expect(severityBadge("normal")).toEqual({ label: "Normal", tone: "neutral" });
    expect(severityBadge("kritis").tone).toBe("danger");
    expect(formatSeconds(1.25)).toBe("1,3 detik");
    expect(formatSeconds(null)).toBe("—");
    expect(tenantStatusChange({ fromStatus: null, toStatus: "PROVISIONING" })).toBe("Menjadi Disiapkan");
    expect(tenantStatusChange({ fromStatus: "ACTIVE", toStatus: "SUSPENDED" })).toBe("Aktif → Ditangguhkan");
    expect(tenantStatusChange({ fromStatus: null, toStatus: null })).toBeUndefined();
    expect(auditActor({ action: "TENANT_SELF_REGISTERED", actorRole: "TENANT_MEMBER" })).toBe("Pemilik gerai");
    expect(formatWib(new Date("2026-09-25T03:13:00Z"))).toBe("25 Sep 2026, 10.13 WIB");
  });
});

describe("platform markup", () => {
  it("paginates with plain links and says what is shown", () => {
    const html = render(createElement(PlatformPagination, { hrefForPage: (page: number) => `/platform/audit?halaman=${page}`, label: "Halaman audit", noun: "entri", page: 2, pageSize: 25, total: 60 }));
    expect(html.replace(/<[^>]+>/g, "")).toContain("Menampilkan 26–50 dari 60 entri");
    expect(html).toContain('href="/platform/audit?halaman=1"');
    expect(html).toContain('href="/platform/audit?halaman=3"');
  });

  it("guards suspension behind the typed name and names the tenant; nothing for other statuses", () => {
    const html = render(createElement(TenantLifecycle, { initialAttemptId: "00000000-0000-4000-8000-000000000001", status: "ACTIVE", tenantId: "00000000-0000-4000-8000-000000000002", tenantName: "Sekar Batik" }));
    expect(html).toContain("Zona berbahaya");
    expect(html).toContain('name="confirmationName"');
    expect(html).toContain('name="lifecycleAction" value="suspend"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Tangguhkan tenant/);
    expect(html).toContain("Sekar Batik");
    expect(render(createElement(TenantLifecycle, { initialAttemptId: "a", status: "SUSPENDED", tenantId: "b", tenantName: "X" }))).toContain('value="reactivate"');
    expect(render(createElement(TenantLifecycle, { initialAttemptId: "a", status: "ARCHIVED", tenantId: "b", tenantName: "X" }))).toBe("");
  });

  it("offers approval only to a verified owner and always one outline rejection", () => {
    const verified = render(createElement(RegistrationReview, { emailVerified: true, storeName: "Kopi", tenantId: "t" }));
    const approve = (html: string) => html.match(/<button[^>]*>(?:(?!<\/button>).)*Setujui gerai/)?.[0] ?? "";
    expect(approve(verified)).toContain('data-variant="default"');
    expect(approve(verified)).not.toContain('disabled=""');
    expect(verified).toContain('name="decision" value="APPROVE"');
    const unverified = render(createElement(RegistrationReview, { emailVerified: false, storeName: "Kopi", tenantId: "t" }));
    expect(approve(unverified)).toContain('disabled=""');
    expect(unverified).toContain("setelah pemilik memverifikasi email");
    expect(unverified).toContain("Tolak pendaftaran");
  });
});
