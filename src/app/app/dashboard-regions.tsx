import {
  ArrowRight,
  BarChart3,
  BookOpenText,
  CircleAlert,
  ClipboardList,
  FilePenLine,
  PackageSearch,
  Settings2,
  Plus,
  Upload,
} from "lucide-react";
import Link from "next/link";

import { AnalyticsComparisonCue } from "@/app/app/analitik/comparison-cue";
import { DashboardPeriodChart } from "@/app/app/dashboard-period-chart";
import { DataFreshnessControl } from "@/components/cms/data-freshness-control";
import { EmptyState } from "@/components/cms/empty-state";
import { RetryRegionButton } from "@/components/cms/retry-region-button";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
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
import { buildTrendBuckets, formatInZone, type AnalyticsRange } from "@/lib/analytics-range";
import { isDataStale } from "@/lib/data-freshness";
import { reconciliationVarianceHref } from "@/lib/finance-exception-filter";
import { formatWibDateTime } from "@/lib/label-format";
import {
  SHIPMENT_STATUS_PRESENTATION,
  shipmentQueueHref,
  type TenantShipmentRole,
} from "@/lib/shipment-queue";

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

function shipmentReference(shipmentId: string) {
  return shipmentId.slice(0, 8).toUpperCase();
}

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
      return { href: detailHref, label: "Buka detail" };
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
          {role === "TENANT_ADMIN" ? <Button asChild size="sm" variant="outline"><Link href="/app/pengaturan">Siapkan outlet</Link></Button> : <span className="text-sm font-medium">Hubungi Tenant Admin untuk melengkapi outlet.</span>}
        </AlertDescription>
      </Alert>
    );
}

export async function DashboardHeaderActions({ promise, role }: { promise: Promise<OutletReadinessRow[]>; role: TenantShipmentRole }) {
  const result = await settle(promise);
  if (!result.ok) return null;
  const ready = result.value.some((outlet) => outlet.ready);
  if (!ready) {
    return role === "TENANT_ADMIN" ? <Button asChild className="max-sm:min-h-11 max-sm:w-full" variant="outline"><Link href="/app/pengaturan"><Settings2 aria-hidden="true" />Siapkan outlet</Link></Button> : null;
  }
  return <><Button asChild className="max-sm:min-h-11 max-sm:w-full" variant="outline"><Link href="/app/impor"><Upload aria-hidden="true" />Impor CSV</Link></Button><Button asChild className="max-sm:min-h-11 max-sm:w-full"><Link href="/app/pengiriman/baru"><Plus aria-hidden="true" />Buat kiriman</Link></Button></>;
}

export function DashboardQuickAccess({ role }: { role: TenantShipmentRole }) {
  return (
    <div className="grid gap-2">
      <Button asChild className="min-h-11 justify-start sm:min-h-8" variant="ghost"><Link href="/app/pengiriman"><PackageSearch aria-hidden="true" />Cari kiriman</Link></Button>
      {role === "TENANT_ADMIN" ? <><Button asChild className="min-h-11 justify-start sm:min-h-8" variant="ghost"><Link href="/app/analitik"><BarChart3 aria-hidden="true" />Buka analitik</Link></Button><Button asChild className="min-h-11 justify-start sm:min-h-8" variant="ghost"><Link href="/app/keuangan"><BookOpenText aria-hidden="true" />Buka keuangan</Link></Button></> : null}
    </div>
  );
}

