import {
  BadgePercent,
  Boxes,
  CircleAlert,
  ChevronDown,
  HandCoins,
  Landmark,
  Package,
  PackageOpen,
  Receipt,
  ReceiptText,
  Scale,
  TrendingUp,
  TriangleAlert,
  Truck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DataFreshnessControl } from "@/components/cms/data-freshness-control";
import { DataTablePagination } from "@/components/cms/data-table-pagination";
import { EmptyState } from "@/components/cms/empty-state";
import { RetryRegionButton } from "@/components/cms/retry-region-button";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { StatCard } from "@/components/cms/stat-card";
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
import { cn } from "@/lib/utils";
import { AnalyticsComparisonCue } from "./comparison-cue";
import { CourierIssueRateChart } from "./courier-issue-rate-chart";
import { courierIssueRate, isLowVolumeCourier, lowVolumeLabel, orderCouriersForRanking } from "./courier-volume";
import { ShipmentTrendChart } from "./shipment-trend-chart";

const DEFAULT_PAGE_SIZE = 50;
const countFormatter = new Intl.NumberFormat("id-ID");
const idrFormatter = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});
// `focus:` not `focus-visible:`: these targets only take focus from script (hash, retry), and a
// mouse-triggered retry would otherwise move focus with no visible ring.
const focusRing = "rounded-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
const detailTrigger = "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden";
const tableRegion = "rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
  icon: LucideIcon;
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

/** Card title for chart and table regions; the id is the region's retry focus target. */
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
    <CardHeader>
      <CardTitle className={focusRing} id={id} tabIndex={-1}>
        {title}
      </CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  );
}

