import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildPlatformHref,
  parsePlatformFilters,
} from "@/lib/platform-monitoring-filters";

const TENANT_ALPHA = "10000000-0000-4000-8000-000000000471";
const TENANT_BETA = "10000000-0000-4000-8000-000000000472";
const OUTLET_ALPHA = "20000000-0000-4000-8000-000000000471";
const OUTLET_BETA = "20000000-0000-4000-8000-000000000472";
const BATCH_ALPHA = "30000000-0000-4000-8000-000000000471";
const SECRET_SENTINEL = "vault://platform/provider-secret-must-not-render";
const NOW = new Date("2026-09-01T04:00:00.000Z");

const mocks = vi.hoisted(() => ({
  access: {
    principal: { scope: "platform", userId: "platform-super" },
    status: "authorized",
  } as
    | { status: "authorized"; principal: { scope: "platform"; userId: string } }
    | { status: "anonymous" }
    | { status: "forbidden"; userId: string },
  actionState: {} as Record<string, unknown>,
  audit: { rows: [] as Array<Record<string, unknown>>, total: 0 },
  auditFilters: [] as Array<Record<string, unknown>>,
  contextCalls: 0,
  counts: {} as Record<string, unknown>,
  detail: null as null | Record<string, unknown>,
  failReads: [] as string[],
  finance: {} as Record<string, unknown>,
  globalOptions: {
    couriers: ["JNE", "J&T"],
    outlets: [] as Array<Record<string, unknown>>,
    tenants: [] as Array<Record<string, unknown>>,
  },
  health: {} as Record<string, unknown>,
  pending: false,
  previous: { created: 0, failed: 0, issued: 0, unpaid: 0 },
  readCalls: [] as string[],
  recordCalls: [] as Array<Record<string, unknown>>,
  tenantOptions: {
    couriers: ["JNE", "J&T"],
    outlets: [] as Array<Record<string, unknown>>,
    tenants: [] as Array<Record<string, unknown>>,
  },
  trend: [] as Array<Record<string, unknown>>,
  usage: { rows: [] as Array<Record<string, unknown>>, total: 0 },
  usageFilters: [] as Array<Record<string, unknown>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: vi.fn(() => [mocks.actionState, vi.fn(), mocks.pending]),
  };
});

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("@/app/platform/platform-access", () => ({
  resolvePlatformAccess: vi.fn(async () => mocks.access),
}));

vi.mock("@/app/platform/tenant/actions", () => ({
  submitPlatformTenantLifecycle: vi.fn(async () => ({})),
}));

vi.mock("@/db/client", () => ({ db: {} }));

vi.mock("@/db/platform-context", () => ({
  recordPlatformMonitoringAccess: vi.fn(async (_db, userId, input) => {
    mocks.recordCalls.push({ userId, ...input });
  }),
  withPlatformContext: vi.fn(async (_db, userId, callback) => {
    mocks.contextCalls += 1;
    return callback({ userId });
  }),
}));

vi.mock("@/db/platform-monitoring-repository", () => {
  function valueFor<T>(name: string, value: T): T {
    mocks.readCalls.push(name);
    if (mocks.failReads.includes(name)) throw new Error(`${name.toUpperCase()}_FAILED`);
    return value;
  }

  return {
    listAuditEvents: vi.fn(async (_tx, filters) => {
      mocks.auditFilters.push(filters);
      return valueFor("audit", mocks.audit);
    }),
    listTenantUsage: vi.fn(async (_tx, filters) => {
      mocks.usageFilters.push(filters);
      return valueFor("usage", mocks.usage);
    }),
    readFilterOptions: vi.fn(async (_tx, scope) =>
      scope.kind === "tenant" ? mocks.tenantOptions : mocks.globalOptions),
    readPlatformCounts: vi.fn(async () => valueFor("counts", mocks.counts)),
    readPlatformClock: vi.fn(async () => NOW),
    readPlatformHealth: vi.fn(async () => valueFor("health", mocks.health)),
    readPreviousPeriodHeadline: vi.fn(async () => valueFor("previous", mocks.previous)),
    readTenantDetail: vi.fn(async () => valueFor("detail", mocks.detail)),
    readTrend: vi.fn(async () => valueFor("trend", mocks.trend)),
  };
});

vi.mock("@/db/platform-tenant-repository", () => ({
  readPlatformTenantFinanceSummary: vi.fn(async () => {
    mocks.readCalls.push("finance");
    if (mocks.failReads.includes("finance")) throw new Error("FINANCE_FAILED");
    return mocks.finance;
  }),
}));