export async function DashboardPeriodSummaryRegion({
  context,
  lifetimeMetricsPromise,
  outletReady,
  promise,
  supportingLinks,
}: {
  context: DashboardPeriodContext;
  lifetimeMetricsPromise: Promise<TenantDashboardMetrics>;
  outletReady: boolean;
  promise: Promise<TenantDashboardPeriodSummary>;
  supportingLinks: DashboardPeriodSupportingLinks;
}) {
  const result = await settle(Promise.all([promise, lifetimeMetricsPromise]));
  if (!result.ok) {
    return <CardContent><RegionFailure description="Pekerjaan saat ini dan kiriman terbaru tetap tersedia." focusTargetId="dashboard-period-results" title="Ringkasan periode tidak dapat dimuat" /></CardContent>;
  }
  const [summary, lifetimeMetrics] = result.value;
  if (lifetimeMetrics.summary.total === 0) {
    const description = outletReady
      ? "Outlet sudah siap. Buat kiriman pertama atau impor file CSV untuk mulai melihat ringkasan."
      : "Siapkan outlet, lalu buat kiriman pertama atau impor file CSV.";
    return <CardContent className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id="dashboard-period-results" tabIndex={-1}><EmptyState action={<div className="flex flex-wrap justify-center gap-2"><Button asChild className="min-h-11"><Link href="/app/pengiriman/baru">Buat kiriman</Link></Button><Button asChild className="min-h-11" variant="outline"><Link href="/app/impor"><Upload aria-hidden="true" />Impor CSV</Link></Button></div>} description={description} icon={PackageSearch} title="Belum ada kiriman" /></CardContent>;
  }

  const current = summary.current;
  const previous = summary.previous;
  const metrics = [
    { current: current.createdCount, href: supportingLinks.created, label: "Kiriman dibuat", previous: previous.createdCount, value: countFormatter.format(current.createdCount) },
    { context: `Nilai barang ${idrFormatter.format(current.codDeclaredValueIdr)} · bukan dana diterima atau revenue.`, current: current.codCount, href: supportingLinks.cod, label: "Kiriman COD", previous: previous.codCount, value: countFormatter.format(current.codCount) },
    { context: `Nilai barang ${idrFormatter.format(current.nonCodDeclaredValueIdr)}.`, current: current.nonCodCount, href: supportingLinks["non-cod"], label: "Kiriman non-COD", previous: previous.nonCodCount, value: countFormatter.format(current.nonCodCount) },
    { context: "Berdasarkan waktu AWB diterbitkan provider.", current: current.issuedCount, href: supportingLinks.issued, label: "Resi terbit", previous: previous.issuedCount, value: countFormatter.format(current.issuedCount) },
  ];

  return (
    <CardContent className="space-y-5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id="dashboard-period-results" tabIndex={-1}>
      <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Data event periode</p><DataFreshnessControl formattedGeneratedAt={formatInZone(summary.generatedAt, context.range.timezone)} generatedAtIso={summary.generatedAt.toISOString()} initiallyStale={isDataStale(summary.generatedAt, new Date())} /></div>
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <div className="min-w-0 bg-card p-4" key={metric.label}><dt className="text-sm font-medium text-muted-foreground"><Link className="underline-offset-4 hover:underline" href={metric.href}>{metric.label}</Link></dt><dd className="mt-2 text-3xl font-semibold tracking-tight tabular-nums"><Link aria-label={`${metric.label}: ${metric.value}. Lihat record pendukung`} className="underline-offset-4 hover:underline" href={metric.href}>{metric.value}</Link></dd>{metric.context ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.context}</p> : null}<p className="mt-2 text-xs leading-5 text-muted-foreground"><AnalyticsComparisonCue current={metric.current} previous={metric.previous} /></p></div>)}
      </dl>
      {current.createdCount === 0 ? <Alert><PackageSearch aria-hidden="true" /><AlertTitle>Tidak ada input pada {context.periodLabel}</AlertTitle><AlertDescription>Pilih periode lain atau buat kiriman baru. Pekerjaan saat ini di bawah tetap menampilkan snapshot terbaru.</AlertDescription></Alert> : null}
      <p className="text-xs leading-5 text-muted-foreground">Dibandingkan dengan {context.previousPeriodLabel} · {context.timezoneLabel}. COD/non-COD mengikuti waktu kiriman dibuat; resi mengikuti waktu outcome provider.</p>
    </CardContent>
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
    return <CardContent className="border-t"><RegionFailure description="KPI periode tetap tersedia. Muat ulang record pendukung ini." focusTargetId="dashboard-period-support" title="Record pendukung tidak dapat dimuat" /></CardContent>;
  }
  const support = result.value;
  return (
    <CardContent className="space-y-4 border-t pt-5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" id="dashboard-period-support" tabIndex={-1}>
      <div>
        <h3 className="font-semibold">Record pendukung: {supportLabels[kind]}</h3>
        <p className="mt-1 text-sm text-muted-foreground">Predicate periode, zona waktu, outlet, dan basis event sama dengan KPI di atas.</p>
      </div>
      <div aria-label="Tabel record pendukung Ringkasan" className="overflow-x-auto rounded-lg border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_[data-slot=table-container]]:overflow-visible" role="region" tabIndex={0}>
        <Table className="min-w-[46rem]">
          <TableCaption className="px-3 pb-3 text-left">Menampilkan {countFormatter.format(support.rows.length)} dari {countFormatter.format(support.totalCount)} record pada {context.periodLabel} / {context.timezoneLabel}.</TableCaption>
          <TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-card">Kiriman</TableHead><TableHead>Waktu event</TableHead><TableHead>Outlet</TableHead><TableHead>Pembayaran</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{support.rows.map((row) => {
            const status = SHIPMENT_STATUS_PRESENTATION[row.status];
            const reference = shipmentReference(row.shipmentId);
            return <TableRow key={row.shipmentId}><TableCell className="sticky left-0 z-10 bg-card font-mono font-semibold"><Link className="text-primary underline-offset-4 hover:underline" href={`/app/pengiriman/${encodeURIComponent(row.shipmentId)}`}>{reference}</Link></TableCell><TableCell>{formatInZone(row.occurredAt, context.range.timezone)}</TableCell><TableCell>{row.outletName}</TableCell><TableCell>{row.isCod ? "COD" : "Non-COD"}</TableCell><TableCell><ShipmentStatusBadge label={status.label} tone={status.tone} /></TableCell></TableRow>;
          })}</TableBody>
        </Table>
      </div>
    </CardContent>
  );
}

