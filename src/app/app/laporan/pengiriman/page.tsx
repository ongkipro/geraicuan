import type { Metadata } from "next";

import {
  activeFilterCount,
  courierPerformancePoints,
  REPORT_PAGE_SIZE,
  reportCarry,
  reportExportHref,
  reportIssueMessage,
} from "@/app/app/laporan/pengiriman/report-logic";
import { ShipmentReportView } from "@/app/app/laporan/pengiriman/report-view";
import { requireReportAdmin } from "@/app/app/laporan/_components/report-access";
import type { CourierPerformancePoint } from "@/app/app/laporan/pengiriman/courier-performance-chart";
import { loadAnalyticsFilterOptions, loadCourierPerformance } from "@/db/analytics-repository";
import { db } from "@/db/client";
import { shipmentStatuses } from "@/db/schema";
import { loadShipmentReportPage, type ShipmentReportPage } from "@/db/shipment-report-repository";
import { withTenantContext } from "@/db/tenant-context";
import { parseTenantAnalyticsQuery } from "@/lib/analytics-filters";
import { formatRangeLabel } from "@/lib/analytics-range";
import { serviceDisplayName } from "@/lib/labels/courier";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";

export const metadata: Metadata = { robots: { index: false }, title: "Laporan pengiriman" };

export default async function ShipmentReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireReportAdmin();
  const now = new Date();
  const params = await searchParams;
  const options = await withTenantContext(db, principal.userId, principal.tenantId, loadAnalyticsFilterOptions);
  const parsed = parseTenantAnalyticsQuery(params, {
    knownCouriers: options.couriers,
    knownOutletIds: options.outlets.map((outlet) => outlet.id),
    now,
  });
  const { filters, page, range } = parsed.query;

  const empty: ShipmentReportPage = {
    generatedAt: now,
    page: 1,
    pageSize: REPORT_PAGE_SIZE,
    rows: [],
    totals: { byCourier: [], byLifecycle: [], shipmentCount: 0 },
    totalPages: 1,
  };
  // A rejected filter (an outlet or courier this gerai does not own) reads nothing at all.
  const data = parsed.filterRejected
    ? empty
    : await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      loadShipmentReportPage(tx, context, { filters, page, pageSize: REPORT_PAGE_SIZE, range }));

  // Its own transaction, so a failed read degrades only the "Performa kurir" card.
  let performance: CourierPerformancePoint[] | null = [];
  if (!parsed.filterRejected && data.totals.shipmentCount > 0) {
    try {
      performance = courierPerformancePoints(await withTenantContext(db, principal.userId, principal.tenantId,
        (tx, context) => loadCourierPerformance(tx, context, range, filters)));
    } catch {
      performance = null;
    }
  }

  const carry = reportCarry(parsed.canonicalQuery);

  return (
    <ShipmentReportView
      activeCount={activeFilterCount({ ...filters, presetId: range.presetId })}
      carry={carry}
      data={data}
      exportHref={reportExportHref(carry)}
      filterRejected={parsed.filterRejected}
      filters={filters}
      issues={[...new Set(parsed.issues.map(reportIssueMessage))]}
      options={{
        couriers: options.couriers.map((courier) => ({ label: serviceDisplayName(courier), value: courier })),
        outlets: options.outlets.map((outlet) => ({ label: outlet.name, value: outlet.id })),
        statuses: shipmentStatuses.map((status) => ({ label: SHIPMENT_STATUS_PRESENTATION[status].label, value: status })),
      }}
      performance={performance}
      range={{
        endDate: range.lastIncludedDate,
        periodLabel: formatRangeLabel(range).periodLabel,
        presetId: range.presetId,
        startDate: range.startDate,
      }}
    />
  );
}
