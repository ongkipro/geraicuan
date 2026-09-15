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
  // The repository order puts a 5/5 low-volume courier above an 8/10 courier by rate.
  loadCourierPerformance: vi.fn(async () => [
    { courier: "SAP", issuedCount: 5, resolvedSubmissionCount: 5 },
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
      cogsIdr: 500_000,
      netMarginIdr: 143_350,
    },
    previous: {
      createdCount: 8,
      issuedCount: 8,
      resolvedSubmissionCount: 8,
      providerShippingIdr: 160_000,
      codServiceFeeIdr: 10_000,
      codVatIdr: 1_100,
      codPrincipalIdr: 600_000,
      cogsIdr: 350_000,
      netMarginIdr: 78_900,
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
        publicReference: "95758-260901-281",
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

function openingTagWithLabel(html: string, label: string, prefix = false) {
  const marker = prefix ? `aria-label="${label}` : `aria-label="${label}"`;
  const index = html.indexOf(marker);
  expect(index, `missing ${marker}`).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", index), html.indexOf(">", index) + 1);
}

/**
 * A target is at least 44px below md when a mobile-scoped 44px size applies, or an
 * unscoped min-h-11 is not undone by a breakpoint narrower than md (sm = 640px).
 */
function hasMobileTouchTarget(tag: string) {
  const classes = (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);
  if (classes.some((name) => /^max-md:(?:size|min-h|h)-11$/.test(name))) return true;
  return classes.includes("min-h-11")
    && !classes.some((name) => /^(?:sm:)(?:min-h|h|size)-/.test(name));
}

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

  it("keeps calendar dates and normalizes an obsolete timezone across decision surfaces", async () => {
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
      "rentang=kustom&tz=Asia%2FJakarta&dari=2026-07-01&sampai=2026-07-07",
    );
    expect(context.previousRange).toMatchObject({
      timezone: "Asia/Jakarta",
      startDate: "2026-06-24",
      lastIncludedDate: "2026-06-30",
      spanDays: 7,
    });
    expect(html.match(/WIB \(UTC\+07:00\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).not.toMatch(/name="tz"/);
    expect(html).not.toContain("Zona:");
    expect(html).toContain("Dibanding <strong");
    expect(html).toContain('id="analytics-page-heading"');
    // Spec 10 shared-shell contract: the "Wawasan" eyebrow sits directly above the page title.
    const eyebrowIndex = html.indexOf(">Wawasan</p>");
    expect(eyebrowIndex).toBeGreaterThan(-1);
    expect(eyebrowIndex).toBeLessThan(html.indexOf('id="analytics-page-heading"'));
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("↑");
    expect(html).toContain("50% lebih tinggi dari periode sebelumnya.");
    expect(html).toContain("Total selisih (+/−)");
    expect(html).toContain("Lihat rekonsiliasi");
    expect(html.match(/aria-label="Kiriman dibuat:[^"]+Lihat record pendukung"/g)).toHaveLength(1);
    expect(html).not.toContain(">Total selisih (+/−)</a>");
    expect(html).not.toContain(">Kiriman dibuat</a>");
    // Spec 19: snapshot values ignore the period and say so.
    expect(html).toContain("Tidak mengikuti periode laporan");
    // The period freshness timestamp states which regions it covers.
    expect(html).toContain("Waktu pembaruan di atas berlaku untuk ringkasan periode, bukan tren");
    expect(html).toContain("Data tren");
    expect(html).toContain('dateTime="2026-07-07T12:00:00.000Z"');
    // PR42: visible charts precede labelled disclosure of complete supporting tables.
    const trendRegion = html.slice(
      html.indexOf('id="analytics-trend-heading"'),
      html.indexOf('aria-label="Tabel tren kiriman"'),
    );
    expect(trendRegion).toContain("<figure");
    expect(trendRegion).toContain("<details");
    // Chart and expandable table keep the full available width.
    const trendCardSlot = html.lastIndexOf('data-slot="card"', html.indexOf('id="analytics-trend-heading"'));
    const trendCardTag = html.slice(html.lastIndexOf("<", trendCardSlot), html.indexOf(">", trendCardSlot) + 1);
    expect(trendCardTag.match(/class="([^"]*)"/)?.[1].split(/\s+/)).toContain("lg:col-span-full");
    const courierRegion = html.slice(
      html.indexOf('id="analytics-courier-heading"'),
      html.indexOf('aria-label="Tabel performa kurir"'),
    );
    expect(courierRegion).toContain("<figure");
    expect(courierRegion).toContain("<details");
    // Spec 19 M-3: a denominator below 10 is marked and never ranks above a
    // higher-volume courier by rate alone, even when the repository lists it first.
    const courierTable = html.slice(
      html.indexOf('aria-label="Tabel performa kurir"'),
      html.indexOf('id="kiriman-analitik"'),
    );
    expect(courierTable).toContain("Volume rendah (n = 5)");
    expect(courierTable.indexOf(">JNE<")).toBeGreaterThan(-1);
    expect(courierTable.indexOf(">JNE<")).toBeLessThan(courierTable.indexOf(">SAP<"));
    expect(courierTable.match(/Volume rendah/g)).toHaveLength(1);
    expect(html).toContain(
      "href=\"/app/keuangan?status=VARIANCE#reconciliation-history-title\"",
    );
    expect(html).toContain("bukan pendapatan");
    expect(html).toContain(
      `href="/app/pengiriman/${fixture.shipmentId}"`,
    );
    expect(html.replace(/<[^>]+>/g, " ")).toContain("95758-260901-281");
    expect(html.replace(/<[^>]+>/g, " ")).not.toContain(fixture.shipmentId);
    expect(html).toMatch(/class="[^"]*inline-flex min-h-11[^"]*items-center[^"]*text-primary/);
    // Server pagination: page 1 of 2 disables backward links and links forward.
    const pager = html.slice(html.indexOf('aria-label="Navigasi halaman kiriman"'));
    expect(pager).toMatch(/<button[^>]*aria-label="Halaman sebelumnya"[^>]*disabled/);
    expect(pager).toMatch(/<a[^>]*aria-current="page"[^>]*aria-label="Halaman 1"/);
    expect(pager).toMatch(/<a[^>]*aria-label="Halaman berikutnya"[^>]*halaman=2/);
    // 44px targets below md (768px): every pager control that stays visible on a
    // phone, enabled or disabled, and the row detail link must reach min 44px there.
    for (const label of [
      "Halaman pertama",
      "Halaman sebelumnya",
      "Halaman berikutnya",
      "Halaman terakhir",
    ]) {
      expect(hasMobileTouchTarget(openingTagWithLabel(pager, label)), label).toBe(true);
    }
    expect(
      hasMobileTouchTarget(openingTagWithLabel(html, "Buka detail kiriman", true)),
    ).toBe(true);
    // Page-number links are exempt only because they are hidden below md.
    const numberList = pager.match(/<ul class="([^"]*)">\s*<li[^>]*>\s*<a[^>]*aria-label="Halaman 1"/);
    expect(numberList?.[1].split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "md:flex"]));
    expect(html.indexOf(">Kiriman</th>")).toBeLessThan(
      html.indexOf(">Dibuat</th>"),
    );
    expect(html).toContain(
      "href=\"/app/analitik?rentang=kustom&amp;dari=2026-07-01&amp;sampai=2026-07-07&amp;tz=Asia%2FJakarta&amp;halaman=2\"",
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
