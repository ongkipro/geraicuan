import type { CourierPerformancePoint } from "@/app/app/laporan/pengiriman/courier-performance-chart";
import type { TenantAnalyticsIssue } from "@/lib/analytics-filters";
import { analyticsIssueMessage } from "@/lib/analytics-range";
import { courierIssueRate, isLowVolumeCourier, orderCouriersForRanking, type CourierRateRow } from "@/lib/courier-volume";
import { serviceDisplayName } from "@/lib/labels/courier";

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