export async function DashboardPeriodTrendRegion({
  context,
  promise,
}: {
  context: DashboardPeriodContext;
  promise: Promise<TenantDashboardPeriodTrendPoint[]>;
}) {
  if (context.range.spanDays <= 1) return null;
  const result = await settle(promise);
  if (!result.ok) {
    return <CardContent className="border-t"><RegionFailure description="KPI periode dan pekerjaan saat ini tetap tersedia." focusTargetId="dashboard-trend-heading" title="Tren input tidak dapat dimuat" /></CardContent>;
  }
  const byKey = new Map(result.value.map((point) => [point.key, point] as const));
  const rows = buildTrendBuckets(context.range).map((bucket) => ({
    ...bucket,
    codCount: byKey.get(bucket.key)?.codCount ?? 0,
    nonCodCount: byKey.get(bucket.key)?.nonCodCount ?? 0,
  }));
  if (rows.every((row) => row.codCount + row.nonCodCount === 0)) return null;

  return (
    <CardContent className="space-y-4 border-t pt-5">
      <div><h3 className="rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id="dashboard-trend-heading" tabIndex={-1}>Tren input COD dan non-COD</h3><p className="mt-1 text-sm text-muted-foreground">Volume kiriman dibuat pada {context.periodLabel}; tinggi kolom menunjukkan total input.</p></div>
      <DashboardPeriodChart data={rows} />
      <details className="rounded-lg border"><summary className="min-h-11 cursor-pointer rounded-lg px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Lihat tabel data tren</summary><div className="overflow-x-auto border-t [&_[data-slot=table-container]]:overflow-visible"><Table><TableCaption className="sr-only">Input COD dan non-COD pada {context.periodLabel}.</TableCaption><TableHeader><TableRow><TableHead>Periode</TableHead><TableHead className="text-right">COD</TableHead><TableHead className="text-right">Non-COD</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.key}><TableCell className="font-medium" scope="row">{row.label}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row.codCount)}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row.nonCodCount)}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row.codCount + row.nonCodCount)}</TableCell></TableRow>)}</TableBody></Table></div></details>
    </CardContent>
  );
}

