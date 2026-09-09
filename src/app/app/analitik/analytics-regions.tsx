import { ChevronLeft, ChevronRight, CircleAlert, PackageOpen } from "lucide-react";
import Link from "next/link";

import { DataFreshnessControl } from "@/components/cms/data-freshness-control";
import { EmptyState } from "@/components/cms/empty-state";
import { RetryRegionButton } from "@/components/cms/retry-region-button";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CourierPerformanceRow,
  ShipmentKpiComparison,
  ShipmentPage,
  ShipmentTrend,
} from "@/db/analytics-repository";
import type { LedgerReconciliationVarianceSummary } from "@/db/ledger-repository";
import {
  analyticsShipmentDetailHref,
  type AnalyticsTenantRole,
} from "@/lib/analytics-decision-context";
import type { AnalyticsEventBasis } from "@/lib/analytics-filters";
import {
  buildTrendBuckets,
  formatInZone,
  type AnalyticsRange,
} from "@/lib/analytics-range";
import { isDataStale } from "@/lib/data-freshness";
import { reconciliationVarianceHref } from "@/lib/finance-exception-filter";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import { AnalyticsComparisonCue } from "./comparison-cue";
import { ShipmentTrendChart } from "./shipment-trend-chart";

const DEFAULT_PAGE_SIZE = 50;
const countFormatter = new Intl.NumberFormat("id-ID");
const idrFormatter = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

export type AnalyticsResolvedRegionProps = {
  activeDimensionCount: number;
  canonicalQuery: string;
  eventBasis: AnalyticsEventBasis;
  periodLabel: string;
  previousPeriodLabel: string;
  range: AnalyticsRange;
  role: AnalyticsTenantRole;
  timezoneLabel: string;
};

type Metric = {
  context?: string;
  current: number;
  href?: string;
  label: string;
  previous?: number;
  value: string;
};

type RegionResult<T> =
  | { ok: true; value: T }
  | { ok: false };

async function settle<T>(promise: Promise<T>): Promise<RegionResult<T>> {
  try {
    return { ok: true, value: await promise };
  } catch {
    return { ok: false };
  }
}

function AnalyticsRegionError({
  description,
  focusTargetId,
  title,
}: {
  description: string;
  focusTargetId: string;
  title: string;
}) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description}
        <div className="mt-3">
          <RetryRegionButton focusTargetId={focusTargetId} />
        </div>
      </AlertDescription>
    </Alert>
  );
}

function RegionHeading({
  description,
  id,
  title,
}: {
  description: string;
  id: string;
  title: string;
}) {
  return (
    <CardHeader className="border-b">
      <CardTitle
        className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        id={id}
        tabIndex={-1}
      >
        {title}
      </CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  );
}

function MetricsGrid({ metrics }: { metrics: Metric[] }) {
  const responsiveColumns = metrics.length === 1
    ? ""
    : metrics.length === 6
      ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      : metrics.length > 4
        ? "sm:grid-cols-2 xl:grid-cols-5"
        : "sm:grid-cols-2 xl:grid-cols-4";
  return (
    <dl className={`grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border ${responsiveColumns}`}>
      {metrics.map((metric) => (
        <div className={`min-w-0 bg-card p-4 ${metric.href ? "relative transition-colors hover:bg-muted/40" : ""}`} key={metric.label}>
          {metric.href ? (
            <Link
              aria-label={`${metric.label}: ${metric.value}. Lihat record pendukung`}
              className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              href={metric.href}
            />
          ) : null}
          <dt className="text-sm font-medium text-muted-foreground">
            {metric.label}
          </dt>
          <dd className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {metric.value}
          </dd>
          {metric.context ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.context}</p> : null}
          {metric.previous === undefined ? null : (
            <p className="mt-1 text-xs leading-5 text-muted-foreground [&_small]:text-xs">
              <AnalyticsComparisonCue current={metric.current} previous={metric.previous} />
            </p>
          )}
        </div>
      ))}
    </dl>
  );
}

