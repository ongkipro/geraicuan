import type { Metadata } from "next";

import { paginateRows, printHistoryCarry } from "@/app/app/laporan/cetak-resi/print-history-logic";
import { PrintHistoryView } from "@/app/app/laporan/cetak-resi/print-history-view";
import { requireReportAdmin } from "@/app/app/laporan/_components/report-access";
import { loadAnalyticsFilterOptions } from "@/db/analytics-repository";
import { db } from "@/db/client";
import { loadPrintHistoryPage } from "@/db/label-print-repository";
import { withTenantContext } from "@/db/tenant-context";
import { analyticsIssueMessage, formatRangeLabel, parseAnalyticsRange, parsePageNumber } from "@/lib/analytics-range";

export const metadata: Metadata = { robots: { index: false }, title: "Riwayat cetak resi" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PrintHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireReportAdmin();
  const params = await searchParams;
  const range = parseAnalyticsRange(params, new Date());
  const requestedPage = parsePageNumber(params.halaman);
  const options = await withTenantContext(db, principal.userId, principal.tenantId, loadAnalyticsFilterOptions);
  const requestedOutlet = first(params.outlet);
  const knownOutlet = options.outlets.some((outlet) => outlet.id === requestedOutlet);
  // An outlet this gerai does not own is never applied; the page says so.
  const outletId = requestedOutlet && knownOutlet ? requestedOutlet : null;
  const issues = [
    ...[...range.issues, ...requestedPage.issues].map(analyticsIssueMessage),
    ...(requestedOutlet && !knownOutlet ? ["Outlet tidak tersedia pada gerai ini. Filter outlet diabaikan."] : []),
  ];

  const data = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    loadPrintHistoryPage(tx, context, { outletId, range }));
  const shown = paginateRows(data.rows, requestedPage.page);

  return (
    <PrintHistoryView
      activeCount={Number(Boolean(outletId)) + Number(range.presetId !== "30-hari")}
      carry={printHistoryCarry(range, outletId)}
      issues={[...new Set(issues)]}
      loadedCount={data.rows.length}
      outletId={outletId}
      outlets={options.outlets.map((outlet) => ({ label: outlet.name, value: outlet.id }))}
      page={shown.page}
      range={{
        endDate: range.lastIncludedDate,
        periodLabel: formatRangeLabel(range).periodLabel,
        presetId: range.presetId,
        startDate: range.startDate,
      }}
      rows={shown.rows}
      totalCount={data.totalCount}
      totalPages={shown.totalPages}
    />
  );
}
