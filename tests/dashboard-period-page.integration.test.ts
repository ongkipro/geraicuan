import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TenantDashboardPage from "@/app/app/page";

const fixture = vi.hoisted(() => ({
  outletReady: true,
  periodSummary: vi.fn(async () => ({
    current: {
      codCount: 7,
      codDeclaredValueIdr: 1_750_000,
      createdCount: 12,
      issuedCount: 8,
      nonCodCount: 5,
      nonCodDeclaredValueIdr: 925_000,
    },
    generatedAt: new Date("2026-08-31T12:00:00.000Z"),
    previous: {
      codCount: 5,
      codDeclaredValueIdr: 1_250_000,
      createdCount: 9,
      issuedCount: 6,
      nonCodCount: 4,
      nonCodDeclaredValueIdr: 700_000,
    },
  })),
  periodSupport: vi.fn(async () => ({
    rows: [{
      isCod: true,
      occurredAt: new Date("2026-08-31T08:00:00.000Z"),
      outletName: "Outlet dashboard",
      shipmentId: "00000000-0000-3602-0000-000000000001",
      status: "ISSUED" as const,
    }],
    totalCount: 1,
  })),
  periodTrend: vi.fn(async () => [
    { codCount: 7, key: "2026-08-31", nonCodCount: 5 },
  ]),
  role: "TENANT_ADMIN" as "TENANT_ADMIN" | "OPERATOR",
  totalShipments: 18,
}));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, useRouter: () => ({ refresh: vi.fn() }) };
});
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({
    role: fixture.role,
    scope: "tenant" as const,
    tenantId: "00000000-0000-3600-0000-000000000001",
    userId: "dashboard-period-user-3201",
  })),
}));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (
    _db: unknown,
    userId: string,
    tenantId: string,
    work: (tx: unknown, context: unknown) => Promise<unknown>,
  ) => {
    return work(
      {},
      { role: fixture.role, tenantId, userId },
    );
  }),
}));
vi.mock("@/db/outlet-readiness-repository", () => ({
  listOutletReadinessSummary: vi.fn(async () => [{
    id: "00000000-0000-3601-0000-000000000001",
    name: "Outlet dashboard",
    ready: fixture.outletReady,
  }]),
}));
vi.mock("@/db/tenant-dashboard-repository", () => ({
  loadTenantDashboardMetrics: vi.fn(async () => ({
    actionRequiredBreakdown: {
      awaitingUpstreamPayment: 1,
      failed: 1,
      submissionUnknown: 1,
    },
    finance: { reconciliationVarianceCount: 1 },
    generatedAt: new Date("2026-08-31T12:00:00.000Z"),
    role: fixture.role,
    summary: { actionRequired: 3, issuedToday: 8, readyToProgress: 4, total: fixture.totalShipments },
    workflowBreakdown: { draft: 2, estimated: 2, issuedToday: 8 },
  })),
  loadTenantDashboardPeriodSummary: fixture.periodSummary,
  loadTenantDashboardPeriodSupport: fixture.periodSupport,
  loadTenantDashboardPeriodTrend: fixture.periodTrend,
  loadTenantDashboardShipments: vi.fn(async () => []),
}));

async function renderDashboard(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  const stream = await renderToReadableStream(
    await TenantDashboardPage({ searchParams: Promise.resolve(searchParams) }),
  );
  await stream.allReady;
  return new Response(stream).text();
}

describe("analytics-led tenant dashboard", () => {
  beforeEach(() => {
    fixture.outletReady = true;
    fixture.role = "TENANT_ADMIN";
    fixture.totalShipments = 18;
    fixture.periodSummary.mockClear();
    fixture.periodSupport.mockClear();
    fixture.periodTrend.mockClear();
  });

  it("defaults to Today in WIB and separates COD/non-COD input from revenue", async () => {
    const html = await renderDashboard();

    expect(html).toContain("Ringkasan periode");
    expect(html).toContain("Hari ini");
    expect(html).toContain("WIB (UTC+07:00)");
    expect(html).toContain("Kiriman dibuat");
    expect(html).toContain("Kiriman COD");
    expect(html).toContain("Kiriman non-COD");
    expect(html).toContain("bukan dana diterima atau revenue");
    expect(html).toContain("Resi terbit");
    expect(html).toContain("support=created");
    expect(html).toContain("support=cod");
    expect(html).toContain("support=non-cod");
    expect(html).toContain("support=issued");
    expect(html).not.toContain("Tren input COD dan non-COD");
    expect(fixture.periodTrend).not.toHaveBeenCalled();
    expect(fixture.periodSummary).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ presetId: "hari-ini", timezone: "Asia/Jakarta" }),
      expect.anything(),
      {},
    );
  });

  it("opens role-safe supporting records with the selected KPI predicate", async () => {
    fixture.role = "OPERATOR";
    const html = await renderDashboard({
      rentang: "7-hari",
      support: "cod",
      tz: "Asia/Jakarta",
    });

    expect(html).toContain("Record pendukung:");
    expect(html).toContain("kiriman COD dibuat");
    expect(html).toContain("Predicate periode, zona waktu, outlet, dan basis event sama");
    expect(html).toContain("Tabel record pendukung Ringkasan");
    expect(fixture.periodSupport).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ presetId: "7-hari" }),
      "cod",
      {},
    );
  });

  it("persists a multi-day outlet range and exposes the semantic trend table", async () => {
    const outletId = "00000000-0000-3601-0000-000000000001";
    const html = await renderDashboard({
      outlet: outletId,
      rentang: "7-hari",
      tz: "Asia/Jakarta",
    });

    expect(html).toContain("Tren input COD dan non-COD");
    expect(html).toContain("Lihat tabel data tren");
    expect(html).toContain("Outlet dashboard");
    expect(html).toContain("Analitik lengkap");
    expect(fixture.periodSummary).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ presetId: "7-hari" }),
      expect.anything(),
      { outletId },
    );
  });

  it("fails closed for an unavailable outlet without starting period reads", async () => {
    const html = await renderDashboard({
      outlet: "00000000-0000-3601-0000-000000000099",
    });

    expect(html).toContain("Filter outlet ditolak");
    expect(html).toContain("Reset ke filter aman");
    expect(html).toContain('href="/app"');
    expect(fixture.periodSummary).not.toHaveBeenCalled();
    expect(fixture.periodTrend).not.toHaveBeenCalled();
  });

  it("uses readiness-aware first-run guidance when the outlet can create shipments", async () => {
    fixture.totalShipments = 0;

    const html = await renderDashboard();

    expect(html).toContain("Outlet sudah siap");
    expect(html).not.toContain("Siapkan outlet, lalu buat kiriman pertama");
  });

  it("keeps Operator exceptions free of admin-only payment recovery", async () => {
    fixture.role = "OPERATOR";

    const html = await renderDashboard();

    expect(html).toContain("1 status belum pasti · 1 gagal");
    expect(html).not.toContain("Menunggu pembayaran");
    expect(html).not.toContain("Selisih rekonsiliasi");
    expect(html).toContain("Tidak ada kiriman yang perlu ditindaklanjuti saat ini");
  });
});