function supportingRowsHref(canonicalQuery: string, basis: AnalyticsEventBasis) {
  const params = new URLSearchParams(canonicalQuery);
  params.delete("halaman");
  if (basis === "created") params.delete("basis");
  else params.set("basis", basis);
  return `/app/analitik?${params.toString()}#kiriman-analitik`;
}

function paginationHref(canonicalQuery: string, page: number) {
  const params = new URLSearchParams(canonicalQuery);
  params.set("halaman", String(page));
  return `/app/analitik?${params.toString()}`;
}

export async function AnalyticsSummaryRegion({
  context,
  promise,
}: {
  context: AnalyticsResolvedRegionProps;
  promise: Promise<ShipmentKpiComparison>;
}) {
  const result = await settle(promise);
  if (!result.ok) {
    return <AnalyticsRegionError description="Timestamp data belum tersedia. Tren dan tabel kiriman tetap tersedia bila berhasil dimuat." focusTargetId="analytics-summary-heading" title="Ringkasan tidak dapat dimuat" />;
  }

  const { backlogSnapshot: backlog, current: kpis, eventGeneratedAt, previous } = result.value;
  const currentSuccessRate = kpis.resolvedSubmissionCount > 0
    ? (kpis.issuedCount / kpis.resolvedSubmissionCount) * 100
    : 0;
  const previousSuccessRate = previous.resolvedSubmissionCount > 0
    ? (previous.issuedCount / previous.resolvedSubmissionCount) * 100
    : 0;
  const operationalMetrics: Metric[] = [
    { current: kpis.createdCount, href: supportingRowsHref(context.canonicalQuery, "created"), label: "Kiriman dibuat", previous: previous.createdCount, value: countFormatter.format(kpis.createdCount) },
    { context: "Berdasarkan waktu AWB diterbitkan provider.", current: kpis.issuedCount, href: supportingRowsHref(context.canonicalQuery, "issued"), label: "Resi terbit", previous: previous.issuedCount, value: countFormatter.format(kpis.issuedCount) },
    { context: `${countFormatter.format(kpis.issuedCount)} issued / ${countFormatter.format(kpis.resolvedSubmissionCount)} outcome terselesaikan.`, current: currentSuccessRate, href: supportingRowsHref(context.canonicalQuery, "outcome"), label: "Tingkat penerbitan resi", previous: previousSuccessRate, value: kpis.resolvedSubmissionCount > 0 ? `${countFormatter.format(currentSuccessRate)}%` : "—" },
    { context: `${countFormatter.format(backlog.awaitingPaymentCount)} menunggu pembayaran + ${countFormatter.format(backlog.needsActionCount)} gagal/perlu rekonsiliasi · snapshot ${formatInZone(backlog.asOf, context.range.timezone)}`, current: backlog.awaitingPaymentCount + backlog.needsActionCount, href: supportingRowsHref(context.canonicalQuery, "exceptions"), label: "Pengecualian belum selesai", value: countFormatter.format(backlog.awaitingPaymentCount + backlog.needsActionCount) },
  ];
  const financialMetrics: Metric[] = [
    { current: kpis.providerShippingIdr, label: "Ongkir provider", previous: previous.providerShippingIdr, value: idrFormatter.format(kpis.providerShippingIdr) },
    { current: kpis.codServiceFeeIdr, label: "Biaya layanan COD", previous: previous.codServiceFeeIdr, value: idrFormatter.format(kpis.codServiceFeeIdr) },
    { current: kpis.codVatIdr, label: "PPN biaya layanan", previous: previous.codVatIdr, value: idrFormatter.format(kpis.codVatIdr) },
    { context: "Titipan penerima, bukan pendapatan GeraiCUAN.", current: kpis.codPrincipalIdr, label: "Pokok COD (liabilitas)", previous: previous.codPrincipalIdr, value: idrFormatter.format(kpis.codPrincipalIdr) },
    { current: kpis.cogsIdr, label: "COGS / Modal HPP", previous: previous.cogsIdr, value: idrFormatter.format(kpis.cogsIdr) },
    { context: "Pokok COD dikurangi COGS, Ongkir, Layanan, & PPN.", current: kpis.netMarginIdr, label: "Net Margin (Estimasi)", previous: previous.netMarginIdr, value: idrFormatter.format(kpis.netMarginIdr) },
  ];

  return (
    <div className="space-y-6">
      <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Data event periode</p><DataFreshnessControl formattedGeneratedAt={formatInZone(eventGeneratedAt, context.range.timezone)} generatedAtIso={eventGeneratedAt.toISOString()} initiallyStale={isDataStale(eventGeneratedAt, new Date())} /></div>
      <p className="max-w-2xl text-xs leading-5 text-muted-foreground">Snapshot pengecualian saat ini diambil pada <time dateTime={backlog.asOf.toISOString()}>{formatInZone(backlog.asOf, context.range.timezone)}</time>. Timestamp ini tidak mewakili tren, tabel kiriman, atau rekonsiliasi tenant-wide.</p>
      <Card>
        <RegionHeading description={`Event ${context.periodLabel} dibanding ${context.previousPeriodLabel}; antrean tindakan adalah snapshot saat halaman dimuat.`} id="analytics-summary-heading" title="Ringkasan operasional" />
        <CardContent><MetricsGrid metrics={operationalMetrics} /></CardContent>
      </Card>
      <Card>
        <RegionHeading description="Nilai ledger berdasarkan waktu efektif pada rentang terpilih." id="analytics-financial-heading" title="Nilai kiriman" />
        <CardContent className="space-y-4">
          <MetricsGrid metrics={financialMetrics} />
          <Alert><CircleAlert aria-hidden="true" /><AlertTitle>Pokok COD bukan pendapatan</AlertTitle><AlertDescription>Nilai di atas bukan kas yang sudah diterima. Rekonsiliasi dan sumber ledger tersedia di buku besar.</AlertDescription></Alert>
        </CardContent>
      </Card>
    </div>
  );
}