/** Heading above a stat-card group. */
function SectionHeading({
  description,
  id,
  title,
}: {
  description?: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className={cn("text-lg font-semibold tracking-tight", focusRing)} id={id} tabIndex={-1}>{title}</h2>
      {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function MetricCards({ className, metrics }: { className: string; metrics: Metric[] }) {
  return (
    <div className={cn("grid gap-4", className)}>
      {metrics.map((metric) => (
        <StatCard
          description={metric.context || metric.previous !== undefined ? (
            <>
              {metric.context ? <p>{metric.context}</p> : null}
              {metric.previous === undefined ? null : (
                <p><AnalyticsComparisonCue current={metric.current} previous={metric.previous} /></p>
              )}
            </>
          ) : undefined}
          href={metric.href}
          icon={metric.icon}
          key={metric.label}
          title={metric.label}
          value={metric.value}
          valueLabel={metric.href ? `${metric.value}. Lihat record pendukung` : undefined}
        />
      ))}
    </div>
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
    return <AnalyticsRegionError description="Coba muat ulang ringkasan. Bagian lain yang berhasil dimuat tetap tersedia." focusTargetId="analytics-summary-heading" title="Ringkasan tidak dapat dimuat" />;
  }

  const { backlogSnapshot: backlog, current: kpis, eventGeneratedAt, previous } = result.value;
  const currentSuccessRate = kpis.resolvedSubmissionCount > 0
    ? (kpis.issuedCount / kpis.resolvedSubmissionCount) * 100
    : 0;
  const previousSuccessRate = previous.resolvedSubmissionCount > 0
    ? (previous.issuedCount / previous.resolvedSubmissionCount) * 100
    : 0;
  const operationalMetrics: Metric[] = [
    { current: kpis.createdCount, href: supportingRowsHref(context.canonicalQuery, "created"), context: "Mengikuti tanggal kiriman dibuat.", icon: Package, label: "Kiriman dibuat", previous: previous.createdCount, value: countFormatter.format(kpis.createdCount) },
    { context: "Mengikuti tanggal resi diterbitkan Mengantar.", current: kpis.issuedCount, href: supportingRowsHref(context.canonicalQuery, "issued"), icon: ReceiptText, label: "Resi terbit", previous: previous.issuedCount, value: countFormatter.format(kpis.issuedCount) },
    { context: `${countFormatter.format(kpis.issuedCount)} resi terbit dari ${countFormatter.format(kpis.resolvedSubmissionCount)} pengajuan selesai.`, current: currentSuccessRate, href: supportingRowsHref(context.canonicalQuery, "outcome"), icon: BadgePercent, label: "Tingkat penerbitan resi", previous: previousSuccessRate, value: kpis.resolvedSubmissionCount > 0 ? `${countFormatter.format(currentSuccessRate)}%` : "—" },
    { context: `${countFormatter.format(backlog.awaitingPaymentCount)} menunggu pembayaran + ${countFormatter.format(backlog.needsActionCount)} gagal/perlu rekonsiliasi · saat ini, ${formatInZone(backlog.asOf, context.range.timezone)}. Tidak mengikuti periode laporan.`, current: backlog.awaitingPaymentCount + backlog.needsActionCount, href: supportingRowsHref(context.canonicalQuery, "exceptions"), icon: TriangleAlert, label: "Pengecualian belum selesai", value: countFormatter.format(backlog.awaitingPaymentCount + backlog.needsActionCount) },
  ];

  return (
    <section aria-labelledby="analytics-summary-heading" className="space-y-4">
      <SectionHeading id="analytics-summary-heading" title="Ringkasan operasional" />
      <MetricCards className="grid-cols-2 lg:grid-cols-4 [&_[data-slot=card-title]]:min-h-15 md:[&_[data-slot=card-title]]:min-h-10" metrics={operationalMetrics} />
      <div className="space-y-1">
        <DataFreshnessControl formattedGeneratedAt={formatInZone(eventGeneratedAt, context.range.timezone)} generatedAtIso={eventGeneratedAt.toISOString()} initiallyStale={isDataStale(eventGeneratedAt, new Date())} />
        <p className="max-w-2xl text-xs leading-5 text-muted-foreground">Waktu pembaruan di atas berlaku untuk ringkasan periode, bukan tren, daftar kiriman, atau rekonsiliasi.</p>
      </div>
    </section>
  );
}

export async function AnalyticsFinancialRegion({ promise }: { promise: Promise<ShipmentKpiComparison> }) {
  const result = await settle(promise);
  if (!result.ok) return <AnalyticsRegionError description="Ringkasan operasional dan tren tetap tersedia bila berhasil dimuat." focusTargetId="analytics-financial-heading" title="Nilai kiriman tidak dapat dimuat" />;
  const { current: kpis, previous } = result.value;
  const primaryMetrics: Metric[] = [
    { context: "Titipan penerima, bukan pendapatan GeraiCUAN.", current: kpis.codPrincipalIdr, icon: Landmark, label: "Pokok COD (liabilitas)", previous: previous.codPrincipalIdr, value: idrFormatter.format(kpis.codPrincipalIdr) },
    { context: "Pokok COD dikurangi COGS, Ongkir, Layanan, & PPN.", current: kpis.netMarginIdr, icon: TrendingUp, label: "Net Margin (Estimasi)", previous: previous.netMarginIdr, value: idrFormatter.format(kpis.netMarginIdr) },
  ];
  const costMetrics: Metric[] = [
    { current: kpis.providerShippingIdr, icon: Truck, label: "Ongkir provider", previous: previous.providerShippingIdr, value: idrFormatter.format(kpis.providerShippingIdr) },
    { current: kpis.codServiceFeeIdr, icon: HandCoins, label: "Biaya layanan COD", previous: previous.codServiceFeeIdr, value: idrFormatter.format(kpis.codServiceFeeIdr) },
    { current: kpis.codVatIdr, icon: Receipt, label: "PPN biaya layanan", previous: previous.codVatIdr, value: idrFormatter.format(kpis.codVatIdr) },
    { current: kpis.cogsIdr, icon: Boxes, label: "COGS / Modal HPP", previous: previous.cogsIdr, value: idrFormatter.format(kpis.cogsIdr) },
  ];
  return (
    <section aria-labelledby="analytics-financial-heading" className="space-y-4">
      <SectionHeading description="Mengikuti tanggal efektif catatan keuangan pada periode terpilih." id="analytics-financial-heading" title="Nilai kiriman" />
      <MetricCards className="sm:grid-cols-2" metrics={primaryMetrics} />
      <details className="group border-t pt-2" data-analytics-detail="costs">
        <summary className={detailTrigger}><span>Lihat rincian biaya</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
        <div className="pt-3"><MetricCards className="sm:grid-cols-2 lg:grid-cols-4" metrics={costMetrics} /></div>
      </details>
      <Alert><CircleAlert aria-hidden="true" /><AlertTitle>Pokok COD bukan pendapatan</AlertTitle><AlertDescription>Nilai di atas bukan kas yang sudah diterima. Rekonsiliasi dan sumber ledger tersedia di buku besar.</AlertDescription></Alert>
    </section>
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
    // A streamed page region, not an interruption: `status` like Keuangan, and a real h2 for heading navigation.
    <section aria-labelledby="analytics-reconciliation-heading">
    <Alert role="status" variant={variance.varianceCount > 0 ? "destructive" : "default"}>
      <Scale aria-hidden="true" />
      <AlertTitle><h2 className={focusRing} id="analytics-reconciliation-heading" tabIndex={-1}>Selisih rekonsiliasi saat ini</h2></AlertTitle>
      <AlertDescription className="grid gap-2">
        <p><strong className="font-semibold">{countFormatter.format(variance.varianceCount)} hasil rekonsiliasi</strong> masih memiliki selisih. Total selisih (+/−): <strong className="font-semibold tabular-nums">{variance.totalSignedVarianceIdr > 0 ? "+" : ""}{idrFormatter.format(variance.totalSignedVarianceIdr)}</strong>.</p>
        <p className="text-xs">Seluruh outlet tenant · tidak mengikuti filter periode, outlet, kurir, atau status · bukan pendapatan.</p>
        <Button asChild className="min-h-11 w-fit" variant="outline"><Link href={reconciliationVarianceHref()}>Lihat rekonsiliasi</Link></Button>
      </AlertDescription>
    </Alert>
    </section>
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
    return <div className="lg:col-span-full"><AnalyticsRegionError description="Ringkasan dan tabel kiriman tetap tersedia." focusTargetId="analytics-trend-heading" title="Tren tidak dapat dimuat" /></div>;
  }
  const trendByKey = new Map(result.value.points.map((point) => [point.key, point] as const));
  const rows = buildTrendBuckets(context.range).map((bucket) => ({
    ...bucket,
    createdCount: trendByKey.get(bucket.key)?.createdCount ?? 0,
    issuedCount: trendByKey.get(bucket.key)?.issuedCount ?? 0,
  }));

  if (rows.every((row) => row.createdCount + row.issuedCount === 0)) {
    return <Card className="lg:col-span-full"><RegionHeading description={`${context.periodLabel} / ${context.timezoneLabel}.`} id="analytics-trend-heading" title="Tren aktivitas" /><CardContent><EmptyState action={context.activeDimensionCount > 0 ? <Button asChild variant="outline"><Link href="/app/analitik">Reset filter</Link></Button> : undefined} description={context.activeDimensionCount > 0 ? "Kombinasi filter ini tidak memiliki event kiriman dibuat atau resi terbit." : "Tidak ada event kiriman dibuat atau resi terbit pada periode ini. Ini bukan kegagalan pemuatan data."} icon={PackageOpen} title="Tidak ada aktivitas untuk diplot" /></CardContent></Card>;
  }

  return (
    <Card className="lg:col-span-full">
      <RegionHeading description={`${context.periodLabel} / ${context.timezoneLabel}. Sumbu vertikal menunjukkan jumlah kiriman.`} id="analytics-trend-heading" title={`Tren ${context.range.granularity === "harian" ? "harian" : "bulanan"}`} />
      <CardContent className="space-y-5">
        <div><p className="text-xs font-medium text-muted-foreground">Data tren</p><DataFreshnessControl formattedGeneratedAt={formatInZone(result.value.generatedAt, context.range.timezone)} generatedAtIso={result.value.generatedAt.toISOString()} initiallyStale={isDataStale(result.value.generatedAt, new Date())} /></div>
        <ShipmentTrendChart data={rows} granularity={context.range.granularity} />
        <details className="group border-t pt-2" data-analytics-detail="trend">
          <summary className={detailTrigger}><span>Lihat data tren <span className="font-normal text-muted-foreground">({countFormatter.format(rows.length)} {context.range.granularity === "harian" ? "hari" : "bulan"})</span></span><ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
          <div className="pt-3">
          <Table className="min-w-[20rem]" containerClassName={tableRegion} containerProps={{ "aria-label": "Tabel tren kiriman", role: "region", tabIndex: 0 }}>
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
    return <div className="lg:col-span-full"><AnalyticsRegionError description="Ringkasan, tren, dan tabel kiriman tetap tersedia." focusTargetId="analytics-courier-heading" title="Breakdown kurir tidak dapat dimuat" /></div>;
  }

  // Spec 19 M-3: presentation-only ranking; low-volume rows never outrank higher-volume rows by rate alone.
  const couriers = orderCouriersForRanking(result.value).map((row) => ({
    ...row,
    lowVolume: row.resolvedSubmissionCount > 0 && isLowVolumeCourier(row),
    rate: courierIssueRate(row),
  }));
  const chartData = couriers
    .filter((row) => row.resolvedSubmissionCount > 0)
    .map((row) => ({
      courier: row.courier.toUpperCase(),
      label: row.lowVolume
        ? `${countFormatter.format(row.rate)}% · ${lowVolumeLabel(row)}`
        : `${countFormatter.format(row.rate)}% · ${countFormatter.format(row.issuedCount)}/${countFormatter.format(row.resolvedSubmissionCount)}`,
      lowVolume: row.lowVolume,
      rate: row.rate,
    }));

  return (
    <Card className="lg:col-span-full">
      <RegionHeading description={`Resi terbit dibanding pengajuan yang selesai pada ${context.periodLabel}. Jumlah pengajuan ditampilkan bersama persentasenya.`} id="analytics-courier-heading" title="Performa kurir" />
      <CardContent className="space-y-5">
        {couriers.length > 0 ? (
          <>
            {chartData.length > 0 ? <CourierIssueRateChart data={chartData} /> : null}
            <details className="group border-t pt-2" data-analytics-detail="couriers">
              <summary className={detailTrigger}><span>Lihat detail performa kurir <span className="font-normal text-muted-foreground">({countFormatter.format(couriers.length)})</span></span><ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
              <div className="pt-3">
              <Table className="min-w-[24rem]" containerClassName={tableRegion} containerProps={{ "aria-label": "Tabel performa kurir", role: "region", tabIndex: 0 }}>
                <TableCaption className="px-3 pb-3 text-left">Perbandingan kurir berdasarkan waktu outcome provider / {context.periodLabel} / {context.timezoneLabel}.</TableCaption>
                <TableHeader><TableRow><TableHead>Kurir</TableHead><TableHead className="text-right">Resi terbit</TableHead><TableHead className="text-right">Outcome terselesaikan</TableHead><TableHead className="text-right">Tingkat penerbitan</TableHead></TableRow></TableHeader>
                <TableBody>{couriers.map((row) => <TableRow key={row.courier}><TableCell className="font-medium uppercase" scope="row">{row.courier}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row.issuedCount)}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row.resolvedSubmissionCount)}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row.rate)}%{row.lowVolume ? <span className="block text-xs text-muted-foreground">{lowVolumeLabel(row)}</span> : null}</TableCell></TableRow>)}</TableBody>
              </Table>
              </div>
            </details>
          </>
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
      return <div className={focusRing} id="analytics-shipments-heading" tabIndex={-1}><EmptyState action={<Button asChild className="min-h-11" variant="outline"><Link href="/app/analitik">Reset filter</Link></Button>} description="Tenant memiliki kiriman, tetapi kombinasi outlet, kurir, lifecycle, dan periode ini tidak menghasilkan record." icon={PackageOpen} title="Tidak ada kiriman untuk filter ini" /></div>;
    }
    const comparison = comparisonPromise ? await settle(comparisonPromise) : null;
    const previousCreatedCount = comparison?.ok ? comparison.value.previous.createdCount : 0;
    return <div className={focusRing} id="analytics-shipments-heading" tabIndex={-1}><EmptyState action={<Button asChild className="min-h-11" variant="outline"><Link href={`/app/analitik?rentang=30-hari&tz=${encodeURIComponent(context.range.timezone)}`}>Lihat 30 hari terakhir</Link></Button>} description={<>Kiriman tercatat pada periode lain. Periode sebelumnya ({context.previousPeriodLabel}) mencatat {countFormatter.format(previousCreatedCount)} kiriman.</>} icon={PackageOpen} title={`Tidak ada aktivitas pada ${context.periodLabel}`} /></div>;
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
    <section aria-labelledby="analytics-shipments-heading" className="scroll-mt-6 space-y-4" id="kiriman-analitik">
      <SectionHeading description={`${description} (${context.timezoneLabel}) sesuai filter terpilih.`} id="analytics-shipments-heading" title="Kiriman" />
      <Table className="min-w-[72rem]" containerClassName={tableRegion} containerProps={{ "aria-label": "Tabel kiriman", role: "region", tabIndex: 0 }}>
        <TableCaption className="px-3 pb-3 text-left">Tabel kiriman tenant pada rentang, basis waktu, dan filter terpilih.</TableCaption>
        <TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-[color-mix(in_oklch,var(--muted)_40%,var(--background))]">Kiriman</TableHead><TableHead>Dibuat</TableHead><TableHead>{context.eventBasis === "outcome" ? "Outcome provider" : "Resi terbit"}</TableHead><TableHead>Outlet</TableHead><TableHead>Kurir</TableHead><TableHead>Layanan</TableHead><TableHead>Status</TableHead><TableHead>AWB</TableHead><TableHead className="text-right">Total tagihan COD provider</TableHead></TableRow></TableHeader>
        <TableBody>
          {shipmentPage.rows.map((row) => {
            const status = SHIPMENT_STATUS_PRESENTATION[row.status];
            const detailHref = analyticsShipmentDetailHref(context.role, row.shipmentId);
            const reference = row.publicReference;
            return (
              <TableRow key={row.shipmentId}>
                <TableCell className="sticky left-0 z-10 bg-background font-medium">{detailHref ? <Link aria-label={`Buka detail kiriman ${reference}`} className="inline-flex min-h-11 max-w-40 items-center whitespace-normal wrap-anywhere text-primary underline-offset-4 hover:underline md:min-h-0" href={detailHref}>{reference}</Link> : reference}</TableCell>
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
      <DataTablePagination
        hrefForPage={(target) => paginationHref(context.canonicalQuery, target)}
        label="Navigasi halaman kiriman"
        page={page}
        summary={`${countFormatter.format(shipmentPage.totalCount)} kiriman`}
        totalCount={shipmentPage.totalCount}
        totalPages={totalPages}
      />
    </section>
  );
}

const statCardSkeleton = (key: number) => <div className="space-y-3 rounded-xl p-4 ring-1 ring-foreground/10" key={key}><div className="flex items-center justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="size-4" /></div><Skeleton className="h-8 w-28" /><Skeleton className="h-3 w-full" /></div>;

export function AnalyticsSummarySkeleton() {
  return <div aria-busy="true" aria-label="Memuat ringkasan analitik" className="space-y-4"><div className="space-y-1"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-80 max-w-full" /></div><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => statCardSkeleton(index))}</div><Skeleton className="h-8 w-full" /></div>;
}

export function AnalyticsFinancialSkeleton() {
  return <div aria-busy="true" aria-label="Memuat nilai kiriman" className="space-y-4"><Skeleton className="h-6 w-40" /><div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 2 }, (_, index) => statCardSkeleton(index))}</div><Skeleton className="h-11 w-full" /></div>;
}

