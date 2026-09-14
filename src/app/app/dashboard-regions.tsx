import {
  ArrowRight,
  Banknote,
  BookOpenText,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  FilePenLine,
  Package,
  PackageSearch,
  ReceiptText,
  Settings2,
  Plus,
  Upload,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DashboardPeriodChart } from "@/app/app/dashboard-period-chart";
import { DataFreshnessControl } from "@/components/cms/data-freshness-control";
import { DataTableShell } from "@/components/cms/data-table-shell";
import { EmptyState } from "@/components/cms/empty-state";
import { RetryRegionButton } from "@/components/cms/retry-region-button";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { StatCard } from "@/components/cms/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
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
  TenantDashboardMetrics,
  TenantDashboardPeriodSummary,
  TenantDashboardPeriodSupport,
  TenantDashboardPeriodSupportKind,
  TenantDashboardPeriodTrendPoint,
  TenantDashboardRecentShipment,
} from "@/db/tenant-dashboard-repository";
import { formatAnalyticsComparison } from "@/lib/analytics-decision-context";
import { buildTrendBuckets, formatInZone, previousAnalyticsRange, type AnalyticsRange } from "@/lib/analytics-range";
import { DATA_STALE_AFTER_MS, isDataStale } from "@/lib/data-freshness";
import { reconciliationVarianceHref } from "@/lib/finance-exception-filter";
import { formatWibDateTime } from "@/lib/label-format";
import {
  SHIPMENT_STATUS_PRESENTATION,
  shipmentQueueHref,
  type TenantShipmentRole,
} from "@/lib/shipment-queue";
import { shipmentReference } from "@/lib/shipment-reference";
import { cn } from "@/lib/utils";

export type OutletReadinessRow = { id: string; name: string; ready: boolean };

export type DashboardPeriodContext = {
  periodLabel: string;
  previousPeriodLabel: string;
  range: AnalyticsRange;
  timezoneLabel: string;
};

export type DashboardPeriodSupportingLinks = Record<
  TenantDashboardPeriodSupportKind,
  string
>;

const countFormatter = new Intl.NumberFormat("id-ID");
const idrFormatter = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

/** Short absolute WIB time for recent-shipment rows, e.g. "13 Sep, 12.03". */
const recentTimeFormatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", hour: "2-digit", minute: "2-digit", month: "short", timeZone: "Asia/Jakarta" });
const clockFormatters = new Map<string, Intl.DateTimeFormat>();

/** Compact "HH.mm" for the freshness line; the full instant stays in <time dateTime>. */
function formatClock(instant: Date, timezone: string) {
  let formatter = clockFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: timezone });
    clockFormatters.set(timezone, formatter);
  }
  return formatter.format(instant);
}

/**
 * Dashboard KPI change: the absolute difference leads so small bases do not read as
 * dramatic ("+13 (217%)" instead of "217% lebih tinggi"). The percentage and its
 * sentence come unchanged from the shared analytics comparison.
 */
function DashboardComparison({ current, previous, previousLabel }: { current: number; previous: number; previousLabel: string }) {
  const comparison = formatAnalyticsComparison(current, previous);
  const delta = current - previous;
  const percentage = comparison.text.match(/^(\d+)%/)?.[1];
  const magnitude = countFormatter.format(Math.abs(delta));
  const visible = delta === 0
    ? `Tidak berubah vs ${previousLabel}`
    : `${delta > 0 ? "+" : "−"}${magnitude} (${percentage ? `${percentage}%` : "naik dari 0"}) vs ${previousLabel}`;
  return (
    <span className="text-xs leading-5">
      <span aria-hidden="true">{comparison.cue} {visible}</span>
      <span className="sr-only">{delta === 0 ? "" : `${delta > 0 ? "Naik" : "Turun"} ${magnitude} kiriman, dari ${countFormatter.format(previous)} menjadi ${countFormatter.format(current)}. `}{comparison.text}</span>
    </span>
  );
}

/** Focus ring for region containers that receive programmatic focus. */
const focusTargetClassName = "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const cardHeadingClassName = cn("text-base font-semibold leading-snug", focusTargetClassName);
/**
 * Column spans of the chart + recent row (shadcn-admin 4/3 split). When the chart
 * renders nothing (single-day range) the recent card takes the full row instead of
 * leaving an empty column.
 */