export async function AnalyticsReconciliationRegion({
  promise,
}: {
  promise: Promise<LedgerReconciliationVarianceSummary>;
}) {
  const result = await settle(promise);
  if (!result.ok) {
    return <AnalyticsRegionError description="KPI operasional tetap tersedia. Coba muat ulang exception rekonsiliasi ini." focusTargetId="analytics-reconciliation-heading" title="Exception rekonsiliasi tidak dapat dimuat" />;
  }

  const variance = result.value;
  return (
    <Card>
      <RegionHeading description="Snapshot tenant-wide terbaru; tidak mengikuti filter periode, outlet, kurir, atau lifecycle dan bukan pendapatan." id="analytics-reconciliation-heading" title="Exception rekonsiliasi saat ini" />
      <CardContent>
        <MetricsGrid metrics={[{
          context: `${countFormatter.format(variance.varianceCount)} hasil rekonsiliasi latest aktif masih memiliki selisih.`,
          current: variance.totalSignedVarianceIdr,
          href: reconciliationVarianceHref(),
          label: "Net selisih bertanda",
          value: idrFormatter.format(variance.totalSignedVarianceIdr),
        }]} />
      </CardContent>
    </Card>
  );
}

export async function AnalyticsTrendRegion({
  context,
  promise,
}: {
  context: AnalyticsResolvedRegionProps;
  promise: Promise<ShipmentTrend>;
}) {
  const result = await settle(promise);
  if (!result.ok) {
    return <AnalyticsRegionError description="Ringkasan dan tabel kiriman tetap tersedia." focusTargetId="analytics-trend-heading" title="Tren tidak dapat dimuat" />;
  }
  const trendByKey = new Map(result.value.points.map((point) => [point.key, point] as const));
  const rows = buildTrendBuckets(context.range).map((bucket) => ({
    ...bucket,
    createdCount: trendByKey.get(bucket.key)?.createdCount ?? 0,
    issuedCount: trendByKey.get(bucket.key)?.issuedCount ?? 0,
  }));

  if (rows.every((row) => row.createdCount + row.issuedCount === 0)) {
    return <Card><RegionHeading description={`${context.periodLabel} / ${context.timezoneLabel}.`} id="analytics-trend-heading" title="Tren aktivitas" /><CardContent><EmptyState action={context.activeDimensionCount > 0 ? <Button asChild variant="outline"><Link href="/app/analitik">Reset filter</Link></Button> : undefined} description={context.activeDimensionCount > 0 ? "Kombinasi filter ini tidak memiliki event kiriman dibuat atau resi terbit." : "Tidak ada event kiriman dibuat atau resi terbit pada periode ini. Ini bukan kegagalan pemuatan data."} icon={PackageOpen} title="Tidak ada aktivitas untuk diplot" /></CardContent></Card>;
  }

  return (
    <Card>
      <RegionHeading description={`${context.periodLabel} / ${context.timezoneLabel}. Sumbu vertikal menunjukkan jumlah kiriman.`} id="analytics-trend-heading" title={`Tren ${context.range.granularity === "harian" ? "harian" : "bulanan"}`} />
      <CardContent className="space-y-5">
        <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Data tren</p><DataFreshnessControl formattedGeneratedAt={formatInZone(result.value.generatedAt, context.range.timezone)} generatedAtIso={result.value.generatedAt.toISOString()} initiallyStale={isDataStale(result.value.generatedAt, new Date())} /></div>
        <ShipmentTrendChart data={rows} granularity={context.range.granularity} />
        <details className="group rounded-lg border">
          <summary className="cursor-pointer rounded-lg px-4 py-3 text-sm font-medium outline-none marker:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
            Lihat data tren dalam tabel
          </summary>
          <div aria-label="Tabel tren kiriman" className="overflow-x-auto border-t focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_[data-slot=table-container]]:overflow-visible" role="region" tabIndex={0}>
            <Table className="min-w-[34rem]">
              <TableCaption className="px-3 pb-3 text-left">Detail jumlah kiriman dibuat dan resi terbit / {context.periodLabel} / {context.timezoneLabel}</TableCaption>
              <TableHeader><TableRow><TableHead>{context.range.granularity === "harian" ? "Tanggal" : "Bulan"}</TableHead><TableHead className="text-right">Kiriman dibuat</TableHead><TableHead className="text-right">Resi terbit</TableHead></TableRow></TableHeader>
              <TableBody>{rows.map((row) => <TableRow key={row.key}><TableCell className="font-medium" scope="row">{row.label}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row.createdCount)}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row.issuedCount)}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

