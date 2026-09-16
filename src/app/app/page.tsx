import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  CourierRecapSkeleton,
  DashboardCourierRecapRegion,
  DashboardHeaderActions,
  DashboardOutcomeRegion,
  DashboardPeriodSummaryRegion,
  DashboardPeriodSupportRegion,
  DashboardPeriodTrendRegion,
  DashboardRecentRegion,
  dashboardOverviewGridClassName,
  OutcomeSkeleton,
  OutletReadinessRegion,
  PeriodSummarySkeleton,
  PeriodSupportSkeleton,
  PeriodTrendSkeleton,
  ReadinessSkeleton,
  RecentSkeleton,
  type DashboardPeriodContext,
} from "@/app/app/dashboard-regions";
import { DashboardPeriodFilter } from "@/app/app/dashboard-period-filter";
import { PageHeader } from "@/components/cms/page-header";
import { PageContainer } from "@/components/cms/page-container";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db/client";
import { listOutletReadinessSummary } from "@/db/outlet-readiness-repository";
import {
  loadTenantDashboardCourierRecap,
  loadTenantDashboardMetrics,
  loadTenantDashboardOutcomeSummary,
  loadTenantDashboardPeriodSummary,
  loadTenantDashboardPeriodSupport,
  loadTenantDashboardPeriodTrend,
  loadTenantDashboardShipments,
} from "@/db/tenant-dashboard-repository";
import type { TenantDashboardPeriodSupportKind } from "@/db/tenant-dashboard-repository";
import { withTenantContext } from "@/db/tenant-context";
import { buildAnalyticsDecisionContext } from "@/lib/analytics-decision-context";
import {
  analyticsIssueMessage,
  buildTrendBuckets,
  parseAnalyticsRange,
  serializeAnalyticsRange,
} from "@/lib/analytics-range";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { DATA_STALE_AFTER_MS } from "@/lib/data-freshness";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

type TenantDashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function delayResult<T>(promise: Promise<T>, delayMs: number) {
  return promise.then((value) => new Promise<T>((resolve) => {
    setTimeout(() => resolve(value), delayMs);
  }));
}

