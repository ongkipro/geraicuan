import type { Metadata } from "next";

import { requireReportAdmin } from "@/app/app/laporan/_components/report-access";
import { paginateRows } from "@/app/app/laporan/cetak-resi/print-history-logic";
import { PAYOUT_PAGE_SIZE, PAYOUT_TABS, parsePayoutTab, payoutCarry, type PayoutTabKey } from "@/app/app/laporan/pencairan/payout-logic";
import { PayoutView } from "@/app/app/laporan/pencairan/payout-view";
import { db } from "@/db/client";
import { loadOwnerMoney, ownerPayoutState, summarizeOwnerMoney } from "@/db/owner-money-repository";
import { withTenantContext } from "@/db/tenant-context";
import { listTenantOutlets } from "@/db/tenant-repository";
import { analyticsIssueMessage, formatRangeLabel, parseAnalyticsRange, parsePageNumber } from "@/lib/analytics-range";

export const metadata: Metadata = { robots: { index: false }, title: "Pencairan COD" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** T-275 (D-41, PR-96): the owner's COD payouts and ongkir margin — Tenant Admin only. */
export default async function PayoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await requireReportAdmin();
  const params = await searchParams;
  const range = parseAnalyticsRange(params, new Date());
  const tab = parsePayoutTab(params.status);
  const requestedPage = parsePageNumber(params.halaman);
  const requestedOutlet = first(params.outlet);

  const { money, outletId, outlets } = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    const outlets = await listTenantOutlets(tx, context);
    // An outlet this gerai does not own is never applied; the page says so.
    const outletId = outlets.some((outlet) => outlet.id === requestedOutlet) ? requestedOutlet! : null;
    return { money: await loadOwnerMoney(tx, context, range, { outletId }), outletId, outlets };
  });
  const issues = [
    ...[...range.issues, ...requestedPage.issues].map(analyticsIssueMessage),
    ...(requestedOutlet && !outletId ? ["Outlet tidak tersedia pada gerai ini. Filter outlet diabaikan."] : []),
  ];

  const states = money.rows.map((row) => ({ row, state: ownerPayoutState(row) }));
  const tabCounts = Object.fromEntries(PAYOUT_TABS.map((candidate) => [
    candidate.key,
    states.filter(({ state }) => state === candidate.state).length,
  ])) as Record<PayoutTabKey, number>;
  const activeState = PAYOUT_TABS.find((candidate) => candidate.key === tab)!.state;
  const shown = paginateRows(states.filter(({ state }) => state === activeState).map(({ row }) => row), requestedPage.page, PAYOUT_PAGE_SIZE);

  return (
    <PayoutView
      activeCount={Number(Boolean(outletId)) + Number(range.presetId !== "30-hari")}
      carry={payoutCarry(range, outletId)}
      issues={[...new Set(issues)]}
      lastPullAt={money.lastPullAt}
      now={money.generatedAt}
      outletId={outletId}
      outlets={outlets.map((outlet) => ({ id: outlet.id, name: outlet.name }))}
      page={shown.page}
      range={{
        endDate: range.lastIncludedDate,
        periodLabel: formatRangeLabel(range).periodLabel,
        presetId: range.presetId,
        startDate: range.startDate,
        timezone: range.timezone,
      }}
      rows={shown.rows}
      summary={summarizeOwnerMoney(money.rows)}
      tab={tab}
      tabCounts={tabCounts}
      totalPages={shown.totalPages}
      truncated={money.truncated}
    />
  );
}