export async function AnalyticsCourierRegion({
  context,
  promise,
}: {
  context: AnalyticsResolvedRegionProps;
  promise: Promise<CourierPerformanceRow[]>;
}) {
  const result = await settle(promise);
  if (!result.ok) {
    return <AnalyticsRegionError description="Ringkasan, tren, dan tabel kiriman tetap tersedia." focusTargetId="analytics-courier-heading" title="Breakdown kurir tidak dapat dimuat" />;
  }

  return (
    <Card>
      <RegionHeading description={`Tingkat penerbitan dihitung dari outcome provider yang sudah terselesaikan pada ${context.periodLabel}. Volume denominator selalu ditampilkan.`} id="analytics-courier-heading" title="Performa kurir" />
      <CardContent>
        {result.value.length > 0 ? (
          <div aria-label="Tabel performa kurir" className="overflow-x-auto rounded-lg border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_[data-slot=table-container]]:overflow-visible" role="region" tabIndex={0}>
            <Table className="min-w-[32rem]">
              <TableCaption className="px-3 pb-3 text-left">Perbandingan kurir berdasarkan waktu outcome provider / {context.periodLabel} / {context.timezoneLabel}.</TableCaption>
              <TableHeader><TableRow><TableHead>Kurir</TableHead><TableHead className="text-right">Resi terbit</TableHead><TableHead className="text-right">Outcome terselesaikan</TableHead><TableHead className="text-right">Tingkat penerbitan</TableHead></TableRow></TableHeader>
              <TableBody>{result.value.map((row) => {
                const rate = row.resolvedSubmissionCount > 0 ? (row.issuedCount / row.resolvedSubmissionCount) * 100 : 0;
                return <TableRow key={row.courier}><TableCell className="font-medium uppercase" scope="row">{row.courier}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row.issuedCount)}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row.resolvedSubmissionCount)}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(rate)}%</TableCell></TableRow>;
              })}</TableBody>
            </Table>
          </div>
        ) : <p className="py-4 text-sm text-muted-foreground">Belum ada outcome provider yang terselesaikan pada filter ini.</p>}
      </CardContent>
    </Card>
  );
}