export const dashboardOverviewSpan = "lg:col-span-4 lg:only:col-span-7";
export const dashboardRecentSpan = "lg:col-span-3 lg:only:col-span-7";
/**
 * Row that holds the chart and recent-shipments cards; also used by the loading state.
 * Both cards stretch to the row height from lg; the chart plot grows into the extra
 * height (see DashboardPeriodChart) so no blank area opens under the shorter card.
 */
export const dashboardOverviewGridClassName = "grid grid-cols-1 gap-4 empty:hidden lg:grid-cols-7";
/** Visible rows in the merged recent card; actionable reads are capped at five, so they always fit. */
const RECENT_VISIBLE_ROWS = 8;

const exceptionStatuses: ReadonlySet<TenantDashboardRecentShipment["status"]> = new Set(["AWAITING_UPSTREAM_PAYMENT", "SUBMISSION_UNKNOWN", "FAILED"]);

/** Role-specific next step, or null when the shipment needs no follow-up (the reference link still opens it). */
function nextAction(row: TenantDashboardRecentShipment, role: TenantShipmentRole) {
  const detailHref = `/app/pengiriman/${encodeURIComponent(row.shipmentId)}`;
  switch (row.status) {
    case "DRAFT":
      return { href: `/app/pengiriman/baru?draft=${encodeURIComponent(row.shipmentId)}`, label: "Lanjutkan draf" };
    case "ESTIMATED":
      return { href: `/app/pengiriman/baru?draft=${encodeURIComponent(row.shipmentId)}`, label: "Tinjau estimasi" };
    case "AWAITING_UPSTREAM_PAYMENT":
      return { href: role === "TENANT_ADMIN" ? `${detailHref}#pemulihan-pembayaran` : detailHref, label: role === "TENANT_ADMIN" ? "Pulihkan pembayaran" : "Lihat panduan admin" };
    case "SUBMISSION_UNKNOWN":
      return { href: detailHref, label: "Lihat detail" };
    case "FAILED":
      return { href: detailHref, label: "Periksa kegagalan" };
    default:
      return null;
  }
}

function RegionFailure({ description, focusTargetId, title }: { description: string; focusTargetId?: string; title: string }) {
  return <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>{title}</AlertTitle><AlertDescription>{description}<div className="mt-3"><RetryRegionButton focusTargetId={focusTargetId} /></div></AlertDescription></Alert>;
}

async function settle<T>(promise: Promise<T>) {
  try {
    return { ok: true as const, value: await promise };
  } catch {
    return { ok: false as const };
  }
}

function ShipmentReferenceLink({ className, shipmentId }: { className?: string; shipmentId: string }) {
  return (
    <Link
      className={cn("inline-flex min-h-11 items-center rounded-sm font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8", className)}
      href={`/app/pengiriman/${encodeURIComponent(shipmentId)}`}
    >
      {shipmentReference(shipmentId)}
    </Link>
  );
}

export async function OutletReadinessRegion({ promise, role }: { promise: Promise<OutletReadinessRow[]>; role: TenantShipmentRole }) {
  const result = await settle(promise);
  if (!result.ok) return <RegionFailure description="Region operasional lain tetap tersedia. Coba muat ulang kesiapan outlet." title="Kesiapan outlet tidak dapat dimuat" />;
  const rows = result.value;
  const readyCount = rows.filter((outlet) => outlet.ready).length;
  if (readyCount === rows.length && rows.length > 0) return null;
  return (
    <Alert>
      <Settings2 aria-hidden="true" />
      <AlertTitle>Kesiapan outlet perlu diperiksa</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>{rows.length === 0 ? "Belum ada outlet pada tenant ini. Pembuatan kiriman belum dapat dilanjutkan." : `${readyCount} dari ${rows.length} outlet siap dipakai untuk pickup dan estimasi.`}</p>
        {role === "TENANT_ADMIN" ? <Button asChild className="min-h-11 md:min-h-8" size="sm" variant="outline"><Link href="/app/pengaturan">Siapkan outlet</Link></Button> : <span className="text-sm font-medium">Hubungi Tenant Admin untuk melengkapi outlet.</span>}
      </AlertDescription>
    </Alert>
  );
}

