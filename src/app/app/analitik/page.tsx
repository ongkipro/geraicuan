import { CircleAlert, Download, PackageOpen } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  AnalyticsCourierRegion,
  AnalyticsCourierSkeleton,
  AnalyticsReconciliationRegion,
  AnalyticsReconciliationSkeleton,
  AnalyticsShipmentRegion,
  AnalyticsShipmentSkeleton,
  AnalyticsSummaryRegion,
  AnalyticsSummarySkeleton,
  AnalyticsTrendRegion,
  AnalyticsTrendSkeleton,
  type AnalyticsResolvedRegionProps,
} from "@/app/app/analitik/analytics-regions";
import { AnalyticsFilterFields } from "@/app/app/analitik/analytics-filter-fields";
import { AnalyticsFilterSheet } from "@/app/app/analitik/analytics-filter-sheet";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import {
  countTenantShipments,
  loadAnalyticsFilterOptions,
  loadCourierPerformance,
  loadShipmentKpiComparison,
  loadShipmentPage,
  loadShipmentTrend,
  type ShipmentKpiComparison,
} from "@/db/analytics-repository";
import { summarizeLatestReconciliationVariances } from "@/db/ledger-repository";
import { withTenantContext } from "@/db/tenant-context";
import { buildAnalyticsDecisionContext } from "@/lib/analytics-decision-context";
import { parseTenantAnalyticsQuery, type TenantAnalyticsIssue } from "@/lib/analytics-filters";
import {
  ANALYTICS_PRESETS,
  ANALYTICS_TIMEZONES,
  analyticsIssueMessage,
  parseAnalyticsRange,
} from "@/lib/analytics-range";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { DATA_STALE_AFTER_MS } from "@/lib/data-freshness";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER, type UiAuditScenario } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

const PAGE_SIZE = 50;

type AnalyticsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type FilterChip = { href: string; label: string };

function withoutFilter(query: URLSearchParams, key: "basis" | "kurir" | "outlet" | "rentang" | "status" | "tz") {
  const params = new URLSearchParams(query);
  params.delete("halaman");
  if (key === "rentang") {
    params.set("rentang", "30-hari");
    params.delete("dari");
    params.delete("sampai");
  } else if (key === "tz") {
    params.set("tz", "Asia/Jakarta");
  } else if (key === "basis") {
    params.delete("basis");
  } else {
    params.delete(key);
  }
  return `/app/analitik?${params.toString()}`;
}

function tenantAnalyticsIssueMessage(issue: TenantAnalyticsIssue) {
  switch (issue) {
    case "outlet_tidak_dikenal": return "Outlet tidak tersedia pada tenant ini. Filter ditolak.";
    case "kurir_tidak_dikenal": return "Kurir tidak tersedia pada tenant ini. Filter ditolak.";
    case "status_tidak_dikenal": return "Lifecycle tidak dikenali. Filter ditolak.";
    case "basis_tidak_dikenal": return "Basis tabel tidak dikenali. Filter ditolak.";
    default: return analyticsIssueMessage(issue);
  }
}

function delayResult<T>(promise: Promise<T>, delayMs: number) {
  return promise.then((value) => new Promise<T>((resolve) => {
    setTimeout(() => resolve(value), delayMs);
  }));
}

function auditRegionPromise<T>(promise: Promise<T>, scenario: UiAuditScenario | null, region: "courier" | "shipment" | "summary" | "trend") {
  if (scenario === "analytics-trend-error" && region === "trend") {
    return promise.then(() => { throw new Error("Intentional development-only analytics trend-region failure."); });
  }
  if (scenario !== "analytics-stream") return promise;
  const delayByRegion = { summary: 600, trend: 1_200, courier: 1_800, shipment: 2_400 };
  return delayResult(promise, delayByRegion[region]);
}

