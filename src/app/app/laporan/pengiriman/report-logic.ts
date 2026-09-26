import type { CourierPerformancePoint } from "@/app/app/laporan/pengiriman/courier-performance-chart";
import type { ReportTrendPoint } from "@/app/app/laporan/pengiriman/report-trend-chart";
import type { ShipmentReportAnalytics, ShipmentReportKpis } from "@/db/shipment-report-repository";
import type { TenantAnalyticsIssue } from "@/lib/analytics-filters";
import { analyticsIssueMessage, buildTrendBuckets, type AnalyticsRange } from "@/lib/analytics-range";
import { courierIssueRate, isLowVolumeCourier, orderCouriersForRanking, type CourierRateRow } from "@/lib/courier-volume";
import { serviceDisplayName } from "@/lib/labels/courier";
import { groupRegions, groupRoutes, type RegionTotal, type RouteTotal } from "@/lib/shipment-report-analytics";

export const REPORT_PATH = "/app/laporan/pengiriman";
/** Rows per page on screen (the CSV always carries the whole filtered set). */
export const REPORT_PAGE_SIZE = 20;
export const REPORT_EXPORT_PATH = "/app/laporan/pengiriman/export.csv";

const number = new Intl.NumberFormat("id-ID");

export function reportIssueMessage(issue: TenantAnalyticsIssue) {
  switch (issue) {
    case "outlet_tidak_dikenal": return "Outlet tidak tersedia pada gerai ini.";
    case "kurir_tidak_dikenal": return "Kurir tidak tersedia pada gerai ini.";
    case "status_tidak_dikenal": return "Status kiriman tidak dikenali.";
    case "basis_tidak_dikenal": return "Basis laporan tidak dikenali.";
    default: return analyticsIssueMessage(issue);
  }
}

/**
 * The URL state the report carries into its pagination and its CSV link: the canonical query
 * without the page (and without `basis`, which this page never sets). The export link therefore
 * asks for exactly the filtered set on screen, never only the page being viewed.
 */
export function reportCarry(canonicalQuery: URLSearchParams): Record<string, string> {
  const carry = new URLSearchParams(canonicalQuery);
  carry.delete("halaman");
  carry.delete("basis");
  return Object.fromEntries(carry);
}

export function reportExportHref(carry: Readonly<Record<string, string>>) {
  const query = new URLSearchParams(carry).toString();
  return query ? `${REPORT_EXPORT_PATH}?${query}` : REPORT_EXPORT_PATH;
}

/** Filters that differ from the default (30 hari, every outlet, courier and status). */
export function activeFilterCount(input: {
  courier: string | null;
  lifecycleStatus: string | null;
  outletId: string | null;
  presetId: string;
}) {
  return Number(Boolean(input.outletId))
    + Number(Boolean(input.courier))
    + Number(Boolean(input.lifecycleStatus))
    + Number(input.presetId !== "30-hari");
}

/**
 * Chart points in ranking order; a courier with no answered submission has no bar. The label
 * beside a bar always carries its denominator ("92% · 11/12"); low-volume couriers (fewer than
 * `COURIER_LOW_VOLUME_THRESHOLD` answers) rank last and are named once under the chart.
 */
export function courierPerformancePoints(rows: readonly CourierRateRow[]): CourierPerformancePoint[] {
  return orderCouriersForRanking(rows)
    .filter((row) => row.resolvedSubmissionCount > 0)
    .map((row) => {
      const rate = Math.round(courierIssueRate(row));
      return {
        courier: serviceDisplayName(row.courier),
        label: `${number.format(rate)}% · ${number.format(row.issuedCount)}/${number.format(row.resolvedSubmissionCount)}`,
        lowVolume: isLowVolumeCourier(row),
        rate,
      };
    });
}

export type ReportAnalyticsView = {
  granularity: "harian" | "bulanan";
  kpis: ShipmentReportKpis;
  regions: { cities: RegionTotal[]; provinces: RegionTotal[] };
  routes: RouteTotal[];
  trend: ReportTrendPoint[];
};

/**
 * Spec 19 RPT-SHP-TREND-TOTALS (T-254): the period totals written in the trend legend. Every bucket
 * of the range is drawn, so COD + Non-COD = RPT-SHP-ROWS and the value = RPT-SHP-COD-VALUE-TOTAL.
 */
export function reportTrendTotals(trend: readonly ReportTrendPoint[]) {
  return trend.reduce(
    (sum, point) => ({ cod: sum.cod + point.cod, codValue: sum.codValue + point.codValue, nonCod: sum.nonCod + point.nonCod }),
    { cod: 0, codValue: 0, nonCod: 0 },
  );
}

/**
 * T-235: the analytics read shaped for the view. Every bucket of the range is present (a day with no
 * shipment is a zero, not a gap in the line), and the wilayah and routes are folded from the
 * outlet × area rows by the one parser.
 */
export function reportAnalyticsView(range: AnalyticsRange, analytics: ShipmentReportAnalytics): ReportAnalyticsView {
  const byKey = new Map(analytics.trend.map((row) => [row.key, row]));
  return {
    granularity: range.granularity,
    kpis: analytics.kpis,
    regions: groupRegions(analytics.areas),
    routes: groupRoutes(analytics.areas),
    trend: buildTrendBuckets(range).map((bucket) => {
      const row = byKey.get(bucket.key);
      return { cod: row?.codCount ?? 0, codValue: row?.codValueIdr ?? 0, label: bucket.label, nonCod: row?.nonCodCount ?? 0 };
    }),
  };
}