export async function DashboardMetricsRegion({ metricsPromise }: { metricsPromise: Promise<TenantDashboardMetrics> }) {
  const result = await settle(metricsPromise);
  if (!result.ok) return <RegionFailure description="Kesiapan outlet, akses cepat, dan region kiriman tetap tersedia." title="Status operasional tidak dapat dimuat" />;
  const metrics = result.value;
    if (metrics.summary.total === 0) return null;
    const exception = metrics.actionRequiredBreakdown;
    const pulse = [
      { description: "Lengkapi data lalu muat estimasi.", href: shipmentQueueHref("DRAFT"), icon: FilePenLine, label: "Draf perlu dilanjutkan", value: metrics.workflowBreakdown.draft },
      { description: "Pilih layanan sebelum menerbitkan AWB.", href: shipmentQueueHref("ESTIMATED"), icon: ClipboardList, label: "Estimasi perlu dikonfirmasi", value: metrics.workflowBreakdown.estimated },
      { description: `${exception.submissionUnknown} status belum pasti · ${exception.failed} gagal`, href: shipmentQueueHref("ACTION_REQUIRED"), icon: CircleAlert, label: "Perlu tindakan", value: exception.submissionUnknown + exception.failed },
      ...(metrics.role === "TENANT_ADMIN" ? [
        { description: "Pembayaran provider perlu dipulihkan sebelum AWB tersedia.", href: shipmentQueueHref("ACTION_REQUIRED"), icon: CircleAlert, label: "Menunggu pembayaran", value: exception.awaitingUpstreamPayment },
        { description: "Hasil rekonsiliasi terbaru yang masih memiliki selisih.", href: reconciliationVarianceHref(), icon: BookOpenText, label: "Selisih rekonsiliasi", value: metrics.finance.reconciliationVarianceCount },
      ] : []),
    ];
    return (
        <section aria-labelledby="pulse-heading" className="space-y-3">
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Saat ini</p><h2 className="text-base font-semibold" id="pulse-heading">Pekerjaan yang perlu diperhatikan</h2><p className="text-sm text-muted-foreground">Snapshot lifecycle terbaru; tidak mengikuti filter periode di atas.</p></div>
          <DataFreshnessControl formattedGeneratedAt={formatWibDateTime(metrics.generatedAt)} generatedAtIso={metrics.generatedAt.toISOString()} initiallyStale={isDataStale(metrics.generatedAt, new Date())} />
          <dl className={`grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 ${metrics.role === "TENANT_ADMIN" ? "xl:grid-cols-5" : "xl:grid-cols-3"}`}>
            {pulse.map((item) => { const Icon = item.icon; const isAdminFinance = metrics.role === "TENANT_ADMIN" && item.label === "Selisih rekonsiliasi"; return <div className={`relative bg-card p-4 transition-colors hover:bg-muted/40 ${isAdminFinance ? "sm:col-span-2 xl:col-span-1" : ""}`} key={item.label}><Link aria-label={`${item.label}: ${item.value}. ${item.description}`} className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" href={item.href} /><dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Icon aria-hidden="true" className="size-4" />{item.label}</dt><dd className="mt-3"><span className="group inline-flex min-h-11 items-center gap-2 text-3xl font-semibold tracking-tight tabular-nums">{item.value}<ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" /></span><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p></dd></div>; })}
          </dl>
        </section>
    );
}

export async function DashboardActionRegion({ promise, role }: { promise: Promise<TenantDashboardRecentShipment[]>; role: TenantShipmentRole }) {
  const result = await settle(promise);
  if (!result.ok) return <RegionFailure description="Status dan kiriman terbaru tetap tersedia bila berhasil dimuat." focusTargetId="action-heading" title="Tindak lanjut tidak dapat dimuat" />;
  const rows = result.value;
  if (rows.length === 0) return <section aria-labelledby="action-heading" className="rounded-lg border bg-card px-5 py-4"><h2 className="font-semibold" id="action-heading">Tindak lanjut</h2><p className="mt-1 text-sm text-muted-foreground">Tidak ada kiriman yang perlu ditindaklanjuti saat ini.</p><Button asChild className="mt-3" size="sm" variant="outline"><Link href="/app/pengiriman">Lihat antrean kiriman</Link></Button></section>;
  return <section aria-labelledby="action-heading" className="min-w-0 rounded-lg border bg-card"><div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4"><div><h2 className="rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id="action-heading" tabIndex={-1}>Tindak lanjut</h2><p className="mt-1 text-sm text-muted-foreground">Draf, estimasi, dan pengecualian yang memiliki langkah berikutnya.</p></div><Button asChild size="sm" variant="ghost"><Link href="/app/pengiriman">Lihat antrean</Link></Button></div><ul className="divide-y" role="list">{rows.map((row) => { const status = SHIPMENT_STATUS_PRESENTATION[row.status]; const action = nextAction(row, role); return <li className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={row.shipmentId}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link className="font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline" href={`/app/pengiriman/${encodeURIComponent(row.shipmentId)}`}>{shipmentReference(row.shipmentId)}</Link><ShipmentStatusBadge label={status.label} tone={status.tone} /></div><p className="mt-1 truncate text-sm">{row.recipientName} · {row.outletName}</p><p className="mt-0.5 text-xs text-muted-foreground">{status.guidance} · {formatWibDateTime(row.updatedAt)}</p></div><Button asChild size="sm" variant="outline"><Link href={action.href}>{action.label}</Link></Button></li>; })}</ul></section>;
}

