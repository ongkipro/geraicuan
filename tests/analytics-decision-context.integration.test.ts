import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AnalyticsPage from "@/app/app/analitik/page";

import {
  analyticsShipmentDetailHref,
  buildAnalyticsDecisionContext,
} from "@/lib/analytics-decision-context";
import { parseAnalyticsRange } from "@/lib/analytics-range";

const fixture = vi.hoisted(() => ({
  reconciliationError: false,
  role: "TENANT_ADMIN" as "TENANT_ADMIN" | "OPERATOR",
  shipmentId: "00000000-0000-0000-0000-000000002801",
  shipmentReads: 0,
}));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ refresh: vi.fn() }),
  };
});
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({
    scope: "tenant" as const,
    userId: "analytics-decision-user-2801",
    tenantId: "00000000-0000-0000-0000-000000002810",
    role: fixture.role,
  })),
}));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(
    async (
      _db: unknown,
      userId: string,
      tenantId: string,
      work: (tx: unknown, context: unknown) => Promise<unknown>,
    ) =>
      work(
        {},
        {
          tenantId,
          userId,
          role: fixture.role,
        },
      ),
  ),
}));
vi.mock("@/db/analytics-repository", () => ({
  countTenantShipments: vi.fn(async () => 51),
  loadAnalyticsFilterOptions: vi.fn(async () => ({
    couriers: ["JNE"],
    outlets: [{
      id: "00000000-0000-0000-0000-000000002811",
      name: "Outlet keputusan T28",
    }],
  })),
  loadCourierPerformance: vi.fn(async () => [
    { courier: "JNE", issuedCount: 8, resolvedSubmissionCount: 10 },
  ]),
  loadShipmentKpiComparison: vi.fn(async () => ({
    backlogSnapshot: {
      asOf: new Date("2026-08-30T12:00:00.000Z"),
      awaitingPaymentCount: 2,
      needsActionCount: 1,
    },
    eventGeneratedAt: new Date("2026-08-30T12:00:00.000Z"),
    current: {
      createdCount: 12,
      issuedCount: 8,
      resolvedSubmissionCount: 10,
      providerShippingIdr: 240_000,
      codServiceFeeIdr: 15_000,
      codVatIdr: 1_650,
      codPrincipalIdr: 900_000,
    },
    previous: {
      createdCount: 8,
      issuedCount: 8,
      resolvedSubmissionCount: 8,
      providerShippingIdr: 160_000,
      codServiceFeeIdr: 10_000,
      codVatIdr: 1_100,
      codPrincipalIdr: 600_000,
    },
  })),
  loadShipmentTrend: vi.fn(async () => ({
    generatedAt: new Date("2026-07-07T12:00:00.000Z"),
    points: [{ key: "2026-07-01", createdCount: 12, issuedCount: 8 }],
  })),
  loadShipmentPage: vi.fn(async () => {
    fixture.shipmentReads += 1;
    return {
    totalCount: 51,
    rows: [
      {
        shipmentId: fixture.shipmentId,
        createdAt: new Date("2026-07-01T00:30:00.000Z"),
        issuedAt: new Date("2026-07-01T01:00:00.000Z"),
        outletName: "Outlet keputusan T28",
        courier: "jne",
        providerService: "REG",
        status: "ISSUED" as const,
        cnoteNo: "SAFE-T28-AWB",
        isCod: true,
        providerCodAmountIdr: 900_000,
      },
    ],
    };
  }),
}));
vi.mock("@/db/ledger-repository", () => ({
  summarizeLatestReconciliationVariances: vi.fn(async () => {
    if (fixture.reconciliationError) throw new Error("fixture reconciliation failure");
    return { totalSignedVarianceIdr: 500, varianceCount: 1 };
  }),
}));

async function renderAnalytics(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const stream = await renderToReadableStream(
    await AnalyticsPage({ searchParams: Promise.resolve(searchParams) }),
  );

  await stream.allReady;
  return new Response(stream).text();
}

