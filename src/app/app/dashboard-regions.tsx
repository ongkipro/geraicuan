import {
  ArrowRight,
  Banknote,
  ChevronDown,
  CircleAlert,
  Minus,
  Package,
  PackageSearch,
  Plus,
  ReceiptText,
  Settings2,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";
import { shipmentDetailHref } from "@/lib/shipment-number";
import Link from "next/link";
import type { ReactNode } from "react";

import { DashboardPeriodChart } from "@/app/app/dashboard-period-chart";
import { cardBandClassName } from "@/components/cms/cms-layouts";
import { DataFreshnessControl } from "@/components/cms/data-freshness-control";
import { DataTableShell } from "@/components/cms/data-table-shell";
import { EmptyState } from "@/components/cms/empty-state";
import { RetryRegionButton } from "@/components/cms/retry-region-button";
import { PaymentStack } from "@/components/cms/shipment-table-cells";
import { ShipmentStatusBadge, toneIcon } from "@/components/cms/shipment-status-badge";
import { StatCard } from "@/components/cms/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  TenantDashboardCourierRecap,
  TenantDashboardMetrics,
  TenantDashboardOutcomeSummary,
  TenantDashboardPeriodSummary,
  TenantDashboardPeriodSupport,
  TenantDashboardPeriodSupportKind,
  TenantDashboardPeriodTrendPoint,
  TenantDashboardRecentShipment,
} from "@/db/tenant-dashboard-repository";
import { formatAnalyticsComparison } from "@/lib/analytics-decision-context";
import { courierDisplayName, courierRecapOrder } from "@/lib/mengantar-couriers";
import { buildTrendBuckets, formatInZone, previousAnalyticsRange, type AnalyticsRange } from "@/lib/analytics-range";
import { DATA_STALE_AFTER_MS, isDataStale } from "@/lib/data-freshness";
import { formatWibDateTime } from "@/lib/label-format";
import { providerDeliveryBasisSentence } from "@/lib/provider-delivery-status";
import {
  SHIPMENT_STATUS_PRESENTATION,
  type TenantShipmentRole,
} from "@/lib/shipment-queue";
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
function DashboardComparison({ current, direction = "up-is-good", previous, previousLabel }: {
  current: number;
  /**
   * Whether a rise is good news. More shipments is growth; more failures is not, so the
   * colour follows meaning, never the arithmetic sign. `neutral` keeps the muted tone
   * for figures where neither direction is inherently better.
   */
  direction?: "up-is-good" | "up-is-bad" | "neutral";
  previous: number;
  previousLabel: string;
}) {
  const comparison = formatAnalyticsComparison(current, previous);
  const delta = current - previous;
  const percentage = comparison.text.match(/^(\d+)%/)?.[1];
  const magnitude = countFormatter.format(Math.abs(delta));
  const visible = delta === 0
    ? `Tidak berubah vs ${previousLabel}`
    : `${delta > 0 ? "+" : "−"}${magnitude} (${percentage ? `${percentage}%` : "naik dari 0"}) vs ${previousLabel}`;
  const good = delta === 0 || direction === "neutral" ? null : (delta > 0) === (direction === "up-is-good");
  const Trend = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  // The arrow and the signed number carry the direction; colour only reinforces it.
  const toneClassName = good === null
    ? "bg-muted/80 text-muted-foreground border border-border/50"
    : good
      ? "bg-[var(--ok-surface)] text-[var(--ok)] border border-[var(--ok)]/20 font-semibold"
      : "bg-[var(--danger-surface)] text-[var(--danger)] border border-[var(--danger)]/20 font-semibold";
  return (
    <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-normal shadow-2xs", toneClassName)}>
      <Trend aria-hidden="true" className="size-3 shrink-0" />
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{delta === 0 ? "" : `${delta > 0 ? "Naik" : "Turun"} ${magnitude} kiriman, dari ${countFormatter.format(previous)} menjadi ${countFormatter.format(current)}. `}{comparison.text}</span>
    </span>
  );
}