export async function DashboardHeaderActions({ promise, role }: { promise: Promise<OutletReadinessRow[]>; role: TenantShipmentRole }) {
  const result = await settle(promise);
  if (!result.ok) return null;
  const ready = result.value.some((outlet) => outlet.ready);
  if (!ready) {
    return role === "TENANT_ADMIN" ? <Button asChild className="max-sm:flex-1" variant="outline"><Link href="/app/pengaturan"><Settings2 aria-hidden="true" />Siapkan outlet</Link></Button> : null;
  }
  return <><Button asChild className="max-sm:flex-1" variant="outline"><Link href="/app/impor"><Upload aria-hidden="true" />Impor CSV</Link></Button><Button asChild className="max-sm:flex-1"><Link href="/app/pengiriman/baru"><Plus aria-hidden="true" />Buat kiriman</Link></Button></>;
}

export async function DashboardPeriodSummaryRegion({
  analyticsHref,
  context,
  lifetimeMetricsPromise,
  outletReady,
  promise,
  supportingLinks,
}: {
  analyticsHref?: string;
  context: DashboardPeriodContext;
  lifetimeMetricsPromise: Promise<TenantDashboardMetrics>;
  outletReady: boolean;
  promise: Promise<TenantDashboardPeriodSummary>;
  supportingLinks: DashboardPeriodSupportingLinks;
}) {
  const result = await settle(Promise.all([promise, lifetimeMetricsPromise]));
  if (!result.ok) {
    return <RegionFailure description="Pekerjaan saat ini dan kiriman terbaru tetap tersedia." focusTargetId="dashboard-period-results" title="Ringkasan periode tidak dapat dimuat" />;
  }
  const [summary, lifetimeMetrics] = result.value;
  if (lifetimeMetrics.summary.total === 0) {
    const description = outletReady
      ? "Outlet sudah siap. Buat kiriman pertama atau impor file CSV untuk mulai melihat ringkasan."
      : "Siapkan outlet, lalu buat kiriman pertama atau impor file CSV.";
    return <Card className={cn("py-0 [&>div]:border-y-0", focusTargetClassName)} id="dashboard-period-results" tabIndex={-1}><EmptyState action={<div className="flex flex-wrap justify-center gap-2"><Button asChild className="min-h-11 md:min-h-8"><Link href="/app/pengiriman/baru">Buat kiriman</Link></Button><Button asChild className="min-h-11 md:min-h-8" variant="outline"><Link href="/app/impor"><Upload aria-hidden="true" />Impor CSV</Link></Button></div>} description={description} icon={PackageSearch} title="Belum ada kiriman" /></Card>;
  }

  const current = summary.current;
  const previous = summary.previous;
  const previousLabel = context.range.presetId === "7-hari" ? "7 hari sebelumnya" : "periode sebelumnya";
  const metrics = [
    { current: current.createdCount, href: supportingLinks.created, icon: Package, label: "Kiriman dibuat", previous: previous.createdCount, value: countFormatter.format(current.createdCount) },
    { context: `Nilai barang ${idrFormatter.format(current.codDeclaredValueIdr)} · bukan dana diterima atau pendapatan.`, current: current.codCount, href: supportingLinks.cod, icon: Banknote, label: "Kiriman COD", previous: previous.codCount, value: countFormatter.format(current.codCount) },
    { context: `Nilai barang ${idrFormatter.format(current.nonCodDeclaredValueIdr)}.`, current: current.nonCodCount, href: supportingLinks["non-cod"], icon: Wallet, label: "Kiriman non-COD", previous: previous.nonCodCount, value: countFormatter.format(current.nonCodCount) },
    { context: "Berdasarkan waktu resi diterbitkan Mengantar.", current: current.issuedCount, href: supportingLinks.issued, icon: ReceiptText, label: "Resi terbit", previous: previous.issuedCount, value: countFormatter.format(current.issuedCount) },
  ];

  return (
    <div className={cn("grid gap-4", focusTargetClassName)} id="dashboard-period-results" tabIndex={-1}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 [&_[data-slot=card-title]]:min-h-10">
        {metrics.map((metric) => (
          <StatCard
            description={<><span className="block text-foreground"><DashboardComparison current={metric.current} previous={metric.previous} previousLabel={previousLabel} /></span>{metric.context ? <span className="mt-1 block leading-5">{metric.context}</span> : null}</>}
            href={metric.href}
            icon={metric.icon}
            key={metric.label}
            title={metric.label}
            value={metric.value}
            valueLabel={`${metric.value}. Lihat kiriman`}
          />
        ))}
      </div>
      {current.createdCount === 0 ? <Alert><PackageSearch aria-hidden="true" /><AlertTitle>Tidak ada input pada {context.periodLabel}</AlertTitle><AlertDescription>Pilih periode lain atau buat kiriman baru. Daftar pekerjaan di bawah tetap menampilkan status terbaru.</AlertDescription></Alert> : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
        <details className="group min-w-0 max-w-2xl text-xs text-muted-foreground">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8 [&::-webkit-details-marker]:hidden">Cara menghitung<ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180" /></summary>
          <p className="pb-1 leading-5">Dibandingkan dengan {context.previousPeriodLabel} · {context.timezoneLabel}. COD/non-COD dihitung saat kiriman dibuat; resi dihitung saat diterbitkan Mengantar. {`Data dianggap perlu diperbarui setelah ${DATA_STALE_AFTER_MS / 60_000} menit.`}</p>
        </details>
        <div className="flex flex-wrap items-center gap-x-3">
          {analyticsHref ? <Button asChild className="min-h-11 md:min-h-8" size="sm" variant="ghost"><Link href={analyticsHref}>Analitik lengkap<ArrowRight aria-hidden="true" /></Link></Button> : null}
          <DataFreshnessControl formattedGeneratedAt={formatClock(summary.generatedAt, context.range.timezone)} generatedAtIso={summary.generatedAt.toISOString()} initiallyStale={isDataStale(summary.generatedAt, new Date())} />
        </div>
      </div>
    </div>
  );
}

const supportLabels: Record<TenantDashboardPeriodSupportKind, string> = {
  cod: "kiriman COD dibuat",
  created: "semua kiriman dibuat",
  issued: "resi diterbitkan",
  "non-cod": "kiriman non-COD dibuat",
};

export async function DashboardPeriodSupportRegion({
  context,
  kind,
  promise,
}: {
  context: DashboardPeriodContext;
  kind: TenantDashboardPeriodSupportKind;
  promise: Promise<TenantDashboardPeriodSupport>;
}) {
  const result = await settle(promise);
  if (!result.ok) {
    return <RegionFailure description="KPI periode tetap tersedia. Muat ulang record pendukung ini." focusTargetId="dashboard-period-support" title="Record pendukung tidak dapat dimuat" />;
  }
  const support = result.value;
  return (
    <Card className={focusTargetClassName} id="dashboard-period-support" tabIndex={-1}>
      <CardHeader>
        <h3 className="text-base font-semibold leading-snug">Rincian kiriman: {supportLabels[kind]}</h3>
        <CardDescription>Data mengikuti periode, zona waktu, outlet, dan jenis aktivitas pada ringkasan di atas.</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTableShell className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_[data-slot=table-container]]:overflow-visible" label="Tabel rincian kiriman">
          <Table className="min-w-[46rem]">
            <TableCaption className="px-3 pb-3 text-left">Menampilkan {countFormatter.format(support.rows.length)} dari {countFormatter.format(support.totalCount)} kiriman pada {context.periodLabel} / {context.timezoneLabel}.</TableCaption>
            <TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-card">Kiriman</TableHead><TableHead>Waktu aktivitas</TableHead><TableHead>Outlet</TableHead><TableHead>Pembayaran</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{support.rows.map((row) => {
              const status = SHIPMENT_STATUS_PRESENTATION[row.status];
              return <TableRow key={row.shipmentId}><TableCell className="sticky left-0 z-10 bg-card"><ShipmentReferenceLink shipmentId={row.shipmentId} /></TableCell><TableCell>{formatInZone(row.occurredAt, context.range.timezone)}</TableCell><TableCell>{row.outletName}</TableCell><TableCell>{row.isCod ? "COD" : "Non-COD"}</TableCell><TableCell><ShipmentStatusBadge label={status.label} tone={status.tone} /></TableCell></TableRow>;
            })}</TableBody>
          </Table>
        </DataTableShell>
      </CardContent>
    </Card>
  );
}