function counts(overrides: Record<string, unknown> = {}) {
  return {
    lifecycle: {
      batches: 0,
      batchesCompleted: 0,
      batchesFailed: 0,
      byStatus: {
        AWAITING_UPSTREAM_PAYMENT: 0,
        DRAFT: 0,
        ESTIMATED: 0,
        FAILED: 0,
        ISSUED: 0,
        SUBMISSION_QUEUED: 0,
        SUBMISSION_UNKNOWN: 0,
      },
      estimates: 0,
      issued: 0,
      recoveriesCompleted: 0,
      shipments: 0,
      unknown: 0,
      unpaid: 0,
    },
    memberships: { active: 0, operators: 0, suspended: 0, tenantAdmins: 0 },
    outlets: { configured: 0, incomplete: 0, platformDefault: 0, privateConnections: 0, total: 0 },
    tenants: { active: 0, archived: 0, newInRange: 0, provisioning: 0, suspended: 0 },
    ...overrides,
  };
}

function health(overrides: Record<string, unknown> = {}) {
  const tile = { affectedTenants: 0, count: 0, oldestMs: null, severity: "normal" };
  return {
    accounts: [] as Array<Record<string, unknown>>,
    failures: { ...tile, codes: [], share: 0 },
    generatedAt: NOW,
    latency: { byCourier: [], p50Seconds: null, p95Seconds: null },
    queue: tile,
    unknown: { ...tile, batches: 0, orders: 0, recoveries: 0 },
    unpaid: { ...tile, recovering: 0 },
    ...overrides,
  };
}

function tenantUsage(overrides: Record<string, unknown> = {}) {
  return {
    batches: 0,
    failed: 0,
    issued: 0,
    lastActivityAt: new Date("2026-08-31T10:00:00.000Z"),
    members: 1,
    name: "Alpha Outlet",
    outletConfigured: 1,
    outletTotal: 1,
    shipments: 1,
    status: "ACTIVE",
    tenantId: TENANT_ALPHA,
    unknown: 0,
    unpaid: 0,
    ...overrides,
  };
}

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    action: "TENANT_SUSPENDED",
    actorRole: "SUPER_ADMIN",
    createdAt: new Date("2026-08-31T11:00:00.000Z"),
    fromStatus: "ACTIVE",
    id: "40000000-0000-4000-8000-000000000471",
    outcome: "DENIED",
    tenantId: TENANT_ALPHA,
    tenantName: "Alpha Outlet",
    toStatus: "SUSPENDED",
    ...overrides,
  };
}

function tenantDetail(overrides: Record<string, unknown> = {}) {
  return {
    batches: [{
      completedAt: null,
      courier: "JNE",
      credentialSource: "private",
      id: BATCH_ALPHA,
      providerAccountBucket: 7,
      providerAccountKey: SECRET_SENTINEL,
      safeErrorCode: "AUTH_REDACTED",
      secretReference: SECRET_SENTINEL,
      status: "FAILED",
      submissionAttemptedAt: new Date("2026-08-31T10:30:00.000Z"),
    }],
    outlets: [
      {
        hasOrigin: true,
        hasPickup: true,
        hasPrivateConnection: true,
        id: OUTLET_ALPHA,
        name: "Alpha Utama",
        secretReference: SECRET_SENTINEL,
        updatedAt: new Date("2026-08-31T08:00:00.000Z"),
      },
      {
        hasOrigin: true,
        hasPickup: false,
        hasPrivateConnection: false,
        id: OUTLET_BETA,
        name: "Alpha Cadangan",
        updatedAt: new Date("2026-08-31T09:00:00.000Z"),
      },
    ],
    tenant: {
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      id: TENANT_ALPHA,
      name: "Alpha Outlet",
      status: "ACTIVE",
      updatedAt: new Date("2026-08-31T00:00:00.000Z"),
    },
    ...overrides,
  };
}

function financeSummary() {
  return {
    ledger: {
      codPrincipalLiabilityIdr: 200_000,
      entryCount: 2,
      providerCostIdr: 20_000,
      revenueIdr: 5_000,
      upstreamRecoveryPaymentIdr: 0,
      vatPayableIdr: 550,
    },
    reconciliations: [{
      cadence: "DAILY",
      createdAt: new Date("2026-08-31T12:00:00.000Z"),
      ledgerTotalIdr: 200_000,
      periodEnd: new Date("2026-09-01T00:00:00.000Z"),
      periodStart: new Date("2026-08-31T00:00:00.000Z"),
      reconciledEntryType: "COD_PRINCIPAL_COLLECTABLE",
      sourceTotalIdr: 199_000,
      status: "VARIANCE",
      varianceIdr: -1_000,
    }],
  };
}