export default async function TenantDashboardPage({ searchParams }: TenantDashboardPageProps) {
  const rawParams = await searchParams;
  const requestedDraft = rawParams.draft;
  const draftId = Array.isArray(requestedDraft) ? requestedDraft[0] : requestedDraft;
  if (draftId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draftId)) {
    redirect(`/app/pengiriman/baru?draft=${encodeURIComponent(draftId)}`);
  }

  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute(
        (await headers()).get(UI_AUDIT_HEADER),
        "/app",
      )
    : null;

  if (auditScenario === "dashboard-page-error") {
    throw new Error("Intentional development-only dashboard page failure.");
  }

  let metricsPromise = withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => loadTenantDashboardMetrics(tx, context)).then((metrics) => {
    if (auditScenario === "dashboard-first-run") {
      return {
        ...metrics,
        actionRequiredBreakdown: { awaitingUpstreamPayment: 0, failed: 0, submissionUnknown: 0 },
        summary: { actionRequired: 0, issuedToday: 0, readyToProgress: 0, total: 0 },
        workflowBreakdown: { draft: 0, estimated: 0, issuedToday: 0 },
      };
    }
    if (auditScenario === "dashboard-period-demo" || auditScenario === "dashboard-period-error") {
      return {
        ...metrics,
        actionRequiredBreakdown: { awaitingUpstreamPayment: 1, failed: 1, submissionUnknown: 1 },
        summary: { actionRequired: 3, issuedToday: 8, readyToProgress: 4, total: 18 },
        workflowBreakdown: { draft: 2, estimated: 2, issuedToday: 8 },
      };
    }
    return auditScenario === "dashboard-stale" ? {
      ...metrics,
      generatedAt: new Date(metrics.generatedAt.getTime() - DATA_STALE_AFTER_MS - 60_000),
    } : metrics;
  });
  if (auditScenario === "dashboard-stream") {
    metricsPromise = delayResult(metricsPromise, 1_000);
  }
  const outletsPromise = withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    listOutletReadinessSummary,
  );
  let actionPromise = withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => loadTenantDashboardShipments(tx, context, { limit: 5, mode: "actionable" })).then((rows) => {
    if (auditScenario === "dashboard-action-error") {
      throw new Error("Intentional development-only dashboard action-region failure.");
    }
    if (auditScenario === "dashboard-action-empty" || auditScenario === "dashboard-first-run") {
      return [];
    }
    return rows;
  });
  let recentPromise = withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => loadTenantDashboardShipments(tx, context, { limit: 8, mode: "recent" })).then((rows) => auditScenario === "dashboard-first-run" ? [] : rows);
  if (auditScenario === "dashboard-stream") {
    actionPromise = delayResult(actionPromise, 1_800);
    recentPromise = delayResult(recentPromise, 2_400);
  }
  const outletRows = await outletsPromise;
  const requestedOutletId = firstValue(rawParams.outlet);
  const selectedOutlet = outletRows.find((outlet) => outlet.id === requestedOutletId);
  const invalidOutlet = Boolean(requestedOutletId && !selectedOutlet);
  const requestedSupport = firstValue(rawParams.support);
  const supportKind = (
    ["created", "cod", "non-cod", "issued"] as const
  ).find((kind) => kind === requestedSupport);
  const demoChart = process.env.NODE_ENV === "development" && firstValue(rawParams.demo) === "grafik";
  const now = new Date();
  const range = parseAnalyticsRange({
    ...rawParams,
    rentang: rawParams.rentang ?? "7-hari",
  }, now);
  const decisionContext = buildAnalyticsDecisionContext(range);
  const periodContext: DashboardPeriodContext = {
    periodLabel: decisionContext.periodLabel,
    previousPeriodLabel: decisionContext.previousPeriodLabel,
    range,
    timezoneLabel: decisionContext.timezoneLabel,
  };
  const periodFilters = selectedOutlet ? { outletId: selectedOutlet.id } : {};
  const periodReads = invalidOutlet ? null : (() => {
    let summary = withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => loadTenantDashboardPeriodSummary(tx, context, decisionContext.currentRange, decisionContext.previousRange, periodFilters)).then((value) => {
      if (auditScenario === "dashboard-period-error") throw new Error("Intentional development-only dashboard period failure.");
      if (auditScenario === "dashboard-first-run" || auditScenario === "dashboard-period-empty") return {
        ...value,
        current: { codCount: 0, createdCount: 0, issuedCount: 0, nonCodCount: 0 },
      };
      if (auditScenario === "dashboard-period-demo") return {
        ...value,
        current: { codCount: 7, createdCount: 12, issuedCount: 8, nonCodCount: 5 },
        previous: { codCount: 5, createdCount: 9, issuedCount: 6, nonCodCount: 4 },
      };
      return auditScenario === "dashboard-stale" ? {
        ...value,
        generatedAt: new Date(value.generatedAt.getTime() - DATA_STALE_AFTER_MS - 60_000),
      } : value;
    });
    const readTrend = (trendRange: typeof range, previous = false) => {
      if (range.spanDays <= 1 || (previous && range.granularity !== "harian")) return Promise.resolve([]);
      if (demoChart) return Promise.resolve(buildTrendBuckets(trendRange).map((bucket, index) => ({
        key: bucket.key,
        codCount: (previous ? [8, 12, 9, 16, 11, 15, 13] : [12, 18, 15, 24, 20, 29, 25])[index % 7],
        nonCodCount: (previous ? [4, 5, 4, 6, 5, 7, 5] : [6, 7, 6, 9, 8, 11, 10])[index % 7],
      })));
      return withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => loadTenantDashboardPeriodTrend(tx, context, trendRange, periodFilters)).then((rows) =>
        auditScenario === "dashboard-period-demo" ? buildTrendBuckets(trendRange).map((bucket, index) => ({ codCount: index % 3 + 1, key: bucket.key, nonCodCount: index % 2 + (previous ? 0 : 1) }))
          : auditScenario === "dashboard-period-empty" || auditScenario === "dashboard-first-run" ? [] : rows);
    };
    let trend = readTrend(decisionContext.currentRange);
    const previousTrend = readTrend(decisionContext.previousRange, true);
    if (auditScenario === "dashboard-stream") {
      summary = delayResult(summary, 1_200);
      trend = delayResult(trend, 2_000);
    }
    const support = supportKind
      ? withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => loadTenantDashboardPeriodSupport(tx, context, decisionContext.currentRange, supportKind, periodFilters))
      : null;
    const outcome = withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => loadTenantDashboardOutcomeSummary(tx, context, decisionContext.currentRange, periodFilters));
    const courierRecap = withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => loadTenantDashboardCourierRecap(tx, context, decisionContext.currentRange, periodFilters));
    return { courierRecap, outcome, summary, support, trend, previousTrend };
  })();
  const todayLocalDate = parseAnalyticsRange({ rentang: "hari-ini", tz: range.timezone }, now).startDate;
  const activeFilterCount = Number(range.presetId !== "7-hari") + Number(Boolean(selectedOutlet));
  const analyticsQuery = serializeAnalyticsRange(range);
  if (selectedOutlet) analyticsQuery.set("outlet", selectedOutlet.id);
  const analyticsHref = principal.role === "TENANT_ADMIN" ? `/app/analitik?${analyticsQuery.toString()}` : undefined;
  const supportingLinks = Object.fromEntries(
    (["created", "cod", "non-cod", "issued"] as const).map((kind) => {
      const params = new URLSearchParams(analyticsQuery);
      params.set("support", kind);
      return [kind, `/app?${params.toString()}#dashboard-period-support`];
    }),
  ) as Record<TenantDashboardPeriodSupportKind, string>;
  const resolvedOutletsPromise = Promise.resolve(outletRows);

  return (
    <PageContainer>
      <PageHeader eyebrow="Operasional tenant" actions={<Suspense fallback={<Skeleton className="h-8 w-40 max-md:h-11 max-sm:w-full" />}><DashboardHeaderActions promise={resolvedOutletsPromise} role={principal.role} /></Suspense>} focusTargetId="dashboard-page-heading" title="Ringkasan" />

      <Suspense fallback={<ReadinessSkeleton />}><OutletReadinessRegion promise={resolvedOutletsPromise} role={principal.role} /></Suspense>

      {/* The filter bar is the header's toolbar row and the line under it names the applied dates, zone, and outlet at every width; the period heading stays for the document outline only. */}
      <section aria-labelledby="dashboard-period-heading" className="grid gap-4">
        <h2 className="sr-only" id="dashboard-period-heading">Ringkasan periode</h2>
        <div className="space-y-3">
          <DashboardPeriodFilter activeCount={activeFilterCount} comparisonLabel={decisionContext.previousPeriodLabel} key={analyticsQuery.toString()} outlets={outletRows} rangeLabel={decisionContext.periodLabel} timezoneLabel={decisionContext.timezoneLabel} todayLocalDate={todayLocalDate} values={{ endDate: range.lastIncludedDate, outletId: selectedOutlet?.id, presetId: range.presetId, startDate: range.startDate }} />
          <p className="max-w-2xl text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{decisionContext.periodLabel} · {decisionContext.timezoneLabel} · {selectedOutlet?.name ?? "Semua outlet"}</p>
          {range.issues.length > 0 ? <Alert><AlertTitle>Filter disesuaikan</AlertTitle><AlertDescription><ul className="list-disc pl-5">{range.issues.map((issue, index) => <li key={`${issue}-${index}`}>{analyticsIssueMessage(issue)}</li>)}</ul></AlertDescription></Alert> : null}
          {invalidOutlet ? <Alert variant="destructive"><AlertTitle>Filter outlet ditolak</AlertTitle><AlertDescription>Outlet pada alamat halaman tidak tersedia untuk tenant ini.<div className="mt-3"><Button asChild variant="outline"><Link href="/app">Reset ke filter aman</Link></Button></div></AlertDescription></Alert> : null}
        </div>
        {periodReads ? <Suspense fallback={<PeriodSummarySkeleton />}><DashboardPeriodSummaryRegion analyticsHref={analyticsHref} context={periodContext} lifetimeMetricsPromise={metricsPromise} outletReady={outletRows.some((outlet) => outlet.ready)} promise={periodReads.summary} supportingLinks={supportingLinks} /></Suspense> : null}
        {periodReads?.support && supportKind ? <Suspense fallback={<PeriodSupportSkeleton />}><DashboardPeriodSupportRegion context={periodContext} kind={supportKind} promise={periodReads.support} /></Suspense> : null}
      </section>

      {periodReads ? (
        <Suspense fallback={<OutcomeSkeleton />}><DashboardOutcomeRegion context={periodContext} promise={periodReads.outcome} /></Suspense>
      ) : null}

      <div className={dashboardOverviewGridClassName}>
        {periodReads ? <Suspense fallback={<PeriodTrendSkeleton />}><DashboardPeriodTrendRegion context={periodContext} demo={demoChart} previousPromise={periodReads.previousTrend} promise={periodReads.trend} /></Suspense> : null}
        <Suspense fallback={<RecentSkeleton />}><DashboardRecentRegion actionPromise={actionPromise} multipleOutlets={outletRows.length > 1} recentPromise={recentPromise} role={principal.role} /></Suspense>
      </div>

      {periodReads ? (
        <Suspense fallback={<CourierRecapSkeleton />}><DashboardCourierRecapRegion context={periodContext} promise={periodReads.courierRecap} /></Suspense>
      ) : null}

    </PageContainer>
  );
}
