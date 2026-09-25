import { beforeEach, describe, expect, it, vi } from "vitest";

import AnalyticsPage from "@/app/app/analitik/page";

const fixture = vi.hoisted(() => ({
  count: 51,
  courier: vi.fn(async () => []),
  shipment: vi.fn(async () => ({ rows: [], totalCount: 0 })),
  summary: vi.fn(async () => ({
    backlogSnapshot: {
      asOf: new Date("2026-08-31T12:00:00.000Z"),
      awaitingPaymentCount: 0,
      needsActionCount: 0,
    },
    eventGeneratedAt: new Date("2026-08-31T12:00:00.000Z"),
    current: {
      codPrincipalIdr: 0,
      codFeeIdr: 0,
      codFeeVatIncludedIdr: 0,
      createdCount: 0,
      issuedCount: 0,
      providerShippingIdr: 0,
      resolvedSubmissionCount: 0,
    },
    previous: {
      codPrincipalIdr: 0,
      codFeeIdr: 0,
      codFeeVatIncludedIdr: 0,
      createdCount: 0,
      issuedCount: 0,
      providerShippingIdr: 0,
      resolvedSubmissionCount: 0,
    },
  })),
  trend: vi.fn(async () => ({
    generatedAt: new Date("2026-08-31T12:00:00.000Z"),
    points: [],
  })),
  variance: vi.fn(async () => ({
    totalSignedVarianceIdr: 0,
    varianceCount: 0,
  })),
}));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({
    role: "TENANT_ADMIN" as const,
    scope: "tenant" as const,
    tenantId: "00000000-0000-0000-0000-000000003101",
    userId: "analytics-streaming-user-3101",
  })),
}));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (
    _db: unknown,
    userId: string,
    tenantId: string,
    work: (tx: unknown, context: unknown) => Promise<unknown>,
  ) => work({}, { role: "TENANT_ADMIN", tenantId, userId })),
}));
vi.mock("@/db/analytics-repository", () => ({
  countTenantShipments: vi.fn(async () => fixture.count),
  loadAnalyticsFilterOptions: vi.fn(async () => ({
    couriers: ["JNE"],
    outlets: [{
      id: "00000000-0000-0000-0000-000000003102",
      name: "Outlet streaming",
    }],
  })),
  loadCourierPerformance: fixture.courier,
  loadShipmentKpiComparison: fixture.summary,
  loadShipmentPage: fixture.shipment,
  loadShipmentTrend: fixture.trend,
}));
vi.mock("@/db/ledger-repository", () => ({
  summarizeLatestReconciliationVariances: fixture.variance,
}));

function renderPage(searchParams: Record<string, string | undefined> = {}) {
  return AnalyticsPage({ searchParams: Promise.resolve(searchParams) });
}

describe("analytics streaming orchestration", () => {
  beforeEach(() => {
    fixture.count = 51;
    fixture.courier.mockClear();
    fixture.shipment.mockClear();
    fixture.summary.mockClear();
    fixture.trend.mockClear();
    fixture.variance.mockClear();
  });

  it("starts every independent region read while composing the page shell", async () => {
    await renderPage();

    expect(fixture.summary).toHaveBeenCalledOnce();
    expect(fixture.trend).toHaveBeenCalledOnce();
    expect(fixture.courier).toHaveBeenCalledOnce();
    expect(fixture.shipment).toHaveBeenCalledOnce();
    expect(fixture.variance).toHaveBeenCalledOnce();
  });

  it("does not start region reads for a first-run tenant", async () => {
    fixture.count = 0;
    await renderPage();

    expect(fixture.summary).not.toHaveBeenCalled();
    expect(fixture.trend).not.toHaveBeenCalled();
    expect(fixture.courier).not.toHaveBeenCalled();
    expect(fixture.shipment).not.toHaveBeenCalled();
    expect(fixture.variance).not.toHaveBeenCalled();
  });

  it("does not start region reads after a tenant-scope filter rejection", async () => {
    await renderPage({ outlet: "00000000-0000-0000-0000-000000003199" });

    expect(fixture.summary).not.toHaveBeenCalled();
    expect(fixture.trend).not.toHaveBeenCalled();
    expect(fixture.courier).not.toHaveBeenCalled();
    expect(fixture.shipment).not.toHaveBeenCalled();
    expect(fixture.variance).not.toHaveBeenCalled();
  });
});