/** Focus ring for region containers that receive programmatic focus. */
const focusTargetClassName = "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
/** Icon colour per tone; the label beside it carries the meaning without the colour. */
const toneTextClass = {
  danger: "text-[var(--danger)]",
  neutral: "text-muted-foreground",
  ok: "text-[var(--ok)]",
  warn: "text-[var(--warn)]",
} as const;
const cardHeadingClassName = cn("text-base font-semibold leading-snug", focusTargetClassName);
/**
 * Owner steering 2026-09-16: a card's headline sits on a muted band so the eye finds
 * the section title before the numbers. The band spans the card because Card owns the
 * vertical padding; `border-b` makes CardHeader add its own bottom padding.
 */

/**
 * Column spans of the chart + recent row (shadcn-admin 4/3 split). When the chart
 * renders nothing (single-day range) the recent card takes the full row instead of
 * leaving an empty column.
 */
export const dashboardOverviewSpan = "max-lg:order-2 lg:col-span-4 lg:only:col-span-7";
export const dashboardRecentSpan = "max-lg:order-1 lg:col-span-3 lg:only:col-span-7";
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
  const detailHref = shipmentDetailHref(row.publicReference);
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

function ShipmentReferenceLink({ className, publicReference }: { className?: string; publicReference: string }) {
  return (
    <Link
      className={cn("inline-flex min-h-11 max-w-40 items-center whitespace-normal wrap-anywhere rounded-sm font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8", className)}
      href={shipmentDetailHref(publicReference)}
    >
      {publicReference}
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
        {role === "TENANT_ADMIN" ? <Button asChild className="min-h-11 md:min-h-8" size="sm" variant="outline"><Link href="/app/pengaturan/outlet">Siapkan outlet</Link></Button> : <span className="text-sm font-medium">Hubungi Tenant Admin untuk melengkapi outlet.</span>}
      </AlertDescription>
    </Alert>
  );
}

export async function DashboardHeaderActions({ promise, role }: { promise: Promise<OutletReadinessRow[]>; role: TenantShipmentRole }) {
  const result = await settle(promise);
  if (!result.ok) return null;
  const ready = result.value.some((outlet) => outlet.ready);
  if (!ready) {
    return role === "TENANT_ADMIN" ? <Button asChild className="max-sm:flex-1" variant="outline"><Link href="/app/pengaturan/outlet"><Settings2 aria-hidden="true" />Siapkan outlet</Link></Button> : null;
  }
  return (
    <>
      <Button asChild className="max-sm:flex-1 rounded-xl font-medium border-border/70 bg-background/80 hover:bg-muted/80 backdrop-blur-md transition-all active:scale-[0.98]" variant="outline">
        <Link href="/app/impor"><Upload aria-hidden="true" className="size-4" />Impor CSV</Link>
      </Button>
      <Button asChild className="max-sm:flex-1 rounded-xl font-medium shadow-md shadow-blue-500/20 active:scale-[0.98] transition-all bg-blue-600 hover:bg-blue-700 text-white">
        <Link href="/app/pengiriman/baru"><Plus aria-hidden="true" className="size-4" />Buat kiriman</Link>
      </Button>
    </>
  );
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
    { accent: "blue" as const, current: current.createdCount, href: supportingLinks.created, icon: Package, label: "Kiriman dibuat", previous: previous.createdCount, value: countFormatter.format(current.createdCount) },
    { accent: "emerald" as const, current: current.codCount, href: supportingLinks.cod, icon: Banknote, label: "Kiriman COD", previous: previous.codCount, value: countFormatter.format(current.codCount) },
    { accent: "indigo" as const, current: current.nonCodCount, href: supportingLinks["non-cod"], icon: Wallet, label: "Kiriman non-COD", previous: previous.nonCodCount, value: countFormatter.format(current.nonCodCount) },
    { accent: "amber" as const, current: current.issuedCount, direction: "up-is-good" as const, href: supportingLinks.issued, icon: ReceiptText, label: "Resi terbit", previous: previous.issuedCount, value: countFormatter.format(current.issuedCount) },
  ];

  return (
    <div className={cn("grid gap-4", focusTargetClassName)} id="dashboard-period-results" tabIndex={-1}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map((metric) => (
          <StatCard
            accent={metric.accent}
            description={<span className="block text-foreground"><DashboardComparison current={metric.current} direction={metric.direction ?? "up-is-good"} previous={metric.previous} previousLabel={previousLabel} /></span>}
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
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-1">
        <details className="group min-w-0 max-w-2xl text-xs text-muted-foreground">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8 [&::-webkit-details-marker]:hidden">Cara menghitung<ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180" /></summary>
          <p className="pb-1 leading-5">Dibandingkan dengan {context.previousPeriodLabel} · {context.timezoneLabel}. COD/non-COD dihitung saat kiriman dibuat; COD mencakup COD Ongkir; resi dihitung saat diterbitkan Mengantar. {`Data dianggap perlu diperbarui setelah ${DATA_STALE_AFTER_MS / 60_000} menit.`}</p>
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
  cod: "kiriman COD dan COD Ongkir dibuat",
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
      <CardHeader className={cardBandClassName}>
        <h3 className="text-base font-semibold leading-snug">Rincian kiriman: {supportLabels[kind]}</h3>
        <CardDescription>Data mengikuti periode, zona waktu, outlet, dan jenis aktivitas pada ringkasan di atas.</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTableShell className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_[data-slot=table-container]]:overflow-visible" label="Tabel rincian kiriman">
          <Table className="min-w-[46rem]">
            <TableCaption className="px-3 pb-3 text-left">Menampilkan {countFormatter.format(support.rows.length)} dari {countFormatter.format(support.totalCount)} kiriman pada {context.periodLabel} / {context.timezoneLabel}.</TableCaption>
            <TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-inherit">Kiriman</TableHead><TableHead>Waktu aktivitas</TableHead><TableHead>Outlet</TableHead><TableHead>Pembayaran</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{support.rows.map((row) => {
              const status = SHIPMENT_STATUS_PRESENTATION[row.status];
              return <TableRow key={row.shipmentId}><TableCell className="sticky left-0 z-10 bg-inherit"><ShipmentReferenceLink publicReference={row.publicReference} /></TableCell><TableCell>{formatInZone(row.occurredAt, context.range.timezone)}</TableCell><TableCell>{row.outletName}</TableCell><TableCell><PaymentStack facts={{ declaredValueIdr: null, paymentMethod: row.paymentMethod, providerCodAmountIdr: null }} /></TableCell><TableCell><ShipmentStatusBadge label={status.label} tone={status.tone} /></TableCell></TableRow>;
            })}</TableBody>
          </Table>
        </DataTableShell>
      </CardContent>
    </Card>
  );
}