export async function DashboardPeriodTrendRegion({
  context,
  demo = false,
  previousPromise,
  promise,
}: {
  context: DashboardPeriodContext;
  demo?: boolean;
  previousPromise: Promise<TenantDashboardPeriodTrendPoint[]>;
  promise: Promise<TenantDashboardPeriodTrendPoint[]>;
}) {
  if (context.range.spanDays <= 1) return null;
  const result = await settle(Promise.all([promise, previousPromise]));
  const heading = <h2 className={cardHeadingClassName} id="dashboard-trend-heading" tabIndex={-1}>Grafik kiriman</h2>;
  if (!result.ok) {
    return (
      <section aria-labelledby="dashboard-trend-heading" className={cn("flex min-w-0 flex-col", dashboardOverviewSpan)}>
        <Card className="min-w-0 flex-1">
          <CardHeader>{heading}</CardHeader>
          <CardContent><RegionFailure description="Ringkasan dan daftar pekerjaan tetap tersedia. Coba muat ulang grafik." focusTargetId="dashboard-trend-heading" title="Grafik kiriman tidak dapat dimuat" /></CardContent>
        </Card>
      </section>
    );
  }
  const byKey = new Map(result.value[0].map((point) => [point.key, point] as const));
  const previousByKey = new Map(result.value[1].map((point) => [point.key, point] as const));
  const compare = context.range.granularity === "harian";
  const previousBuckets = compare ? buildTrendBuckets(previousAnalyticsRange(context.range)) : [];
  const rows = buildTrendBuckets(context.range).map((bucket, index) => {
    const current = byKey.get(bucket.key);
    const previousBucket = previousBuckets[index];
    const previous = previousBucket ? previousByKey.get(previousBucket.key) : undefined;
    return {
      ...bucket,
      currentCount: (current?.codCount ?? 0) + (current?.nonCodCount ?? 0),
      previousCount: previousBucket ? (previous?.codCount ?? 0) + (previous?.nonCodCount ?? 0) : null,
      previousLabel: previousBucket?.label ?? "—",
    };
  });

  return (
    <section aria-labelledby="dashboard-trend-heading" className={cn("flex min-w-0 flex-col", dashboardOverviewSpan)}>
      <Card className="min-w-0 flex-1">
        <CardHeader>
          {heading}
          <CardDescription className="mt-1">{context.periodLabel}{compare ? ` dibanding ${context.previousPeriodLabel}` : ""} · {context.timezoneLabel}</CardDescription>
        </CardHeader>
        {/* A flex column stretches children to the card width (no min-content growth past the card edge at 390/768px, the earlier grid-track bug); flex-1 lets the chart take the row height the recent card sets from lg. */}
        <CardContent className="flex min-w-0 flex-1 flex-col gap-4 *:min-w-0">
          {demo ? <Alert><AlertTitle>Data demo</AlertTitle><AlertDescription>Grafik ini memakai data contoh. Ringkasan dan daftar kiriman tetap memakai data tersimpan.</AlertDescription></Alert> : null}
          <DashboardPeriodChart compare={compare} data={rows} sevenDays={context.range.presetId === "7-hari"} />
          <details className="min-w-0 rounded-md border">
            <summary className="min-h-11 cursor-pointer rounded-md px-3 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-8 md:py-2">Lihat tabel data tren</summary>
            <div aria-label="Tabel perbandingan kiriman" className="min-w-0 overflow-x-auto border-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_[data-slot=table-container]]:overflow-visible" role="region" tabIndex={0}>
              <Table>
                <TableCaption className="sr-only">Kiriman dibuat pada {context.periodLabel}{compare ? " dan periode sebelumnya" : ""}.</TableCaption>
                <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead className="text-right">Kiriman</TableHead>{compare ? <><TableHead>Tanggal pembanding</TableHead><TableHead className="text-right">Kiriman sebelumnya</TableHead></> : null}</TableRow></TableHeader>
                <TableBody>{rows.map((row) => <TableRow key={row.key}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row.currentCount)}</TableCell>{compare ? <><TableCell>{row.previousLabel}</TableCell><TableCell className="text-right tabular-nums">{row.previousCount === null ? "—" : countFormatter.format(row.previousCount)}</TableCell></> : null}</TableRow>)}</TableBody>
              </Table>
            </div>
          </details>
        </CardContent>
      </Card>
    </section>
  );
}