describe("tenant analytics decision context", () => {
  beforeEach(() => {
    fixture.reconciliationError = false;
    fixture.role = "TENANT_ADMIN";
  });

  it("keeps the URL-selected range and timezone across decision surfaces", async () => {
    const params = {
      rentang: "kustom",
      khusus: "1",
      dari: "2026-07-01",
      sampai: "2026-07-07",
      tz: "Asia/Jayapura",
    };
    const range = parseAnalyticsRange(params, new Date("2026-08-30T12:00:00Z"));
    const context = buildAnalyticsDecisionContext(range);
    const html = await renderAnalytics(params);

    expect(context.persistedQuery).toBe(
      "rentang=kustom&tz=Asia%2FJayapura&dari=2026-07-01&sampai=2026-07-07",
    );
    expect(context.previousRange).toMatchObject({
      timezone: "Asia/Jayapura",
      startDate: "2026-06-24",
      lastIncludedDate: "2026-06-30",
      spanDays: 7,
    });
    expect(html.match(/WIT \(UTC\+09:00\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain("Dibandingkan dengan <strong");
    expect(html).toContain("Wawasan");
    expect(html).toContain('id="analytics-page-heading"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("↑");
    expect(html).toContain("50% lebih tinggi dari periode sebelumnya.");
    expect(html).toContain("Net selisih bertanda");
    expect(html.match(/aria-label="Net selisih bertanda:[^"]+Lihat record pendukung"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Kiriman dibuat:[^"]+Lihat record pendukung"/g)).toHaveLength(1);
    expect(html).not.toContain(">Net selisih bertanda</a>");
    expect(html).not.toContain(">Kiriman dibuat</a>");
    expect(html).toContain("Data event periode");
    expect(html).toContain("Data tren");
    expect(html).toContain('dateTime="2026-07-07T12:00:00.000Z"');
    expect(html).toContain("Timestamp ini tidak mewakili tren");
    expect(html).toContain("Lihat data tren dalam tabel");
    expect(html).toContain('aria-label="Tabel tren kiriman"');
    expect(html).not.toContain("<details open=");
    expect(html).toContain(
      "href=\"/app/keuangan?status=VARIANCE#reconciliation-history-title\"",
    );
    expect(html).toContain("bukan pendapatan");
    expect(html).toContain(
      `href="/app/pengiriman/${fixture.shipmentId}"`,
    );
    expect(html).toContain("inline-flex min-h-11 items-center text-primary");
    expect(html.match(/min-h-11 sm:min-h-8/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.indexOf(">Kiriman</th>")).toBeLessThan(
      html.indexOf(">Dibuat</th>"),
    );
    expect(html).toContain(
      "href=\"/app/analitik?rentang=kustom&amp;dari=2026-07-01&amp;sampai=2026-07-07&amp;tz=Asia%2FJayapura&amp;halaman=2\"",
    );
  });

  it("isolates a reconciliation read failure from operational KPIs", async () => {
    fixture.reconciliationError = true;
    const html = await renderAnalytics({ rentang: "7-hari", tz: "Asia/Jakarta" });

    expect(html).toContain("Kiriman dibuat");
    expect(html).toContain("Pokok COD (liabilitas)");
    expect(html).toContain("Exception rekonsiliasi tidak dapat dimuat");
  });

  it("redirects the operator before analytics reads or rows render", async () => {
    fixture.role = "OPERATOR";
    fixture.shipmentReads = 0;
    await expect(renderAnalytics({
      rentang: "7-hari",
      tz: "Asia/Jakarta",
    })).rejects.toThrow("NEXT_REDIRECT");

    expect(fixture.shipmentReads).toBe(0);
    expect(analyticsShipmentDetailHref("OPERATOR", fixture.shipmentId)).toBeNull();
    expect(
      analyticsShipmentDetailHref("TENANT_ADMIN", fixture.shipmentId),
    ).toBe(`/app/pengiriman/${fixture.shipmentId}`);
  });
});