function auditSummaryPromise(promise: Promise<ShipmentKpiComparison>, scenario: UiAuditScenario | null) {
  const transformed = promise.then((value) => scenario === "analytics-stale" ? {
    ...value,
    eventGeneratedAt: new Date(
      value.eventGeneratedAt.getTime() - DATA_STALE_AFTER_MS - 60_000,
    ),
    backlogSnapshot: {
      ...value.backlogSnapshot,
      asOf: new Date(value.backlogSnapshot.asOf.getTime() - DATA_STALE_AFTER_MS - 60_000),
    },
  } : value);
  return auditRegionPromise(transformed, scenario, "summary");
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  if (principal.role !== "TENANT_ADMIN") {
    redirect("/app");
  }

  const now = new Date();
  const auditScenarioPromise = process.env.NODE_ENV === "development"
    ? headers().then((values) => parseUiAuditScenarioForRoute(
        values.get(UI_AUDIT_HEADER),
        "/app/analitik",
      ))
    : Promise.resolve(null);
  const [rawParams, baseData, auditScenario] = await Promise.all([
    searchParams,
    withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => ({
      filterOptions: await loadAnalyticsFilterOptions(tx, context),
      tenantShipmentCount: await countTenantShipments(tx, context),
    })),
    auditScenarioPromise,
  ]);
  if (auditScenario === "analytics-page-error") {
    throw new Error("Intentional development-only analytics page failure.");
  }
  const auditForcesRegionReads = auditScenario === "analytics-stale"
    || auditScenario === "analytics-stream"
    || auditScenario === "analytics-trend-error";
  const tenantShipmentCount = auditScenario === "analytics-first-run"
    ? 0
    : auditForcesRegionReads
      ? Math.max(1, baseData.tenantShipmentCount)
      : baseData.tenantShipmentCount;
  const parsed = parseTenantAnalyticsQuery(rawParams, {
    knownCouriers: baseData.filterOptions.couriers,
    knownOutletIds: baseData.filterOptions.outlets.map((outlet) => outlet.id),
    now,
  });
  const { eventBasis, filters, page: requestedPage, range } = parsed.query;
  const decisionContext = buildAnalyticsDecisionContext(range);
  const canonicalQuery = new URLSearchParams(parsed.canonicalQuery);
  canonicalQuery.delete("halaman");
  const canonicalQueryString = canonicalQuery.toString();
  const exportHref = `/app/analitik/export.csv?${canonicalQueryString}`;
  const selectedOutlet = baseData.filterOptions.outlets.find((outlet) => outlet.id === filters.outletId);
  const activeDimensionCount = Number(Boolean(filters.outletId)) + Number(Boolean(filters.courier)) + Number(Boolean(filters.lifecycleStatus));
  const activeCount = activeDimensionCount + Number(range.presetId !== "30-hari") + Number(range.timezone !== "Asia/Jakarta") + Number(eventBasis !== "created");
  const chips: FilterChip[] = [];
  if (range.presetId !== "30-hari") chips.push({ href: withoutFilter(canonicalQuery, "rentang"), label: `Periode: ${ANALYTICS_PRESETS.find((item) => item.id === range.presetId)?.label ?? decisionContext.periodLabel}` });
  if (range.timezone !== "Asia/Jakarta") chips.push({ href: withoutFilter(canonicalQuery, "tz"), label: `Zona: ${ANALYTICS_TIMEZONES.find((item) => item.id === range.timezone)?.label ?? range.timezone}` });
  if (selectedOutlet) chips.push({ href: withoutFilter(canonicalQuery, "outlet"), label: `Outlet: ${selectedOutlet.name}` });
  if (filters.courier) chips.push({ href: withoutFilter(canonicalQuery, "kurir"), label: `Kurir: ${filters.courier}` });
  if (filters.lifecycleStatus) chips.push({ href: withoutFilter(canonicalQuery, "status"), label: `Lifecycle: ${SHIPMENT_STATUS_PRESENTATION[filters.lifecycleStatus].label}` });
  if (eventBasis !== "created") chips.push({ href: withoutFilter(canonicalQuery, "basis"), label: `Basis: ${eventBasis === "issued" ? "Resi terbit" : eventBasis === "outcome" ? "Outcome provider" : "Pengecualian saat ini"}` });

  const filterValues = {
    courier: filters.courier,
    endDate: range.lastIncludedDate,
    eventBasis,
    lifecycleStatus: filters.lifecycleStatus,
    outletId: filters.outletId,
    presetId: range.presetId,
    startDate: range.startDate,
    timezone: range.timezone,
  };
  const todayLocalDate = parseAnalyticsRange({ rentang: "hari-ini", tz: range.timezone }, now).startDate;
  const regionContext: AnalyticsResolvedRegionProps = {
    activeDimensionCount,
    canonicalQuery: canonicalQueryString,
    eventBasis,
    periodLabel: decisionContext.periodLabel,
    previousPeriodLabel: decisionContext.previousPeriodLabel,
    range,
    role: principal.role,
    timezoneLabel: decisionContext.timezoneLabel,
  };

  const reads = parsed.filterRejected || tenantShipmentCount === 0 ? null : (() => {
    const comparison = withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => loadShipmentKpiComparison(tx, context, decisionContext.currentRange, decisionContext.previousRange, filters));
    const reconciliationVariance = withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => summarizeLatestReconciliationVariances(tx, context));
    const summary = auditSummaryPromise(comparison, auditScenario);
    const trend = auditRegionPromise(withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => loadShipmentTrend(tx, context, range, filters)), auditScenario, "trend");
    const shipment = auditRegionPromise(withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => loadShipmentPage(tx, context, range, { limit: PAGE_SIZE, offset: (requestedPage - 1) * PAGE_SIZE }, filters, eventBasis)), auditScenario, "shipment");
    const courier = auditRegionPromise(withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => loadCourierPerformance(tx, context, range, filters)), auditScenario, "courier");
    return { comparison, courier, reconciliationVariance, shipment, summary, trend };
  })();

  return (
    <PageContainer width="wide">
      <PageHeader actions={parsed.filterRejected ? null : <Button asChild variant="outline"><Link href={exportHref}><Download aria-hidden="true" />Ekspor CSV</Link></Button>} description="Ringkasan operasional dan nilai kiriman mengikuti filter; exception tenant-wide ditandai terpisah." focusTargetId="analytics-page-heading" title="Analitik" />

      <Card className="hidden md:flex" size="sm">
        <CardHeader className="border-b"><CardTitle>Filter analitik</CardTitle><CardDescription>Satu filter untuk KPI, tren, tabel, dan ekspor.</CardDescription></CardHeader>
        <CardContent><form action="/app/analitik" className="space-y-4" method="get"><AnalyticsFilterFields key={canonicalQueryString} layout="desktop" options={baseData.filterOptions} todayLocalDate={todayLocalDate} values={filterValues} /><p className="text-xs leading-5 text-muted-foreground">Tanggal awal dan akhir dipakai saat memilih Rentang khusus. Menerapkan filter selalu kembali ke halaman pertama.</p><div className="flex flex-wrap justify-end gap-2"><Button type="submit">Terapkan filter</Button>{activeCount > 0 ? <Button asChild variant="ghost"><Link href="/app/analitik">Reset semua</Link></Button> : null}</div></form></CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 md:hidden"><AnalyticsFilterSheet key={canonicalQueryString} activeCount={activeCount} options={baseData.filterOptions} todayLocalDate={todayLocalDate} values={filterValues} />{activeCount > 0 ? <Button asChild className="min-h-11" variant="ghost"><Link href="/app/analitik">Reset semua</Link></Button> : null}</div>

      <section aria-labelledby="period-context-title" className="flex flex-col gap-2 border-y py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-medium text-foreground" id="period-context-title">{decisionContext.periodLabel}</h2><p className="text-muted-foreground">{decisionContext.timezoneLabel} / {decisionContext.presetLabel}. Created memakai waktu pembuatan; issued memakai waktu AWB provider.</p></div><p aria-live="polite" className="text-muted-foreground" id="hasil-analitik" role="status">Dibandingkan dengan <strong className="font-medium text-foreground">{decisionContext.previousPeriodLabel}</strong> / {decisionContext.timezoneLabel}.</p></section>

      {chips.length > 0 ? <section aria-label="Filter aktif" className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Filter aktif: {activeCount}</Badge>{chips.map((chip) => <Button asChild className="min-h-11 md:min-h-8" key={chip.label} size="sm" variant="outline"><Link href={chip.href}>{chip.label}<span aria-hidden="true">×</span></Link></Button>)}</section> : null}

      {parsed.issues.length > 0 ? <Alert variant={parsed.filterRejected ? "destructive" : "default"}><CircleAlert aria-hidden="true" /><AlertTitle>{parsed.filterRejected ? "Filter ditolak" : "Filter disesuaikan"}</AlertTitle><AlertDescription><ul className="list-disc pl-5">{parsed.issues.map((issue, index) => <li key={`${issue}-${index}`}>{tenantAnalyticsIssueMessage(issue)}</li>)}</ul>{parsed.filterRejected ? <div className="mt-3"><Button asChild variant="outline"><Link href="/app/analitik">Kembali ke filter aman</Link></Button></div> : null}</AlertDescription></Alert> : null}

      {parsed.filterRejected ? null : tenantShipmentCount === 0 ? (
        <EmptyState action={<Button asChild className="min-h-11"><Link href="/app/pengiriman/baru">Buat draf kiriman</Link></Button>} description="Analitik terisi setelah draf pertama dibuat dan resi diterbitkan." icon={PackageOpen} title="Belum ada kiriman" />
      ) : reads ? (
        <>
          <span aria-live="polite" className="sr-only">Analitik dimuat per bagian.</span>
          <Suspense fallback={<AnalyticsSummarySkeleton />}><AnalyticsSummaryRegion context={regionContext} promise={reads.summary} /></Suspense>
          <Suspense fallback={<AnalyticsReconciliationSkeleton />}><AnalyticsReconciliationRegion promise={reads.reconciliationVariance} /></Suspense>
          <Suspense fallback={<AnalyticsTrendSkeleton />}><AnalyticsTrendRegion context={regionContext} promise={reads.trend} /></Suspense>
          <Suspense fallback={<AnalyticsCourierSkeleton />}><AnalyticsCourierRegion context={regionContext} promise={reads.courier} /></Suspense>
          <Suspense fallback={<AnalyticsShipmentSkeleton />}><AnalyticsShipmentRegion comparisonPromise={reads.comparison} context={regionContext} promise={reads.shipment} requestedPage={requestedPage} /></Suspense>
        </>
      ) : null}
    </PageContainer>
  );
}