export async function DashboardMetricsRegion({ metricsPromise }: { metricsPromise: Promise<TenantDashboardMetrics> }) {
  const result = await settle(metricsPromise);
  if (!result.ok) return <RegionFailure description="Kesiapan outlet, ringkasan periode, dan kiriman terbaru tetap tersedia." title="Status operasional tidak dapat dimuat" />;
  const metrics = result.value;
  if (metrics.summary.total === 0) return null;
  const exception = metrics.actionRequiredBreakdown;
  const pulse = [
    { description: "Lengkapi data lalu muat estimasi.", href: shipmentQueueHref("DRAFT"), icon: FilePenLine, label: "Draf perlu dilanjutkan", value: metrics.workflowBreakdown.draft },
    { description: "Pilih layanan sebelum menerbitkan AWB.", href: shipmentQueueHref("ESTIMATED"), icon: ClipboardList, label: "Estimasi perlu dikonfirmasi", value: metrics.workflowBreakdown.estimated },
    { description: `${exception.submissionUnknown} status belum pasti · ${exception.failed} gagal`, href: shipmentQueueHref("ACTION_REQUIRED"), icon: CircleAlert, label: "Perlu tindakan", value: metrics.summary.actionRequired },
    ...(metrics.role === "TENANT_ADMIN" ? [
      { description: "Pembayaran provider perlu dipulihkan sebelum AWB tersedia.", href: shipmentQueueHref("AWAITING_UPSTREAM_PAYMENT"), icon: CircleAlert, label: "Menunggu pembayaran", value: exception.awaitingUpstreamPayment },
      { description: "Hasil rekonsiliasi terbaru yang masih memiliki selisih.", href: reconciliationVarianceHref(), icon: BookOpenText, label: "Selisih rekonsiliasi", value: metrics.finance.reconciliationVarianceCount },
    ] : []),
  ];
  return (
    <section aria-labelledby="pulse-heading" className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="grid min-w-0 gap-1">
          <p className="text-xs font-medium text-muted-foreground">Saat ini</p>
          <h2 className="text-lg font-semibold leading-tight tracking-tight" id="pulse-heading">Pekerjaan yang perlu diperhatikan</h2>
          <p className="text-sm text-muted-foreground">Status terbaru dari semua periode; tidak mengikuti filter di atas.</p>
        </div>
        <div className="shrink-0"><DataFreshnessControl formattedGeneratedAt={formatClock(metrics.generatedAt, "Asia/Jakarta")} generatedAtIso={metrics.generatedAt.toISOString()} initiallyStale={isDataStale(metrics.generatedAt, new Date())} /></div>
      </div>
      <div className={cn("grid gap-4 sm:grid-cols-2", metrics.role === "TENANT_ADMIN" ? "xl:grid-cols-5" : "xl:grid-cols-3")}>
        {pulse.map((item, index) => (
          // A grid wrapper keeps each card stretched to the row height; the last card of an
          // odd count spans the two-column row instead of leaving an empty cell.
          <div className={cn("grid", pulse.length % 2 === 1 && index === pulse.length - 1 && "sm:col-span-2 xl:col-span-1")} key={item.label}>
            <StatCard
              // Precise rows: titles reserve two lines from xl and the icon aligns to the first
              // title line, so every value and description starts on one line across the row.
              className="[&_[data-slot=card-header]]:items-start [&_[data-slot=card-title]]:leading-5 xl:[&_[data-slot=card-title]]:min-h-10"
              description={item.description}
              href={item.href}
              icon={item.icon}
              title={item.label}
              value={countFormatter.format(item.value)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The single shipment listing on the dashboard: the recent shipments merged with the
 * actionable set, each shipment once. Actionable rows lead (exceptions first, then
 * newest) with their role-specific next step; the rest follow newest first. Rows are
 * compact (reference, status, time / recipient, area, AWB, action); per-status guidance
 * lives on the shipment detail page.
 */
export async function DashboardRecentRegion({ actionPromise, multipleOutlets = false, recentPromise, role }: { actionPromise: Promise<TenantDashboardRecentShipment[]>; multipleOutlets?: boolean; recentPromise: Promise<TenantDashboardRecentShipment[]>; role: TenantShipmentRole }) {
  const [actionResult, recentResult] = await Promise.all([settle(actionPromise), settle(recentPromise)]);
  const heading = <h2 className={cardHeadingClassName} id="recent-heading" tabIndex={-1}>Kiriman terbaru</h2>;
  const allShipmentsLink = <CardAction><Button asChild className="max-md:min-h-11" size="sm" variant="outline"><Link href="/app/pengiriman">Lihat semua kiriman</Link></Button></CardAction>;
  if (!actionResult.ok && !recentResult.ok) {
    return (
      <section aria-labelledby="recent-heading" className={cn("flex min-w-0 flex-col", dashboardRecentSpan)}>
        <Card className="flex-1">
          <CardHeader>{heading}{allShipmentsLink}</CardHeader>
          <CardContent><RegionFailure description="Ringkasan periode dan status operasional tetap tersedia bila berhasil dimuat." focusTargetId="recent-heading" title="Kiriman terbaru dan tindak lanjut tidak dapat dimuat" /></CardContent>
        </Card>
      </section>
    );
  }
  const byId = new Map<string, TenantDashboardRecentShipment>();
  for (const row of [...(actionResult.ok ? actionResult.value : []), ...(recentResult.ok ? recentResult.value : [])]) {
    if (!byId.has(row.shipmentId)) byId.set(row.shipmentId, row);
  }
  const rank = (row: TenantDashboardRecentShipment) => exceptionStatuses.has(row.status) ? 0 : nextAction(row, role) ? 1 : 2;
  const rows = [...byId.values()]
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt.getTime() - a.updatedAt.getTime() || (a.shipmentId < b.shipmentId ? 1 : a.shipmentId > b.shipmentId ? -1 : 0))
    .slice(0, RECENT_VISIBLE_ROWS);
  const partialFailure = actionResult.ok !== recentResult.ok;
  return (
    <section aria-labelledby="recent-heading" className={cn("flex min-w-0 flex-col", dashboardRecentSpan)}>
      <Card className={cn("flex-1", rows.length > 0 && "pb-0")}>
        <CardHeader>
          {heading}
          <CardDescription>{rows.length > 0 ? "Yang perlu ditindaklanjuti tampil lebih dulu." : "Tidak ada kiriman yang perlu ditindaklanjuti saat ini."}</CardDescription>
          {allShipmentsLink}
        </CardHeader>
        {partialFailure ? <CardContent><RegionFailure description="Daftar di bawah mungkin belum lengkap. Coba muat ulang." focusTargetId="recent-heading" title={actionResult.ok ? "Sebagian kiriman terbaru tidak dapat dimuat" : "Tindak lanjut tidak dapat dimuat"} /></CardContent> : null}
        {rows.length > 0 ? (
          <ul aria-label="Daftar kiriman terbaru dan tindak lanjut" className="divide-y border-t" role="list">
            {rows.map((row) => {
              const status = SHIPMENT_STATUS_PRESENTATION[row.status];
              const action = nextAction(row, role);
              return (
                // minmax(0,1fr) keeps long provider AWBs from widening the page; the action sits
                // under the row on phones and in a right-hand column from sm, so rows align.
                <li className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-2 px-(--card-spacing) py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" data-actionable={action ? "true" : undefined} key={row.shipmentId}>
                  <div className="grid min-w-0 gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><ShipmentReferenceLink className="md:min-h-6" shipmentId={row.shipmentId} /><ShipmentStatusBadge label={status.label} tone={status.tone} /></div>
                    <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex min-w-0 max-w-full items-center gap-x-1.5">
                        <time className="shrink-0 whitespace-nowrap tabular-nums" dateTime={row.updatedAt.toISOString()} title={formatWibDateTime(row.updatedAt)}>{recentTimeFormatter.format(row.updatedAt)}<span className="sr-only"> WIB</span></time>
                        <span aria-hidden="true">·</span>
                        <span className="min-w-0 truncate">{row.recipientName} · {row.destinationAreaLabel}{multipleOutlets ? ` · ${row.outletName}` : ""}</span>
                      </span>
                      {/* The AWB is what staff copy, so it wraps to its own line rather than truncating. */}
                      {row.awb ? <span className="min-w-0 max-w-full break-all">AWB <span className="font-mono text-foreground">{row.awb}</span></span> : null}
                    </p>
                  </div>
                  {action ? <Button asChild className="w-full max-md:min-h-11 sm:w-auto" size="sm" variant="outline"><Link href={action.href}>{action.label}</Link></Button> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
    </section>
  );
}

function SkeletonCard({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <Card aria-busy={label ? "true" : undefined} aria-label={label} className={className}>{children}</Card>;
}

export function ReadinessSkeleton() { return <Skeleton aria-label="Memuat kesiapan outlet" className="h-20 w-full" />; }
export function PeriodSummarySkeleton() { return <div aria-busy="true" aria-label="Memuat ringkasan periode" className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index}><CardHeader className="flex flex-row items-center justify-between"><Skeleton className="h-4 w-28" /><Skeleton className="size-4" /></CardHeader><CardContent className="grid gap-2"><Skeleton className="h-8 w-20" /><Skeleton className="h-3 w-36" /></CardContent></SkeletonCard>)}</div>; }
export function PeriodTrendSkeleton() { return <SkeletonCard className={dashboardOverviewSpan} label="Memuat tren periode"><CardHeader><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></CardHeader><CardContent className="grid gap-4"><Skeleton className="h-60 w-full sm:h-72" /><Skeleton className="h-11 w-full" /></CardContent></SkeletonCard>; }
export function PeriodSupportSkeleton() { return <SkeletonCard label="Memuat record pendukung Ringkasan"><CardHeader><Skeleton className="h-5 w-64" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></SkeletonCard>; }
// Mirrors DashboardMetricsRegion's geometry: the three-line heading block beside the freshness
// control, then StatCard anatomy with the xl two-line title and the three-line description the longest admin card wraps to at xl.
export function MetricsSkeleton() { return <div aria-busy="true" aria-label="Memuat pekerjaan saat ini" className="grid gap-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6"><div className="grid gap-1"><Skeleton className="h-4 w-14" /><Skeleton className="h-5.5 w-72 max-w-full" /><Skeleton className="h-5 w-96 max-w-full" /></div><Skeleton className="h-8 w-36" /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <SkeletonCard className={cn("gap-2", index === 4 ? "sm:col-span-2 xl:col-span-1" : undefined)} key={index}><CardHeader className="flex flex-row items-start justify-between space-y-0 pb-0"><div className="min-h-5 xl:min-h-10"><Skeleton className="my-0.5 h-4 w-28" /></div><Skeleton className="size-4" /></CardHeader><CardContent className="grid gap-1"><div className="flex h-8 items-center"><Skeleton className="h-7 w-12" /></div><div className="grid h-4 content-start gap-2 pt-0.5 xl:h-12"><Skeleton className="h-3 w-36" /><Skeleton className="hidden h-3 w-24 xl:block" /></div></CardContent></SkeletonCard>)}</div></div>; }
export function RecentSkeleton() { return <SkeletonCard className={cn("pb-0", dashboardRecentSpan)} label="Memuat kiriman terbaru dan tindak lanjut"><CardHeader><Skeleton className="h-5 w-36" /><Skeleton className="h-4 w-48" /></CardHeader><div className="divide-y border-t">{Array.from({ length: RECENT_VISIBLE_ROWS }, (_, index) => <div className="grid gap-1.5 px-(--card-spacing) py-2.5" key={index}><div className="flex justify-between gap-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-20" /></div><Skeleton className="h-4 w-48 max-w-full" /></div>)}</div></SkeletonCard>; }