export function AnalyticsReconciliationSkeleton() {
  return <div aria-busy="true" aria-label="Memuat exception rekonsiliasi" className="grid gap-3 rounded-md border p-4"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-full max-w-lg" /><Skeleton className="h-11 w-40" /></div>;
}

export function AnalyticsTrendSkeleton() {
  return <div aria-busy="true" aria-label="Memuat tren analitik" className="space-y-4 rounded-xl p-4 ring-1 ring-foreground/10 lg:col-span-full"><Skeleton className="h-5 w-44" /><Skeleton className="h-72 w-full" /><Skeleton className="h-11 w-full" /></div>;
}

export function AnalyticsCourierSkeleton() {
  return <div aria-busy="true" aria-label="Memuat performa kurir" className="space-y-4 rounded-xl p-4 ring-1 ring-foreground/10 lg:col-span-full"><Skeleton className="h-5 w-40" /><Skeleton className="h-40 w-full" /><Skeleton className="h-11 w-full" /></div>;
}

export function AnalyticsShipmentSkeleton() {
  return <div aria-busy="true" aria-label="Memuat tabel kiriman" className="space-y-4"><Skeleton className="h-6 w-32" /><div className="space-y-2 rounded-md border p-3">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-10 w-full" key={index} />)}</div><div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><Skeleton className="h-8 w-full sm:w-40" /><Skeleton className="h-8 w-full sm:w-72" /></div></div>;
}