export async function DashboardRecentRegion({ promise }: { promise: Promise<TenantDashboardRecentShipment[]> }) {
  const result = await settle(promise);
  if (!result.ok) return <RegionFailure description="Status operasional dan tindak lanjut tetap tersedia." title="Kiriman terbaru tidak dapat dimuat" />;
  const rows = result.value;
    if (rows.length === 0) return null;
  return <section aria-labelledby="recent-heading" className="min-w-0 space-y-3"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold" id="recent-heading">Kiriman terbaru</h2><p className="text-sm text-muted-foreground">Aktivitas terbaru dengan pengecualian diprioritaskan.</p></div><Button asChild size="sm" variant="outline"><Link href="/app/pengiriman">Lihat semua kiriman</Link></Button></div><div aria-label="Tabel kiriman terbaru" className="overflow-x-auto rounded-lg border bg-card [&_[data-slot=table-container]]:overflow-visible" role="region" tabIndex={0}><Table><TableCaption className="sr-only">Kiriman tenant terbaru dan status operasionalnya.</TableCaption><TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-card">Referensi</TableHead><TableHead>Penerima</TableHead><TableHead>Outlet</TableHead><TableHead>Status</TableHead><TableHead>Tujuan</TableHead><TableHead>Aktivitas terakhir</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => { const status = SHIPMENT_STATUS_PRESENTATION[row.status]; return <TableRow key={row.shipmentId}><TableCell className="sticky left-0 z-10 bg-card font-mono font-semibold"><Link className="text-primary underline-offset-4 hover:underline" href={`/app/pengiriman/${encodeURIComponent(row.shipmentId)}`}>{shipmentReference(row.shipmentId)}</Link></TableCell><TableCell>{row.recipientName}</TableCell><TableCell>{row.outletName}</TableCell><TableCell><ShipmentStatusBadge label={status.label} tone={status.tone} /></TableCell><TableCell>{row.destinationAreaLabel}</TableCell><TableCell>{formatWibDateTime(row.updatedAt)}</TableCell></TableRow>; })}</TableBody></Table></div></section>;
}

export function ReadinessSkeleton() { return <Skeleton aria-label="Memuat kesiapan outlet" className="h-20 w-full" />; }
export function PeriodSummarySkeleton() { return <CardContent aria-busy="true" aria-label="Memuat ringkasan periode" className="space-y-5"><Skeleton className="h-12 w-full" /><div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="space-y-3 bg-card p-4" key={index}><Skeleton className="h-4 w-28" /><Skeleton className="h-9 w-20" /><Skeleton className="h-3 w-36" /></div>)}</div></CardContent>; }
export function PeriodTrendSkeleton() { return <CardContent aria-busy="true" aria-label="Memuat tren periode" className="space-y-4 border-t pt-5"><Skeleton className="h-5 w-56" /><Skeleton className="h-64 w-full" /><Skeleton className="h-11 w-full" /></CardContent>; }
export function PeriodSupportSkeleton() { return <CardContent aria-busy="true" aria-label="Memuat record pendukung Ringkasan" className="space-y-4 border-t pt-5"><Skeleton className="h-5 w-64" /><Skeleton className="h-40 w-full" /></CardContent>; }
export function MetricsSkeleton() { return <div aria-busy="true" aria-label="Memuat pekerjaan saat ini" className="space-y-4"><Skeleton className="h-12 w-full" /><div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div className="space-y-3 bg-card p-4" key={index}><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-36" /></div>)}</div></div>; }
export function ActionSkeleton() { return <div aria-busy="true" aria-label="Memuat tindak lanjut" className="space-y-3 rounded-lg border bg-card p-5"><Skeleton className="h-5 w-36" />{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-14 w-full" key={index} />)}</div>; }
export function RecentSkeleton() { return <div aria-busy="true" aria-label="Memuat kiriman terbaru" className="space-y-3"><Skeleton className="h-5 w-36" /><div className="space-y-px rounded-lg border p-3">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-10 w-full" key={index} />)}</div></div>; }