/** Column spans of the outcome + courier row inside `dashboardOverviewGridClassName`. */

/**
 * Spec 19 SHP-OUTCOME-DELIVERED / -RETURNED / -FAILED. Reads as a cohort: the
 * shipments created in the selected period, where they stand now. The caption
 * carries that basis so the numbers are never read as period events.
 */
export async function DashboardOutcomeRegion({
  context,
  promise,
}: {
  context: DashboardPeriodContext;
  promise: Promise<TenantDashboardOutcomeSummary>;
}) {
  const result = await settle(promise);
  const heading = <h2 className={cardHeadingClassName} id="dashboard-outcome-heading" tabIndex={-1}>Hasil pengiriman</h2>;
  if (!result.ok) {
    return (
      <section aria-labelledby="dashboard-outcome-heading" className="flex min-w-0 flex-col">
        <Card className="min-w-0 flex-1">
          <CardHeader className={cardBandClassName}>{heading}</CardHeader>
          <CardContent><RegionFailure description="Ringkasan periode dan rekap kurir tetap tersedia." focusTargetId="dashboard-outcome-heading" title="Hasil pengiriman tidak dapat dimuat" /></CardContent>
        </Card>
      </section>
    );
  }
  const outcome = result.value;
  const rows = [
    { key: "delivered", label: SHIPMENT_STATUS_PRESENTATION.DELIVERED.label, tone: "ok" as const, value: outcome.delivered },
    { key: "returned", label: "Retur", tone: "warn" as const, value: outcome.returned },
    { key: "failed", label: SHIPMENT_STATUS_PRESENTATION.FAILED.label, tone: "danger" as const, value: outcome.failed },
    // Without this row the three settled outcomes read as the whole cohort.
    { key: "in-progress", label: "Masih berjalan", tone: "neutral" as const, value: outcome.inProgress },
  ];

  return (
    <section aria-labelledby="dashboard-outcome-heading" className="flex min-w-0 flex-col">
      <Card className={cn("min-w-0 flex-1 ios-glass-card border-border/60 shadow-sm", outcome.cohortCount > 0 ? "gap-4" : "pb-0")}>
        <CardHeader className={cardBandClassName}>
          {heading}
          <CardDescription className="mt-1">{context.periodLabel} · {context.timezoneLabel} · Status terkini paket periode ini</CardDescription>
        </CardHeader>
        {outcome.cohortCount === 0 ? (
          <EmptyState description="Belum ada kiriman yang dibuat pada periode ini, jadi belum ada hasil pengiriman yang bisa diringkas." icon={PackageSearch} title="Belum ada hasil pada periode ini" />
        ) : (
          <CardContent className="grid min-w-0 gap-3">
            <DataTableShell className="[&_[data-slot=table-container]]:overflow-visible" label="Tabel hasil pengiriman">
              {/* Four short columns fit a 390px card without scrolling; no min-width. */}
              <Table>
                <TableCaption className="sr-only">Status terkini dari {countFormatter.format(outcome.cohortCount)} kiriman yang dibuat pada {context.periodLabel}. Retur mencakup {SHIPMENT_STATUS_PRESENTATION.RTS_QUEUED.label.toLowerCase()}, {SHIPMENT_STATUS_PRESENTATION.RTS_IN_TRANSIT.label.toLowerCase()}, dan {SHIPMENT_STATUS_PRESENTATION.RTS_RECEIVED.label.toLowerCase()}. COD mengikuti penanda COD saat kiriman dibuat, termasuk COD Ongkir. {providerDeliveryBasisSentence({
                  formattedObservedAt: outcome.basis.lastObservedAt ? formatWibDateTime(outcome.basis.lastObservedAt) : null,
                  observationVisible: outcome.basis.observationVisible,
                  subject: "Terkirim, retur, dan gagal",
                })}</TableCaption>
                <TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-inherit">Hasil</TableHead><TableHead className="text-right">COD</TableHead><TableHead className="text-right">Non-COD</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>{rows.map((row) => (
                  <TableRow key={row.key} className="transition-colors hover:bg-muted/30">
                    <TableCell className="sticky left-0 z-10 bg-inherit font-medium">
                      <span className="flex items-center gap-2">
                        {(() => { const Icon = toneIcon[row.tone]; return <Icon aria-hidden="true" className={cn("size-4", toneTextClass[row.tone])} />; })()}
                        {row.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{countFormatter.format(row.value.codCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{countFormatter.format(row.value.nonCodCount)}</TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", row.value.totalCount > 0 ? toneTextClass[row.tone] : undefined)}>{countFormatter.format(row.value.totalCount)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </DataTableShell>
            <DataFreshnessControl formattedGeneratedAt={formatClock(outcome.generatedAt, context.range.timezone)} generatedAtIso={outcome.generatedAt.toISOString()} initiallyStale={isDataStale(outcome.generatedAt, new Date())} />
          </CardContent>
        )}
      </Card>
    </section>
  );
}

/**
 * Spec 19 CRR-SHIPMENTS / CRR-DELIVERED / CRR-RETURNED / CRR-SHIPPING-IDR.
 * Couriers are named in text — we license no courier artwork.
 */
export async function DashboardCourierRecapRegion({
  context,
  promise,
}: {
  context: DashboardPeriodContext;
  promise: Promise<TenantDashboardCourierRecap>;
}) {
  const result = await settle(promise);
  const heading = <h2 className={cardHeadingClassName} id="dashboard-courier-heading" tabIndex={-1}>Rekap per kurir</h2>;
  if (!result.ok) {
    return (
      <section aria-labelledby="dashboard-courier-heading" className="flex min-w-0 flex-col">
        <Card className="min-w-0 flex-1">
          <CardHeader className={cardBandClassName}>{heading}</CardHeader>
          <CardContent><RegionFailure description="Ringkasan periode dan hasil pengiriman tetap tersedia." focusTargetId="dashboard-courier-heading" title="Rekap per kurir tidak dapat dimuat" /></CardContent>
        </Card>
      </section>
    );
  }
  const recap = result.value;
  const showCost = recap.shippingCostVisible;
  const byCourier = new Map(recap.rows.map((row) => [row.courier, row]));
  // Every Mengantar courier gets its own table, including the ones with no shipment in
  // the period: "belum dipakai" is an answer the operator came for.
  const couriers = courierRecapOrder(recap.rows.map((row) => row.courier));
  const totals = recap.rows.reduce(
    (sum, row) => ({
      deliveredCount: sum.deliveredCount + row.deliveredCount,
      returnedCount: sum.returnedCount + row.returnedCount,
      shipmentCount: sum.shipmentCount + row.shipmentCount,
      shippingCostIdr: sum.shippingCostIdr + (row.shippingCostIdr ?? 0),
    }),
    { deliveredCount: 0, returnedCount: 0, shipmentCount: 0, shippingCostIdr: 0 },
  );

  return (
    <section aria-labelledby="dashboard-courier-heading" className="grid min-w-0 gap-4">
      <div className="grid gap-1">
        {heading}
        <p className="max-w-2xl text-sm text-muted-foreground">
          {context.periodLabel} · {context.timezoneLabel}. Status terkini kiriman per ekspedisi.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {couriers.map((courier) => {
          const row = byCourier.get(courier);
          const used = Boolean(row && row.shipmentCount > 0);
          return (
            <Card className="ios-glass-card min-w-0 border-border/60 hover:border-primary/40 hover:shadow-md transition-all duration-200" key={courier}>
              <CardHeader className={cardBandClassName}>
                <CardTitle className="flex items-center justify-between gap-2 text-sm">
                  {courierDisplayName(courier)}
                  {used ? null : <span className="text-xs font-normal text-muted-foreground">Belum dipakai</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableCaption className="sr-only">Rekap {courierDisplayName(courier)} pada {context.periodLabel}</TableCaption>
                  <TableBody>
                    <TableRow><TableCell className="font-medium">Kiriman</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row?.shipmentCount ?? 0)}</TableCell></TableRow>
                    <TableRow><TableCell className="font-medium">Terkirim</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row?.deliveredCount ?? 0)}</TableCell></TableRow>
                    <TableRow><TableCell className="font-medium">Retur</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row?.returnedCount ?? 0)}</TableCell></TableRow>
                    {showCost ? <TableRow><TableCell className="font-medium">Biaya kirim</TableCell><TableCell className="text-right tabular-nums">{idrFormatter.format(row?.shippingCostIdr ?? 0)}</TableCell></TableRow> : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Total {countFormatter.format(totals.shipmentCount)} kiriman · {countFormatter.format(totals.deliveredCount)} terkirim · {countFormatter.format(totals.returnedCount)} retur
          {showCost ? ` · biaya kirim ${idrFormatter.format(totals.shippingCostIdr)}` : ""}
        </p>
        <DataFreshnessControl formattedGeneratedAt={formatClock(recap.generatedAt, context.range.timezone)} generatedAtIso={recap.generatedAt.toISOString()} initiallyStale={isDataStale(recap.generatedAt, new Date())} />
      </div>
    </section>
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
          <CardHeader className={cardBandClassName}>{heading}</CardHeader>
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
      <Card className="ios-glass-card border-border/60 shadow-sm min-w-0 flex-1">
        <CardHeader className={cardBandClassName}>
          {heading}
          <CardDescription className="mt-1">{context.periodLabel}{compare ? ` dibanding ${context.previousPeriodLabel}` : ""} · {context.timezoneLabel}</CardDescription>
        </CardHeader>
        {/* A flex column stretches children to the card width (no min-content growth past the card edge at 390/768px, the earlier grid-track bug); flex-1 lets the chart take the row height the recent card sets from lg. */}
        <CardContent className="flex min-w-0 flex-1 flex-col gap-4 *:min-w-0">
          {demo ? <Alert><AlertTitle>Data demo</AlertTitle><AlertDescription>Grafik ini memakai data contoh. Ringkasan dan daftar kiriman tetap memakai data tersimpan.</AlertDescription></Alert> : null}
          <DashboardPeriodChart compare={compare} data={rows} sevenDays={context.range.presetId === "7-hari"} />
          <details className="group min-w-0 rounded-md border border-border/80 bg-card transition-colors">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-9 [&::-webkit-details-marker]:hidden">
              <span>Lihat tabel data tren</span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div aria-label="Tabel perbandingan kiriman" className="min-w-0 overflow-x-auto border-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_[data-slot=table-container]]:overflow-visible" role="region" tabIndex={0}>
              <Table>
                <TableCaption className="sr-only">Kiriman dibuat pada {context.periodLabel}{compare ? " dan periode sebelumnya" : ""}.</TableCaption>
                <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead className="text-right">Kiriman</TableHead>{compare ? <><TableHead>Tanggal pembanding</TableHead><TableHead className="text-right">Kiriman sebelumnya</TableHead></> : null}</TableRow></TableHeader>
                <TableBody>{rows.map((row) => <TableRow key={row.key} className="transition-colors hover:bg-muted/30"><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right tabular-nums">{countFormatter.format(row.currentCount)}</TableCell>{compare ? <><TableCell>{row.previousLabel}</TableCell><TableCell className="text-right tabular-nums">{row.previousCount === null ? "—" : countFormatter.format(row.previousCount)}</TableCell></> : null}</TableRow>)}</TableBody>
              </Table>
            </div>
          </details>
        </CardContent>
      </Card>
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
          <CardHeader className={cardBandClassName}>{heading}{allShipmentsLink}</CardHeader>
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
      <Card className={cn("ios-glass-card border-border/60 shadow-sm flex-1", rows.length > 0 && "pb-0")}>
        <CardHeader className={cardBandClassName}>
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
                <li
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-2 px-(--card-spacing) py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center transition-colors border-l-4",
                    exceptionStatuses.has(row.status)
                      ? "border-l-[var(--danger)] bg-[var(--danger-surface)]/25 hover:bg-[var(--danger-surface)]/35"
                      : action
                        ? "border-l-[var(--warn)] bg-[var(--warn-surface)]/15 hover:bg-[var(--warn-surface)]/25"
                        : "border-l-transparent hover:bg-muted/30",
                  )}
                  data-actionable={action ? "true" : undefined}
                  key={row.shipmentId}
                >
                  <div className="grid min-w-0 gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><ShipmentReferenceLink className="md:min-h-6" publicReference={row.publicReference} /><ShipmentStatusBadge label={status.label} tone={status.tone} /></div>
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
                  {action ? <Button asChild className="w-full max-md:min-h-11 sm:w-auto shrink-0 font-medium text-xs group/btn" size="sm" variant="ghost"><Link href={action.href} className="inline-flex items-center gap-1.5">{action.label}<ArrowRight aria-hidden="true" className="size-3.5 opacity-60 transition-transform group-hover/btn:translate-x-0.5" /></Link></Button> : null}
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
export function PeriodTrendSkeleton() { return <SkeletonCard className={dashboardOverviewSpan} label="Memuat tren periode"><CardHeader className={cardBandClassName}><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></CardHeader><CardContent className="grid gap-4"><Skeleton className="h-60 w-full sm:h-72" /><Skeleton className="h-11 w-full" /></CardContent></SkeletonCard>; }
export function OutcomeSkeleton() { return <SkeletonCard label="Memuat hasil pengiriman"><CardHeader className={cardBandClassName}><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></CardHeader><CardContent><Skeleton className="h-44 w-full" /></CardContent></SkeletonCard>; }
export function CourierRecapSkeleton() { return <SkeletonCard label="Memuat rekap per kurir"><CardHeader className={cardBandClassName}><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></CardHeader><CardContent><Skeleton className="h-44 w-full" /></CardContent></SkeletonCard>; }
export function PeriodSupportSkeleton() { return <SkeletonCard label="Memuat record pendukung Ringkasan"><CardHeader className={cardBandClassName}><Skeleton className="h-5 w-64" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></SkeletonCard>; }
// Mirrors DashboardMetricsRegion's geometry: the three-line heading block beside the freshness
// control, then StatCard anatomy with the xl two-line title and the three-line description the longest admin card wraps to at xl.
export function RecentSkeleton() { return <SkeletonCard className={cn("pb-0", dashboardRecentSpan)} label="Memuat kiriman terbaru dan tindak lanjut"><CardHeader className={cardBandClassName}><Skeleton className="h-5 w-36" /><Skeleton className="h-4 w-48" /></CardHeader><div className="divide-y border-t">{Array.from({ length: RECENT_VISIBLE_ROWS }, (_, index) => <div className="grid gap-1.5 px-(--card-spacing) py-2.5" key={index}><div className="flex justify-between gap-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-20" /></div><Skeleton className="h-4 w-48 max-w-full" /></div>)}</div></SkeletonCard>; }