async function renderOverview(params: Record<string, string | string[] | undefined> = {}) {
  const { MonitoringView } = await import("@/app/platform/_components/monitoring-view");
  return renderToStaticMarkup(await MonitoringView({
    kind: "overview",
    rawParams: params,
    route: "/platform",
  }));
}

async function renderTenantList(params: Record<string, string | string[] | undefined> = {}) {
  const { MonitoringView } = await import("@/app/platform/_components/monitoring-view");
  return renderToStaticMarkup(await MonitoringView({
    kind: "tenant-list",
    rawParams: params,
    route: "/platform/tenant",
  }));
}

async function renderTenantDetail(
  tenantId = TENANT_ALPHA,
  params: Record<string, string | string[] | undefined> = {},
) {
  const { MonitoringView } = await import("@/app/platform/_components/monitoring-view");
  return renderToStaticMarkup(await MonitoringView({
    kind: "tenant-detail",
    rawParams: params,
    route: "/platform/tenant/[tenantId]",
    tenantId,
  }));
}

async function renderAudit(params: Record<string, string | string[] | undefined> = {}) {
  const { MonitoringView } = await import("@/app/platform/_components/monitoring-view");
  return renderToStaticMarkup(await MonitoringView({
    kind: "audit",
    rawParams: params,
    route: "/platform/audit",
  }));
}

beforeEach(() => {
  mocks.access = {
    principal: { scope: "platform", userId: "platform-super" },
    status: "authorized",
  };
  mocks.actionState = {};
  mocks.audit = { rows: [], total: 0 };
  mocks.auditFilters = [];
  mocks.contextCalls = 0;
  mocks.counts = counts();
  mocks.detail = tenantDetail();
  mocks.failReads = [];
  mocks.finance = financeSummary();
  mocks.globalOptions = {
    couriers: ["JNE", "J&T"],
    outlets: [],
    tenants: [
      { id: TENANT_ALPHA, name: "Alpha Outlet", status: "ACTIVE" },
      { id: TENANT_BETA, name: "Beta Outlet", status: "SUSPENDED" },
    ],
  };
  mocks.health = health();
  mocks.pending = false;
  mocks.previous = { created: 0, failed: 0, issued: 0, unpaid: 0 };
  mocks.readCalls = [];
  mocks.recordCalls = [];
  mocks.tenantOptions = {
    couriers: ["JNE", "J&T"],
    outlets: [
      { id: OUTLET_ALPHA, name: "Alpha Utama" },
      { id: OUTLET_BETA, name: "Alpha Cadangan" },
    ],
    tenants: mocks.globalOptions.tenants,
  };
  mocks.trend = [];
  mocks.usage = { rows: [], total: 0 };
  mocks.usageFilters = [];
});

describe("platform monitoring page authorization", () => {
  it.each([
    ["anonymous", { status: "anonymous" } as const],
    ["tenant principal", { status: "forbidden", userId: "tenant-user" } as const],
  ])("redirects a %s actor before platform context or read models", async (_label, access) => {
    mocks.access = access;
    const { MonitoringView } = await import("@/app/platform/_components/monitoring-view");

    await expect(MonitoringView({
      kind: "overview",
      rawParams: {},
      route: "/platform",
    })).rejects.toThrow("REDIRECT:/login/super-admin");

    expect(mocks.contextCalls).toBe(0);
    expect(mocks.readCalls).toEqual([]);
    expect(mocks.recordCalls).toEqual([]);
  });
});