export async function AnalyticsShipmentRegion({
  comparisonPromise,
  context,
  pageSize = DEFAULT_PAGE_SIZE,
  promise,
  requestedPage,
}: {
  comparisonPromise?: Promise<ShipmentKpiComparison>;
  context: AnalyticsResolvedRegionProps;
  pageSize?: number;
  promise: Promise<ShipmentPage>;
  requestedPage: number;
}) {
  const result = await settle(promise);
  if (!result.ok) {
    return <AnalyticsRegionError description="Ringkasan dan tren tetap tersedia." focusTargetId="analytics-shipments-heading" title="Tabel kiriman tidak dapat dimuat" />;
  }

  const shipmentPage = result.value;
  if (shipmentPage.totalCount === 0) {
    if (context.activeDimensionCount > 0) {
      return <div className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id="analytics-shipments-heading" tabIndex={-1}><EmptyState action={<Button asChild className="min-h-11" variant="outline"><Link href="/app/analitik">Reset filter</Link></Button>} description="Tenant memiliki kiriman, tetapi kombinasi outlet, kurir, lifecycle, dan periode ini tidak menghasilkan record." icon={PackageOpen} title="Tidak ada kiriman untuk filter ini" /></div>;
    }
    const comparison = comparisonPromise ? await settle(comparisonPromise) : null;
    const previousCreatedCount = comparison?.ok ? comparison.value.previous.createdCount : 0;
    return <div className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id="analytics-shipments-heading" tabIndex={-1}><EmptyState action={<Button asChild className="min-h-11" variant="outline"><Link href={`/app/analitik?rentang=30-hari&tz=${encodeURIComponent(context.range.timezone)}`}>Lihat 30 hari terakhir</Link></Button>} description={<>Kiriman tercatat pada periode lain. Periode sebelumnya ({context.previousPeriodLabel}) mencatat {countFormatter.format(previousCreatedCount)} kiriman.</>} icon={PackageOpen} title={`Tidak ada aktivitas pada ${context.periodLabel}`} /></div>;
  }

  const totalPages = Math.max(1, Math.ceil(shipmentPage.totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const description = context.eventBasis === "created"
    ? `Kiriman dibuat pada ${context.periodLabel}`
    : context.eventBasis === "issued"
      ? `Resi diterbitkan pada ${context.periodLabel}`
      : context.eventBasis === "outcome"
        ? `Outcome provider terselesaikan pada ${context.periodLabel}`
        : "Pengecualian yang masih aktif saat ini";

  return (
    <Card id="kiriman-analitik">
      <RegionHeading description={`${description} (${context.timezoneLabel}) dengan filter dimensi yang sama.`} id="analytics-shipments-heading" title="Kiriman" />
      <CardContent className="space-y-4">
        <div aria-label="Tabel kiriman" className="overflow-x-auto rounded-lg border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_[data-slot=table-container]]:overflow-visible" role="region" tabIndex={0}>
          <Table className="min-w-[72rem]">
            <TableCaption className="px-3 pb-3 text-left">Tabel kiriman tenant pada rentang, basis waktu, dan filter terpilih.</TableCaption>
            <TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-card">Kiriman</TableHead><TableHead>Dibuat</TableHead><TableHead>{context.eventBasis === "outcome" ? "Outcome provider" : "Resi terbit"}</TableHead><TableHead>Outlet</TableHead><TableHead>Kurir</TableHead><TableHead>Layanan</TableHead><TableHead>Status</TableHead><TableHead>AWB</TableHead><TableHead className="text-right">Total tagihan COD provider</TableHead></TableRow></TableHeader>
            <TableBody>
              {shipmentPage.rows.map((row) => {
                const status = SHIPMENT_STATUS_PRESENTATION[row.status];
                const detailHref = analyticsShipmentDetailHref(context.role, row.shipmentId);
                const reference = row.shipmentId.slice(0, 8).toUpperCase();
                return (
                  <TableRow key={row.shipmentId}>
                    <TableCell className="sticky left-0 z-10 bg-card font-medium">{detailHref ? <Link aria-label={`Buka detail kiriman ${reference}`} className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline sm:min-h-0" href={detailHref}>{reference}</Link> : reference}</TableCell>
                    <TableCell>{formatInZone(row.createdAt, context.range.timezone)}</TableCell>
                    <TableCell>{row.issuedAt ? formatInZone(row.issuedAt, context.range.timezone) : "—"}</TableCell>
                    <TableCell>{row.outletName}</TableCell>
                    <TableCell className="uppercase">{row.courier ?? "—"}</TableCell>
                    <TableCell>{row.providerService ?? "—"}</TableCell>
                    <TableCell><ShipmentStatusBadge label={status.label} tone={status.tone} /></TableCell>
                    <TableCell className="font-mono text-xs">{row.cnoteNo ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.isCod && row.providerCodAmountIdr !== null ? idrFormatter.format(row.providerCodAmountIdr) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <nav aria-label="Navigasi halaman kiriman" className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">Halaman {page} dari {totalPages} / {countFormatter.format(shipmentPage.totalCount)} kiriman</span>
          <div className="flex gap-2">
            {page > 1 ? <Button asChild className="min-h-11 sm:min-h-8" variant="outline"><Link href={paginationHref(context.canonicalQuery, page - 1)}><ChevronLeft aria-hidden="true" />Sebelumnya</Link></Button> : <Button className="min-h-11 sm:min-h-8" disabled variant="outline"><ChevronLeft aria-hidden="true" />Sebelumnya</Button>}
            {page < totalPages ? <Button asChild className="min-h-11 sm:min-h-8" variant="outline"><Link href={paginationHref(context.canonicalQuery, page + 1)}>Berikutnya<ChevronRight aria-hidden="true" /></Link></Button> : <Button className="min-h-11 sm:min-h-8" disabled variant="outline">Berikutnya<ChevronRight aria-hidden="true" /></Button>}
          </div>
        </nav>
      </CardContent>
    </Card>
  );
}

export function AnalyticsSummarySkeleton() {
  return <div aria-busy="true" aria-label="Memuat ringkasan analitik" className="space-y-6"><Skeleton className="h-12 w-full" />{Array.from({ length: 2 }, (_, card) => <div className="space-y-4 rounded-lg border p-5" key={card}><Skeleton className="h-5 w-48" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (__, metric) => <div className="space-y-3" key={metric}><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-20" /><Skeleton className="h-3 w-36" /></div>)}</div></div>)}</div>;
}

export function AnalyticsReconciliationSkeleton() {
  return <div aria-busy="true" aria-label="Memuat exception rekonsiliasi" className="space-y-4 rounded-lg border p-5"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-72 max-w-full" /><Skeleton className="h-8 w-36" /></div>;
}

export function AnalyticsTrendSkeleton() {
  return <div aria-busy="true" aria-label="Memuat tren analitik" className="space-y-4 rounded-lg border p-5"><Skeleton className="h-5 w-44" /><Skeleton className="h-72 w-full" /><Skeleton className="h-24 w-full" /></div>;
}

export function AnalyticsCourierSkeleton() {
  return <div aria-busy="true" aria-label="Memuat performa kurir" className="space-y-4 rounded-lg border p-5"><Skeleton className="h-5 w-40" />{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-10 w-full" key={index} />)}</div>;
}

export function AnalyticsShipmentSkeleton() {
  return <div aria-busy="true" aria-label="Memuat tabel kiriman" className="space-y-4 rounded-lg border p-5"><Skeleton className="h-5 w-32" />{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-10 w-full" key={index} />)}<div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><Skeleton className="h-9 w-full sm:w-40" /><Skeleton className="h-9 w-full sm:w-56" /></div></div>;
}
