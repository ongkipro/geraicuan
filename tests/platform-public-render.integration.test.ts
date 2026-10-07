import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PlatformHealth, TenantUsageRow } from "@/db/platform-monitoring-repository";
import type { PlatformFilters } from "@/lib/platform-monitoring-filters";
import { formatAnnouncementAge } from "@/lib/announcements";

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
// T-273: the audit page renders from a fixed view; no database, no monitoring-access write.
const auditView = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/app/platform/_components/platform-view", () => ({ loadPlatformView: async () => auditView.current }));

const { demoPassword, resolveLoginNotice } = await import("@/app/login/_components/login-notices");
const { AuthShell } = await import("@/app/login/_components/auth-shell");
const { LoginForm } = await import("@/app/login/_components/login-form");
const { firstRegistrationError, RegistrationForm, registrationFormData, registrationStepErrors, registrationStepOf } = await import("@/app/daftar/registration-form");
const { PasswordResetForm } = await import("@/app/atur-ulang-password/reset-form");
const { attentionItems, filtersChanged, PLATFORM_HEALTH_CAPTION, platformTrendTotals } = await import("@/app/platform/_components/platform-logic");
const { auditActor, formatAgo, formatSeconds, formatWib, severityBadge, tenantStatusChange } = await import("@/app/platform/_components/platform-format");
const { AuditFeed, PlatformPagination, TimeCell } = await import("@/app/platform/_components/platform-ui");
const { FilterSelect } = await import("@/app/platform/_components/filter-select");
const { StatStrip } = await import("@/components/app/stat-strip");
const { auditActionLabel, auditActionOptions } = await import("@/lib/labels/audit");
const { auditEventActions } = await import("@/db/schema");
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
    const html = render(createElement(AuthShell, { surface: "platform", title: "Masuk Admin Platform" } as ComponentProps<typeof AuthShell>, createElement(LoginForm, { destination: "/platform" })));
    expect(html).toContain('data-surface="platform"');
    expect(html).toContain("bg-foreground");
    expect(html).toContain("Khusus tim GeraiCUAN");
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
    for (const name of ["storeName", "whatsapp", "ownerName", "email", "password", "passwordConfirmation", "shipmentPrefix", "terms"]) {
      expect(html, name).toContain(`name="${name}"`);
    }
    expect(filledPrimaries(html)).toBe(1);
  });

  it("T-225: renders three steps with only Akun visible, a stepper and one Lanjut primary", () => {
    const html = render(createElement(RegistrationForm));
    expect(html).toContain('data-slot="registration-stepper"');
    expect(html).toMatch(/aria-current="step"[^>]*>.*?Akun/);
    expect(html).toMatch(/<fieldset[^>]*data-step="0"(?![^>]*hidden)/);
    expect(html).toMatch(/<fieldset[^>]*data-step="1"[^>]*hidden/);
    expect(html).toMatch(/<fieldset[^>]*data-step="2"[^>]*hidden/);
    expect(html).toContain(">Lanjut</button>");
    expect(html).not.toContain("Kembali");
    expect(html).not.toContain("Daftar gratis");
    for (const [id, autocomplete] of [["email", "email"], ["password", "new-password"], ["storeName", "organization"], ["ownerName", "name"], ["whatsapp", "tel"], ["shipmentPrefix", "off"]]) {
      expect(html, id).toMatch(new RegExp(`autoComplete="${autocomplete}"[^>]*id="${id}"|id="${id}"[^>]*autoComplete="${autocomplete}"`));
    }
    // Empty gerai name: the prefix starts at the default, with the live example.
    expect(html).toContain('maxLength="3"');
    expect(html).toContain(">GC-10001</span>");
    expect(html).toContain(">INV-GC-10001</span>");
  });

  it("T-225: each step checks the server's own rules for its fields only, and errors map to their step", () => {
    const values = { email: "", ownerName: "", password: "", passwordConfirmation: "", storeName: "", terms: false, whatsapp: "" };
    expect(Object.keys(registrationStepErrors(values, "GC", [0])).sort()).toEqual(["email", "password", "passwordConfirmation"]);
    expect(Object.keys(registrationStepErrors(values, "GC", [1])).sort()).toEqual(["ownerName", "storeName", "whatsapp"]);
    expect(registrationStepErrors(values, "GC", [2])).toEqual({ terms: "Centang persetujuan syarat penggunaan untuk melanjutkan." });
    expect(registrationStepErrors(values, "ABCD", [2])).toMatchObject({ shipmentPrefix: "Isi awalan 2–3 huruf atau angka, misalnya PHI atau A29." });
    const filled = { email: "Pemilik@Gerai.com", ownerName: "Ibu Sari", password: "rahasia-aman", passwordConfirmation: "rahasia-aman", storeName: "Sekar Batik Nusantara", terms: true, whatsapp: "0812 3456 7890" };
    expect(registrationStepErrors(filled, "SBN", [0, 1, 2])).toEqual({});
    expect(registrationStepErrors({ ...filled, passwordConfirmation: "lain" }, "SBN", [1, 2])).toEqual({});
    expect(registrationFormData(filled, "SBN").get("terms")).toBe("setuju");
    expect(registrationFormData({ ...filled, terms: false }, "SBN").get("terms")).toBeNull();
    expect(firstRegistrationError({ shipmentPrefix: "x", storeName: "y" })).toBe("storeName");
    expect(firstRegistrationError({})).toBeNull();
    expect(["email", "passwordConfirmation", "whatsapp", "shipmentPrefix", "terms"].map((field) => registrationStepOf(field as never))).toEqual([0, 0, 1, 2, 2]);
  });

  it("T-225: Masuk and Daftar add the desktop visual panel; other auth pages and phones get only the card", () => {
    const tenant = render(createElement(AuthShell, { surface: "tenant", title: "Masuk ke gerai Anda", visual: true } as ComponentProps<typeof AuthShell>, createElement("p", null, "form")));
    expect(tenant).toContain('data-slot="auth-visual"');
    expect(tenant).toMatch(/class="[^"]*hidden[^"]*lg:flex[^"]*bg-primary/);
    for (const core of ["Kirim", "Cetak resi", "Invoice", "Gratis"]) expect(tenant, core).toContain(core);
    expect(tenant).not.toMatch(/gratis selamanya/i);
    // No stock imagery: the only images are the owner's brand logo files (2026-09-26).
    expect([...tenant.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]).every((src) => src.startsWith("/brand/"))).toBe(true);
    const platform = render(createElement(AuthShell, { surface: "platform", title: "Masuk Admin Platform", visual: true } as ComponentProps<typeof AuthShell>, createElement("p", null, "form")));
    expect(platform).toContain("Khusus tim GeraiCUAN");
    expect(platform).not.toContain(">Gratis<");
    expect(platform).toMatch(/data-surface="platform"/);
    expect(render(createElement(AuthShell, { surface: "tenant", title: "Lupa kata sandi" } as ComponentProps<typeof AuthShell>, createElement("p", null, "form")))).not.toContain('data-slot="auth-visual"');
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
  failures: { ...tile("perhatian", 3), codes: [], share: 0.05, submissions: 60 },
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

  it("words severities, durations, status changes and actors", () => {
    expect(severityBadge("normal")).toEqual({ label: "Normal", tone: "neutral" });
    expect(severityBadge("kritis").tone).toBe("danger");
    expect(formatSeconds(1.25)).toBe("1,3 detik");
    // Spec 19 OPS-BATCH-DURATION / T-92: below a minute in seconds, never "0 menit".
    expect(formatSeconds(45)).toBe("45 detik");
    expect(formatSeconds(60)).toBe("1 menit");
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
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Tangguhkan gerai/);
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

describe("T-257 platform alignment", () => {
  const now = new Date("2026-09-26T16:00:00Z");

  it("says how long ago on the page's clock, then leaves it to the date", () => {
    expect(formatAgo(new Date(now.getTime() - 30_000), now)).toBe("baru saja");
    // T-289 (QA L13): seconds of skew still read as just now; a future time falls back to the date.
    expect(formatAgo(new Date(now.getTime() + 30_000), now)).toBe("baru saja");
    expect(formatAgo(new Date(now.getTime() + 2 * 60 * 60_000), now)).toBeNull();
    expect(formatAgo(new Date(now.getTime() - 59 * 60_000), now)).toBe("59 menit lalu");
    expect(formatAgo(new Date(now.getTime() - 60 * 60_000), now)).toBe("1 jam lalu");
    // One wording app-wide: past 24 hours the WIB calendar day decides, as on Info terbaru.
    expect(formatAgo(new Date(now.getTime() - 25 * 3_600_000), now)).toBe("kemarin");
    for (const hoursAgo of [0.5, 5, 25, 49, 24 * 6]) {
      const instant = new Date(now.getTime() - hoursAgo * 3_600_000);
      expect(formatAnnouncementAge(instant, now).toLowerCase()).toBe(formatAgo(instant, now));
    }
    expect(formatAgo(new Date(now.getTime() - 29 * 86_400_000), now)).toBe("29 hari lalu");
    expect(formatAgo(new Date(now.getTime() - 30 * 86_400_000), now)).toBeNull();
  });

  it("words every audit action without its actor or code, sorted for the Aksi filter", () => {
    expect(auditActionLabel("TENANT_SUSPENDED")).toBe("Menangguhkan gerai");
    expect(auditActionLabel("SOMETHING_NEW")).toBe("Aktivitas lain");
    const options = auditActionOptions();
    expect(options.map((option) => option.value).sort()).toEqual([...auditEventActions].sort());
    for (const option of options) {
      expect(option.label).toMatch(/^[A-Z][a-z]/);
      expect(option.label).not.toMatch(/[A-Z]{2,}_|Admin platform|Tenant/);
    }
    expect(options.map((option) => option.label)).toEqual([...options.map((option) => option.label)].sort((a, b) => a.localeCompare(b, "id-ID")));
  });

  it("sums the trend buckets for the legend totals (PLT-TREND-TOTALS)", () => {
    expect(platformTrendTotals([{ created: 2, issued: 1 }, { created: 3, issued: 0 }])).toEqual({ created: 5, issued: 1 });
    expect(platformTrendTotals([])).toEqual({ created: 0, issued: 0 });
  });

  it("counts the new facets as filters for Hapus filter", () => {
    const base = { courier: null, outcome: null, outletId: null, page: 1, query: null, range: { presetId: "30-hari" }, scope: { kind: "global" }, status: null } as unknown as PlatformFilters;
    expect(filtersChanged({ ...base, action: "TENANT_CREATED" })).toBe(true);
    expect(filtersChanged({ ...base, tenantStatus: "SUSPENDED" })).toBe(true);
    expect(filtersChanged({ ...base, action: null, tenantStatus: null })).toBe(false);
  });

  it("renders a stat strip as labelled dt/dd pairs with metric IDs, the odd last cell spanning", () => {
    const html = render(createElement(StatStrip, {
      items: [
        { key: "a", label: "Antrean pengajuan", metric: "OPS-QUEUE-STUCK", note: "Terlama 5 menit", value: "1" },
        { key: "b", label: "Kegagalan provider", metric: "OPS-FAILURE-COUNT", value: "6" },
        { key: "c", label: "Durasi penyelesaian", metric: "OPS-BATCH-DURATION", value: "5 menit" },
      ],
      label: "Kesehatan platform",
    }));
    expect(html).toMatch(/aria-label="Kesehatan platform"[^>]*role="group"|role="group"[^>]*aria-label="Kesehatan platform"/);
    expect(html).toMatch(/<dt[^>]*>Antrean pengajuan<\/dt><dd[^>]*><span[^>]*>1<\/span><\/dd><dd[^>]*>Terlama 5 menit<\/dd>/);
    expect(html.match(/data-metric-id="[^"]+"/g)).toEqual(['data-metric-id="OPS-QUEUE-STUCK"', 'data-metric-id="OPS-FAILURE-COUNT"', 'data-metric-id="OPS-BATCH-DURATION"']);
    expect(html).toMatch(/col-span-2[^"]*" data-metric-id="OPS-BATCH-DURATION"/);
  });

  it("reads an audit feed as action, actor · gerai · change, WIB time and how long ago", () => {
    const html = render(createElement(AuditFeed, {
      label: "Aktivitas audit terbaru",
      now,
      rows: [{ action: "TENANT_SUSPENDED", actorRole: "SUPER_ADMIN", createdAt: new Date("2026-09-26T15:48:00Z"), fromStatus: "ACTIVE", id: "1", outcome: "SUCCESS", targetType: "TENANT", tenantName: "Sekar Batik", toStatus: "SUSPENDED" }],
    }));
    const text = html.replace(/<[^>]+>/g, "|");
    expect(text).toContain("Menangguhkan gerai");
    expect(text).not.toContain("Admin platform menangguhkan");
    expect(text).toContain("Admin platform · Sekar Batik · Aktif → Ditangguhkan");
    expect(text).toContain("22.48 WIB| · 12 menit lalu");
    expect(html).toMatch(/datetime="2026-09-26T15:48:00.000Z"/i);
    expect(render(createElement(TimeCell, { instant: new Date("2026-09-26T15:48:00Z") }))).not.toContain("lalu");
  });

  // T-273 (critique P2 "roles not names, no object, view events flood"): the actor by name with
  // the role, what changed, and page views behind a URL toggle that is off by default.
  it("reads an audit row as named actor, gerai and object, with the page-view toggle in the filter form (T-273)", async () => {
    const { parseAnalyticsRange } = await import("@/lib/analytics-range");
    const { default: PlatformAuditPage } = await import("@/app/platform/audit/page");
    const at = new Date("2026-09-26T15:48:00Z");
    const base = { createdAt: at, fromStatus: null, outcome: "SUCCESS" as const, tenantId: "t-1", tenantName: "Sekar Batik", toStatus: null };
    const view = (showMonitoringViews: boolean) => ({
      audit: {
        rows: [
          { ...base, action: "OUTLET_SETTINGS_CHANGED", actorName: "Rina Wulandari", actorRole: "TENANT_MEMBER", id: "1", outletName: "Gudang Utama", targetType: "OUTLET" },
          { ...base, action: "SHIPMENT_HANDOVER_RECORDED", actorName: "Budi", actorRole: "TENANT_MEMBER", id: "2", targetType: "SHIPMENT" },
          { ...base, action: "TENANT_SUSPENDED", actorName: null, actorRole: "SUPER_ADMIN", id: "3", targetType: "TENANT" },
        ],
        total: 3,
      },
      filters: { action: null, courier: null, outcome: null, outletId: null, page: 1, query: null, range: parseAnalyticsRange({ rentang: "30-hari", tz: "Asia/Jakarta" }, now), scope: { kind: "global" }, showMonitoringViews, status: null },
      now,
      tenants: [{ id: "t-1", name: "Sekar Batik" }],
    });
    auditView.current = view(false);
    const html = render(await PlatformAuditPage({ searchParams: Promise.resolve({}) } as never));
    const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
    expect([...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(([, body]) => body.replace(/<[^>]+>/g, ""))).toEqual(["Waktu (WIB)", "Aksi", "Pelaku", "Gerai", "Objek", "Hasil"]);
    const rows = [...table.matchAll(/<tr[^>]*data-slot="table-row"[^>]*>([\s\S]*?)<\/tr>/g)].slice(1).map(([, row]) =>
      [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) => cell.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));
    expect(rows.map((cells) => cells.slice(2, 5))).toEqual([
      ["Rina Wulandari Anggota gerai", "Sekar Batik", "Outlet Gudang Utama"],
      ["Budi Anggota gerai", "Sekar Batik", "Kiriman"],
      ["Admin platform", "Sekar Batik", "—"],
    ]);
    // Phone rows: "Name (role) · gerai", the object in the meta line.
    expect(html).toContain("Rina Wulandari (Anggota gerai) · Sekar Batik");
    // The toggle: a native checkbox in the GET form, off by default, on from the URL; on counts as a changed filter.
    const toggle = (markup: string) => markup.match(/<input[^>]*name="kunjungan"[^>]*>/)?.[0] ?? "";
    expect(toggle(html)).toMatch(/type="checkbox"/);
    expect(toggle(html)).toMatch(/value="tampil"/);
    expect(toggle(html)).not.toMatch(/checked/);
    expect(html).toContain("Tampilkan kunjungan pemantauan");
    expect(html).not.toContain("Hapus filter");
    auditView.current = view(true);
    const shown = render(await PlatformAuditPage({ searchParams: Promise.resolve({ kunjungan: "tampil" }) } as never));
    expect(toggle(shown)).toMatch(/checked/);
    expect(shown).toContain("Hapus filter");
  });

  // T-89 / T-92 / T-93 (T-278): the Ringkasan's health region — one-decimal failure share
  // (OPS-FAILURE-SHARE, M-0), the database generated-at with the shared stale action, and the
  // caption stating the rolling-hour and credential-code rules.
  it("renders the failure share with one decimal, the generated-at line and the severity rules (T-278)", async () => {
    const { parseAnalyticsRange } = await import("@/lib/analytics-range");
    const { default: PlatformOverviewPage } = await import("@/app/platform/page");
    const generatedAt = new Date("2026-09-26T16:00:00Z");
    auditView.current = {
      audit: null, counts: null, detail: null, finance: null, issues: [], now: generatedAt, prefix: null, tenants: [], trend: null, usage: null,
      filters: { action: null, courier: null, outcome: null, outletId: null, page: 1, query: null, range: parseAnalyticsRange({ rentang: "30-hari", tz: "Asia/Jakarta" }, generatedAt), scope: { kind: "global" }, status: null },
      health: { ...health, failures: { ...tile("normal", 1), codes: [], share: 1 / 61, submissions: 61 }, generatedAt, unpaid: { ...tile("perhatian", 1), recovering: 0 } },
    };
    const html = render(await PlatformOverviewPage({ searchParams: Promise.resolve({}) } as never));
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("1,6% dari pengajuan");
    expect(text).not.toMatch(/\b2% dari pengajuan/);
    // M-0: no submissions in the period → the page note says "—", never "0,0%".
    const shown = auditView.current as { health: typeof health };
    auditView.current = { ...shown, health: { ...shown.health, failures: { ...tile("normal", 0), codes: [], share: 0, submissions: 0 } } };
    const empty = render(await PlatformOverviewPage({ searchParams: Promise.resolve({}) } as never)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(empty).toContain("— (belum ada pengajuan)");
    expect(empty).not.toContain("0,0% dari pengajuan");
    expect(html).toMatch(/data-slot="freshness-line"[^>]*><span>Diperbarui 26 Sep 2026, 23\.00 WIB<\/span>/);
    // The caption (inside the help popover, so read from what the page maps into it).
    const caption = PLATFORM_HEALTH_CAPTION.join(" ");
    expect(caption).toContain("5 pengajuan gagal dengan kode yang sama dalam 60 menit terakhir");
    expect(caption).toContain("bukan dari periode filter");
    expect(caption).toContain("kegagalan autentikasi, kredensial, atau skema pada periode ini");
    expect(caption).toContain("Menunggu pembayaran adalah pesanan yang belum dibayar ke Mengantar; Perhatian bila ada satu pun, Kritis bila yang terlama lebih dari 24 jam");
    expect(caption).toContain("Perhatian di atas 2%, Kritis di atas 10%");
    expect(caption).toContain("Kritis bila yang terlama lebih dari 30 menit");
    // The young unpaid order the repository now marks Perhatian reaches "Perlu perhatian".
    expect(text).toMatch(/Menunggu pembayaran 1 kiriman · 0 pemulihan berjalan/);
    const detail = attentionItems({ ...health, failures: { ...tile("perhatian", 3), codes: [], share: 0.0549, submissions: 55 } }, []).find((item) => item.key === "failures")?.detail;
    expect(detail).toContain("5,5% dari periode");
    // M-0: no submissions in the period → no rate, "—" (never "0,0%").
    const none = attentionItems({ ...health, failures: { ...tile("perhatian", 0), codes: [], share: 0, submissions: 0 } }, []).find((item) => item.key === "failures")?.detail;
    expect(none).toContain("— dari periode");
    expect(none).not.toMatch(/0,0%/);
  });

  it("T-259: a gerai row stored without its gerai reads \"Gerai tidak tercatat\"; a platform-wide row keeps \"Platform\"", () => {
    const row = { actorRole: "TENANT_MEMBER", createdAt: new Date("2026-09-26T15:48:00Z"), fromStatus: null, outcome: "SUCCESS", tenantName: null, toStatus: null };
    const text = render(createElement(AuditFeed, {
      label: "Aktivitas audit terbaru",
      now,
      rows: [
        { ...row, action: "SHIPMENT_PREFIX_LOCKED", id: "old-lock", targetType: "TENANT" },
        { ...row, action: "ANNOUNCEMENT_PUBLISHED", actorRole: "SUPER_ADMIN", id: "info", targetType: "PLATFORM" },
      ],
    })).replace(/<[^>]+>/g, "|");
    expect(text).toContain("Anggota gerai · Gerai tidak tercatat");
    expect(text).toContain("Admin platform · Platform");
    expect(text).not.toContain("Anggota gerai · Platform");
  });

  it("puts the chosen filter label in the server HTML (T-236 pattern)", () => {
    const html = render(createElement(FilterSelect, { allLabel: "Semua aksi", label: "Aksi", name: "aksi", options: auditActionOptions(), value: "TENANT_SUSPENDED" }));
    expect(html).toContain('type="hidden" name="aksi" value="TENANT_SUSPENDED"');
    expect(html).toMatch(/data-slot="select-value"[^>]*>Menangguhkan gerai</);
    expect(render(createElement(FilterSelect, { allLabel: "Semua aksi", label: "Aksi", name: "aksi", options: auditActionOptions() }))).toMatch(/data-slot="select-value"[^>]*>Semua aksi</);
  });
});