describe("platform monitoring page states", () => {
  it("renders the empty overview with filters, local tables, and a global audit receipt", async () => {
    const html = await renderOverview();

    expect(html).toContain("Ringkasan operasional");
    expect(html).toContain("Filter &amp; periode");
    expect(html).toContain("Tidak ada antrean provider.");
    expect(html).toContain("Belum ada tenant");
    expect(html).toContain("Provision tenant pertama");
    expect(html).toContain("Belum ada aktivitas audit");
    expect(html).toContain('role="region"');
    expect(html).toContain("overflow-x-auto");
    expect(mocks.recordCalls).toEqual([{
      route: "/platform",
      scope: "global",
      userId: "platform-super",
    }]);
  });

  it("shows invalid URL filter recovery without applying forbidden route-only parameters", async () => {
    const html = await renderOverview({
      extra: "1",
      hasil: "DENIED",
      halaman: "0",
      outlet: OUTLET_ALPHA,
      q: "x",
      status: "mystery",
      tenant: "not-a-uuid",
      tz: "Mars/Base",
    });

    expect(html).toContain("Filter disesuaikan");
    expect(html).toContain("Tenant tidak dikenal");
    expect(html).toContain("Outlet memerlukan lingkup tenant");
    expect(html).toContain("Status kiriman tidak dikenal");
    expect(html).toContain("Parameter tidak berlaku pada halaman ini");
    expect(html).toContain("Nomor halaman tidak valid");
    expect(html).toContain("Parameter URL tidak dikenal");
    expect((html.match(/Parameter tidak berlaku pada halaman ini/g) ?? []))
      .toHaveLength(2);
    expect(mocks.usageFilters[0]).toMatchObject({
      outcome: null,
      outletId: null,
      page: 1,
      query: null,
      scope: { kind: "global" },
      status: null,
    });
  });

  it("keeps the tenant list discoverable, paginated, and lifecycle-first before collapsed filters", async () => {
    mocks.actionState = {
      message: "Tenant Gamma berhasil diprovisikan.",
      outcome: "success",
      tenant: { id: TENANT_BETA, name: "Gamma", status: "ACTIVE" },
    };
    mocks.usage = {
      rows: [
        tenantUsage({ name: "Alpha Outlet", tenantId: TENANT_ALPHA }),
        tenantUsage({ name: "Beta Outlet", status: "SUSPENDED", tenantId: TENANT_BETA }),
      ],
      total: 60,
    };

    const html = await renderTenantList({ halaman: "2", q: "Alpha" });

    expect(html).toContain("Daftar tenant");
    expect(html.indexOf("Provisioning tenant")).toBeLessThan(html.indexOf("Filter &amp; periode"));
    expect(html).toContain("Tenant Gamma berhasil diprovisikan.");
    expect(html).toContain(`href="/platform/tenant/${TENANT_BETA}"`);
    expect(html).toContain("Halaman 2 dari 3");
    expect(html).toContain("Sebelumnya");
    expect(html).toContain("Berikutnya");
    expect(html).toContain(`href="/platform/tenant/${TENANT_ALPHA}?rentang=30-hari&amp;tz=Asia%2FJakarta"`);
    expect(mocks.usageFilters[0]).toMatchObject({
      page: 2,
      query: "Alpha",
      scope: { kind: "global" },
    });
  });

  it("throws the route not-found boundary for an unknown tenant detail without recording access", async () => {
    mocks.detail = null;

    await expect(renderTenantDetail("10000000-0000-4000-8000-000000000499"))
      .rejects.toThrow("NOT_FOUND");

    expect(mocks.contextCalls).toBe(1);
    expect(mocks.readCalls).toContain("detail");
    expect(mocks.recordCalls).toEqual([]);
  });

  it("renders tenant detail lifecycle controls, local scrollers, finance, and redacted provider detail", async () => {
    mocks.actionState = {
      message: "Tenant tidak ditemukan, status berubah, atau nama konfirmasi tidak cocok.",
      outcome: "denied",
    };
    mocks.audit = { rows: [auditRow()], total: 1 };

    const html = await renderTenantDetail(TENANT_ALPHA, { kurir: "jne" });

    expect(html).toContain("Alpha Outlet");
    expect(html.indexOf("Siklus tenant")).toBeLessThan(html.indexOf("Filter &amp; periode"));
    expect(html).toContain("Tangguhkan tenant");
    expect(html).toContain("Ketik persis: Alpha Outlet");
    expect(html).toContain("Perubahan belum tersimpan");
    expect(html).toContain("Konfigurasi outlet tanpa nilai kredensial");
    expect(html).toContain("Privat aktif");
    expect(html).toContain("Default platform");
    expect(html).toContain("Batch provider terbaru; identitas akun dianonimkan");
    expect(html).toContain("Akun provider #7");
    expect(html).toContain("Ledger dan rekonsiliasi");
    expect(html).toContain("Pokok COD — liabilitas");
    expect((html.match(/role="region"/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((html.match(/overflow-x-auto/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(html).not.toContain(SECRET_SENTINEL);
    expect(html).not.toContain("providerAccountKey");
    expect(html).not.toContain("secretReference");
    expect(mocks.recordCalls).toEqual([{
      route: "/platform/tenant/[tenantId]",
      scope: "tenant",
      tenantId: TENANT_ALPHA,
      userId: "platform-super",
    }]);
  });

  it("keeps sibling regions visible when one read model is degraded", async () => {
    mocks.failReads = ["trend"];
    mocks.usage = { rows: [tenantUsage()], total: 1 };

    const html = await renderOverview();

    expect(html).toContain("Tren tidak tersedia");
    expect(html).toContain("Bagian ini gagal dimuat");
    expect(html).toContain("Volume operasional");
    expect(html).toContain("Penggunaan per tenant");
    expect(html).toContain("Alpha Outlet");
  });

  it("renders audit filters, pagination, and redacted append-only audit rows", async () => {
    mocks.audit = {
      rows: [auditRow({ metadata: SECRET_SENTINEL, providerToken: SECRET_SENTINEL })],
      total: 60,
    };

    const html = await renderAudit({ halaman: "3", hasil: "DENIED" });

    expect(html).toContain("Jejak audit");
    expect(html).toContain("Hasil");
    expect(html).toContain("TENANT_SUSPENDED");
    expect(html).toContain("Ditolak");
    expect(html).toContain("ACTIVE → SUSPENDED");
    expect(html).toContain("Halaman 3 dari 3");
    expect(html).toContain("Sebelumnya");
    expect(html).not.toContain("Berikutnya</a>");
    expect(html).not.toContain(SECRET_SENTINEL);
    expect(html).not.toContain("providerToken");
    expect(mocks.auditFilters[0]).toMatchObject({
      outcome: "DENIED",
      page: 3,
      scope: { kind: "global" },
    });
  });
});

describe("platform monitoring route boundaries", () => {
  it("keeps loading semantics local to the platform workspace", async () => {
    const { default: PlatformLoading } = await import("@/app/platform/loading");
    const html = renderToStaticMarkup(createElement(PlatformLoading));

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Memuat data pemantauan"');
    expect(html).toContain('aria-label="Memuat ringkasan keputusan"');
    expect(html).toContain('aria-label="Memuat tabel operasional"');
  });

  it("renders a sanitized platform route error with keyboard-usable retry", async () => {
    const { default: PlatformError } = await import("@/app/platform/error");
    const html = renderToStaticMarkup(createElement(PlatformError, {
      error: new Error(SECRET_SENTINEL),
      reset: vi.fn(),
    }));

    expect(html).toContain('role="alert"');
    expect(html).toContain("Pemantauan tidak dapat dimuat");
    expect(html).toContain("Tidak ada detail internal yang ditampilkan.");
    expect(html).toContain("Coba lagi");
    expect(html).not.toContain(SECRET_SENTINEL);
  });

  it("omits redundant tenant query parameters from actual tenant-detail hrefs", () => {
    const parsed = parsePlatformFilters(
      {
        extra: "1",
        halaman: "0",
        hasil: "SUCCESS",
        kurir: "jne",
        outlet: "not-a-uuid",
        q: "x",
        status: "unknown",
        tenant: TENANT_BETA,
        tz: "Mars/Base",
      },
      {
        forcedTenantId: TENANT_ALPHA,
        knownCouriers: ["JNE"],
        knownOutletIds: [OUTLET_ALPHA],
        knownTenantIds: [TENANT_ALPHA, TENANT_BETA],
        now: NOW,
        route: "/platform/tenant/[tenantId]",
      },
    );

    expect(parsed.filters).toMatchObject({
      courier: "JNE",
      outcome: null,
      outletId: null,
      page: 1,
      query: null,
      scope: { kind: "tenant", tenantId: TENANT_ALPHA },
      status: null,
    });
    expect(parsed.issues).toEqual(expect.arrayContaining([
      "tz_tidak_dikenal",
      "outlet_tidak_dikenal",
      "status_tidak_dikenal",
      "parameter_tidak_berlaku",
      "halaman_tidak_valid",
      "parameter_tidak_dikenal",
    ]));
    expect(parsed.issues.filter((issue) => issue === "parameter_tidak_berlaku"))
      .toHaveLength(2);

    const href = buildPlatformHref(`/platform/tenant/${TENANT_ALPHA}`, parsed.filters, {
      page: 2,
    });
    const query = href.split("?")[1] ?? "";
    const stable = parsePlatformFilters(Object.fromEntries(new URLSearchParams(query)), {
      forcedTenantId: TENANT_ALPHA,
      knownCouriers: ["JNE"],
      knownOutletIds: [OUTLET_ALPHA],
      knownTenantIds: [TENANT_ALPHA, TENANT_BETA],
      now: NOW,
      route: "/platform/tenant/[tenantId]",
    });

    expect(href).toBe(`/platform/tenant/${TENANT_ALPHA}?rentang=30-hari&tz=Asia%2FJakarta&kurir=JNE&halaman=2`);
    expect(new URLSearchParams(query).has("tenant")).toBe(false);
    expect(stable.canonicalQuery.toString()).toBe(query);
  });
});
