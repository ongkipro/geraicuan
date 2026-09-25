import {
  ArrowRight,
  Banknote,
  ChevronDown,
  CircleAlert,
  Package,
  PackageSearch,
  Plus,
  ReceiptText,
  Settings2,
  Wallet,
} from "lucide-react";
import { shipmentDetailHref } from "@/lib/shipment-number";
import Link from "next/link";
import type { ReactNode } from "react";

import { DashboardPeriodChart } from "@/app/app/dashboard-period-chart";
import { HelpHint } from "@/components/cms/help-hint";
import { KpiDelta } from "@/app/app/kpi-delta";
import { DataFreshnessControl } from "@/components/cms/data-freshness-control";
import { DataTableShell } from "@/components/cms/data-table-shell";
import { EmptyState } from "@/components/cms/empty-state";
import { desktopTableClassName, RecordItem, RecordList } from "@/components/cms/record-list";
import { RetryRegionButton } from "@/components/cms/retry-region-button";
import { PaymentStack } from "@/components/cms/shipment-table-cells";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { StatCard } from "@/components/cms/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
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
import { courierDisplayName, courierRecapOrder } from "@/lib/mengantar-couriers";
import { buildTrendBuckets, formatInZone, previousAnalyticsRange, type AnalyticsRange } from "@/lib/analytics-range";
import { DATA_STALE_AFTER_MS, isDataStale } from "@/lib/data-freshness";
import { formatWibDateTime } from "@/lib/label-format";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-method";
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

/** Focus ring for region containers that receive programmatic focus. */
const focusTargetClassName = "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const cardHeadingClassName = cn("text-base font-semibold leading-snug", focusTargetClassName);
/** Plain text link with a trailing arrow, the reference's "Lihat semua kiriman →" style. */
const arrowLinkClassName = "inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-6 [&_svg]:size-4";

/**
 * T-206 reference: the cards below the KPI row sit in two-column rows from lg (Hasil
 * pengiriman | Grafik kiriman, then Kiriman terbaru | Rekap per kurir); also used by the
 * loading state. Both cards of a row stretch to its height; a card left alone in its row
 * (single-day range without a chart, or a refused outlet filter) takes the full width.
 */
export const dashboardOverviewGridClassName = "grid grid-cols-1 gap-4 empty:hidden lg:grid-cols-2 lg:gap-6";
const dashboardCellClassName = "flex min-w-0 flex-col lg:only:col-span-2";
/** A table inside a card has no frame of its own (spec 10 §1.6): header rule and row dividers only. */
const inCardTableShellClassName = "rounded-none border-0 bg-transparent shadow-none";

/** Outcome dot colours: the reference's status dots beside neutral counts (spec 10 §1.9). */
const outcomeDotClassName = {
  danger: "bg-[var(--danger)]",
  neutral: "bg-primary",
  ok: "bg-[var(--ok)]",
  warn: "bg-[var(--warn)]",
} as const;
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
        {role === "TENANT_ADMIN" ? <Button asChild className="max-md:min-h-11" variant="outline"><Link href="/app/pengaturan/outlet">Siapkan outlet</Link></Button> : <span className="text-sm font-medium">Hubungi Tenant Admin untuk melengkapi outlet.</span>}
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
    <Button asChild className="max-sm:flex-1">
      <Link href="/app/pengiriman/baru"><Plus aria-hidden="true" />Buat kiriman</Link>
    </Button>
  );
}

export async function DashboardPeriodSummaryRegion({
  context,
  lifetimeMetricsPromise,
  outletReady,
  promise,
  reportHref,
  supportingLinks,
}: {
  context: DashboardPeriodContext;
  lifetimeMetricsPromise: Promise<TenantDashboardMetrics>;
  outletReady: boolean;
  promise: Promise<TenantDashboardPeriodSummary>;
  /** T-204: Tenant Admin only, like the report page itself; replaces the retired Analitik link. */
  reportHref?: string;
  supportingLinks: DashboardPeriodSupportingLinks;
}) {
  const result = await settle(Promise.all([promise, lifetimeMetricsPromise]));
  if (!result.ok) {
    return <RegionFailure description="Pekerjaan saat ini dan kiriman terbaru tetap tersedia." focusTargetId="dashboard-period-results" title="Ringkasan periode tidak dapat dimuat" />;
  }
  const [summary, lifetimeMetrics] = result.value;
  if (lifetimeMetrics.summary.total === 0) {
    const description = outletReady
      ? "Outlet sudah siap. Buat kiriman pertama untuk mulai melihat ringkasan."
      : "Siapkan outlet, lalu buat kiriman pertama.";
    return <Card className={cn("py-0 [&>div]:border-y-0", focusTargetClassName)} id="dashboard-period-results" tabIndex={-1}><EmptyState action={<Button asChild className="max-md:min-h-11" variant="outline"><Link href="/app/pengiriman/baru">Buat kiriman</Link></Button>} description={description} icon={PackageSearch} title="Belum ada kiriman" /></Card>;
  }

  const current = summary.current;
  const previous = summary.previous;
  const previousLabel = context.range.presetId === "7-hari" ? "7 hari sebelumnya" : "periode sebelumnya";
  const metrics = [
    { current: current.createdCount, href: supportingLinks.created, icon: Package, label: "Kiriman dibuat", previous: previous.createdCount, value: countFormatter.format(current.createdCount) },
    { current: current.codCount, href: supportingLinks.cod, icon: Banknote, label: "Kiriman COD", previous: previous.codCount, value: countFormatter.format(current.codCount) },
    { current: current.nonCodCount, href: supportingLinks["non-cod"], icon: Wallet, label: "Kiriman non-COD", previous: previous.nonCodCount, value: countFormatter.format(current.nonCodCount) },
    { current: current.issuedCount, href: supportingLinks.issued, icon: ReceiptText, label: "Resi terbit", previous: previous.issuedCount, value: countFormatter.format(current.issuedCount) },
  ];

  return (
    <div className={cn("grid gap-4", focusTargetClassName)} id="dashboard-period-results" tabIndex={-1}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
        {metrics.map((metric) => (
          <StatCard
            description={<KpiDelta current={metric.current} previous={metric.previous} previousLabel={previousLabel} unit=" kiriman" />}
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
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <details className="group min-w-0 max-w-2xl text-sm text-muted-foreground">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 [&::-webkit-details-marker]:hidden">Cara menghitung KPI<ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" /></summary>
          <p className="max-w-lg pb-1">Dibandingkan dengan {context.previousPeriodLabel} · {context.timezoneLabel}. COD/non-COD dihitung saat kiriman dibuat; COD mencakup COD Ongkir; resi dihitung saat diterbitkan Mengantar. {`Data dianggap perlu diperbarui setelah ${DATA_STALE_AFTER_MS / 60_000} menit.`}</p>
        </details>
        <div className="flex flex-wrap items-center gap-x-4">
          {reportHref ? <Link className={arrowLinkClassName} href={reportHref}>Laporan pengiriman<ArrowRight aria-hidden="true" /></Link> : null}
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
      <CardHeader>
        <h3 className="text-base font-semibold leading-snug">Rincian kiriman: {supportLabels[kind]}</h3>
        <CardDescription>Menampilkan {countFormatter.format(support.rows.length)} dari {countFormatter.format(support.totalCount)} kiriman · {context.periodLabel} · {context.timezoneLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Spec 10 §9 (T-203): record cards below md; the card is already the surface, so the list drops its own. */}
        <RecordList className="-mx-(--card-spacing) rounded-none border-t shadow-none" label="Daftar rincian kiriman">
          {support.rows.map((row) => {
            const status = SHIPMENT_STATUS_PRESENTATION[row.status];
            return <RecordItem key={row.shipmentId} meta={formatInZone(row.occurredAt, context.range.timezone)} primary={row.outletName} status={<ShipmentStatusBadge label={status.label} tone={status.tone} />} title={<ShipmentReferenceLink className="text-base" publicReference={row.publicReference} />} value={PAYMENT_METHOD_LABELS[row.paymentMethod]} />;
          })}
        </RecordList>
        <DataTableShell className={cn("rounded-none bg-transparent shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_[data-slot=table-container]]:overflow-visible", desktopTableClassName)} label="Tabel rincian kiriman">
          <Table>
            <TableCaption className="sr-only">Menampilkan {countFormatter.format(support.rows.length)} dari {countFormatter.format(support.totalCount)} kiriman pada {context.periodLabel} / {context.timezoneLabel}.</TableCaption>
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
      <section aria-labelledby="dashboard-outcome-heading" className={dashboardCellClassName}>
        <Card className="min-w-0 flex-1 gap-4">
          <CardHeader>{heading}</CardHeader>
          <CardContent><RegionFailure description="Ringkasan periode dan rekap kurir tetap tersedia." focusTargetId="dashboard-outcome-heading" title="Hasil pengiriman tidak dapat dimuat" /></CardContent>
        </Card>
      </section>
    );
  }
  const outcome = result.value;
  // Spec 10 §1.9 (T-203): the counts stay neutral. T-206 reference: a small status dot
  // beside each outcome name is the one colour cue; the word still names the outcome.
  const rows = [
    { key: "delivered", label: SHIPMENT_STATUS_PRESENTATION.DELIVERED.label, tone: "ok" as const, value: outcome.delivered },
    { key: "returned", label: "Retur", tone: "warn" as const, value: outcome.returned },
    { key: "failed", label: SHIPMENT_STATUS_PRESENTATION.FAILED.label, tone: "danger" as const, value: outcome.failed },
    // Without this row the three settled outcomes read as the whole cohort.
    { key: "in-progress", label: "Masih berjalan", tone: "neutral" as const, value: outcome.inProgress },
  ];
  const cohortNote = `Status terkini kiriman yang dibuat pada ${context.periodLabel} (${context.timezoneLabel}). Retur mencakup ${SHIPMENT_STATUS_PRESENTATION.RTS_QUEUED.label.toLowerCase()}, ${SHIPMENT_STATUS_PRESENTATION.RTS_IN_TRANSIT.label.toLowerCase()}, dan ${SHIPMENT_STATUS_PRESENTATION.RTS_RECEIVED.label.toLowerCase()}. COD mengikuti penanda COD saat kiriman dibuat, termasuk COD Ongkir. ${providerDeliveryBasisSentence({
    formattedObservedAt: outcome.basis.lastObservedAt ? formatWibDateTime(outcome.basis.lastObservedAt) : null,
    observationVisible: outcome.basis.observationVisible,
    subject: "Terkirim, retur, dan gagal",
  })}`;

  return (
    <section aria-labelledby="dashboard-outcome-heading" className={dashboardCellClassName}>
      <Card className={cn("min-w-0 flex-1 gap-4", outcome.cohortCount === 0 && "pb-0")}>
        <CardHeader>
          {heading}
          <CardDescription>Periode {context.periodLabel}</CardDescription>
          <CardAction><HelpHint label="Cara membaca hasil pengiriman">{cohortNote}</HelpHint></CardAction>
        </CardHeader>
        {outcome.cohortCount === 0 ? (
          <EmptyState description="Belum ada kiriman yang dibuat pada periode ini." icon={PackageSearch} title="Belum ada hasil pada periode ini" />
        ) : (
          <CardContent className="min-w-0">
            <DataTableShell className={cn(inCardTableShellClassName, "[&_[data-slot=table-container]]:overflow-visible")} label="Tabel hasil pengiriman">
              {/* Four short columns fit a 390px card without scrolling; no min-width. */}
              <Table>
                <TableCaption className="sr-only">Status terkini dari {countFormatter.format(outcome.cohortCount)} kiriman. {cohortNote}</TableCaption>
                <TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-inherit">Hasil</TableHead><TableHead className="text-right">COD</TableHead><TableHead className="text-right">Non-COD</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>{rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="sticky left-0 z-10 bg-inherit font-medium">
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", outcomeDotClassName[row.tone])} data-slot="outcome-dot" />
                        {row.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{countFormatter.format(row.value.codCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{countFormatter.format(row.value.nonCodCount)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{countFormatter.format(row.value.totalCount)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </DataTableShell>
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
      <section aria-labelledby="dashboard-courier-heading" className={dashboardCellClassName}>
        <Card className="min-w-0 flex-1 gap-4">
          <CardHeader>{heading}</CardHeader>
          <CardContent><RegionFailure description="Ringkasan periode dan hasil pengiriman tetap tersedia." focusTargetId="dashboard-courier-heading" title="Rekap per kurir tidak dapat dimuat" /></CardContent>
        </Card>
      </section>
    );
  }
  const recap = result.value;
  const showCost = recap.shippingCostVisible;
  const byCourier = new Map(recap.rows.map((row) => [row.courier, row]));
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

  const usedCouriers = couriers.filter((courier) => (byCourier.get(courier)?.shipmentCount ?? 0) > 0);
  const unusedCouriers = couriers.filter((courier) => !usedCouriers.includes(courier));
  const numeric = "text-right tabular-nums";

  // V-16: one compact table instead of a card per courier; couriers with no shipment in the
  // period stay named in one line under it ("belum dipakai" is an answer the operator came for).
  return (
    <section aria-labelledby="dashboard-courier-heading" className={dashboardCellClassName}>
      <Card className="min-w-0 flex-1 gap-4">
        <CardHeader>
          {heading}
          <CardDescription>{showCost ? "Volume dan biaya kirim per ekspedisi" : "Volume per ekspedisi"} · {context.periodLabel}</CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3">
          {usedCouriers.length > 0 ? (
            <DataTableShell className={inCardTableShellClassName} label="Tabel rekap per kurir">
              <Table className="min-w-sm">
                <TableCaption className="sr-only">Rekap per kurir pada {context.periodLabel}: kiriman, terkirim, dan retur{showCost ? ", serta biaya kirim" : ""}.</TableCaption>
                <TableHeader><TableRow><TableHead className="sticky left-0 z-10 bg-inherit">Kurir</TableHead><TableHead className={numeric}>Kiriman</TableHead><TableHead className={numeric}>Terkirim</TableHead><TableHead className={numeric}>Retur</TableHead>{showCost ? <TableHead className={numeric}>Biaya kirim</TableHead> : null}</TableRow></TableHeader>
                <TableBody>{usedCouriers.map((courier) => {
                  const row = byCourier.get(courier);
                  return (
                    <TableRow key={courier}>
                      <TableCell className="sticky left-0 z-10 bg-inherit font-medium">{courierDisplayName(courier)}</TableCell>
                      <TableCell className={numeric}>{countFormatter.format(row?.shipmentCount ?? 0)}</TableCell>
                      <TableCell className={numeric}>{countFormatter.format(row?.deliveredCount ?? 0)}</TableCell>
                      <TableCell className={numeric}>{countFormatter.format(row?.returnedCount ?? 0)}</TableCell>
                      {showCost ? <TableCell className={cn(numeric, "font-medium")}>{idrFormatter.format(row?.shippingCostIdr ?? 0)}</TableCell> : null}
                    </TableRow>
                  );
                })}</TableBody>
                {/* T-206 reference: the total row reads on the card (no grey band); the shipping-cost total is the one blue figure. */}
                <TableFooter className="bg-card font-semibold"><TableRow className="hover:bg-card"><TableCell className="sticky left-0 z-10 bg-inherit">Total</TableCell><TableCell className={numeric}>{countFormatter.format(totals.shipmentCount)}</TableCell><TableCell className={numeric}>{countFormatter.format(totals.deliveredCount)}</TableCell><TableCell className={numeric}>{countFormatter.format(totals.returnedCount)}</TableCell>{showCost ? <TableCell className={cn(numeric, "text-primary")} data-slot="courier-cost-total">{idrFormatter.format(totals.shippingCostIdr)}</TableCell> : null}</TableRow></TableFooter>
              </Table>
            </DataTableShell>
          ) : <p className="text-sm text-muted-foreground">Belum ada kiriman pada periode ini.</p>}
          {unusedCouriers.length > 0 ? <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Belum dipakai:</span> {unusedCouriers.map(courierDisplayName).join(", ")}</p> : null}
        </CardContent>
      </Card>
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
      <section aria-labelledby="dashboard-trend-heading" className={dashboardCellClassName}>
        <Card className="min-w-0 flex-1 gap-4">
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
    <section aria-labelledby="dashboard-trend-heading" className={dashboardCellClassName}>
      <Card className="min-w-0 flex-1 gap-4">
        <CardHeader>
          {heading}
          <CardDescription>{compare ? `Kiriman per hari, dibanding ${context.previousPeriodLabel}` : `Kiriman ${context.periodLabel}`}</CardDescription>
        </CardHeader>
        {/* A flex column stretches children to the card width (no min-content growth past the card edge at 390/768px, the earlier grid-track bug); flex-1 lets the chart take the row height the recent card sets from lg. */}
        <CardContent className="flex min-w-0 flex-1 flex-col gap-4 *:min-w-0">
          {demo ? <Alert><AlertTitle>Data demo</AlertTitle><AlertDescription>Grafik ini memakai data contoh. Ringkasan dan daftar kiriman tetap memakai data tersimpan.</AlertDescription></Alert> : null}
          <DashboardPeriodChart compare={compare} data={rows} sevenDays={context.range.presetId === "7-hari"} />
          <details className="group min-w-0">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 [&::-webkit-details-marker]:hidden">
              <span>Lihat tabel data tren</span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div aria-label="Tabel perbandingan kiriman" className="min-w-0 overflow-x-auto pt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_[data-slot=table-container]]:overflow-visible" role="region" tabIndex={0}>
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
  // T-206 reference: the way to the full list closes the card as a plain arrow link.
  const allShipmentsLink = <div className="border-t px-(--card-spacing) py-2 text-right"><Link className={arrowLinkClassName} href="/app/pengiriman">Lihat semua kiriman<ArrowRight aria-hidden="true" /></Link></div>;
  if (!actionResult.ok && !recentResult.ok) {
    return (
      <section aria-labelledby="recent-heading" className={dashboardCellClassName}>
        <Card className="flex-1 gap-4 pb-0">
          <CardHeader>{heading}</CardHeader>
          <CardContent><RegionFailure description="Ringkasan periode dan status operasional tetap tersedia bila berhasil dimuat." focusTargetId="recent-heading" title="Kiriman terbaru dan tindak lanjut tidak dapat dimuat" /></CardContent>
          {allShipmentsLink}
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
    <section aria-labelledby="recent-heading" className={dashboardCellClassName}>
      <Card className="flex-1 gap-4 pb-0">
        <CardHeader>
          {heading}
          <CardDescription>{rows.length > 0 ? "Yang perlu ditindaklanjuti tampil lebih dulu." : "Tidak ada kiriman yang perlu ditindaklanjuti saat ini."}</CardDescription>
        </CardHeader>
        {partialFailure ? <CardContent><RegionFailure description="Daftar di bawah mungkin belum lengkap. Coba muat ulang." focusTargetId="recent-heading" title={actionResult.ok ? "Sebagian kiriman terbaru tidak dapat dimuat" : "Tindak lanjut tidak dapat dimuat"} /></CardContent> : null}
        {rows.length > 0 ? (
          <ul aria-label="Daftar kiriman terbaru dan tindak lanjut" className="flex-1 divide-y border-t" role="list">
            {rows.map((row) => {
              const status = SHIPMENT_STATUS_PRESENTATION[row.status];
              const action = nextAction(row, role);
              return (
                // T-206 reference record row at every width: reference + status → recipient ·
                // area → AWB and time, with the one next-step link at the end of that line.
                <li
                  className="grid grid-cols-[minmax(0,1fr)] gap-1 px-(--card-spacing) py-3"
                  data-actionable={action ? "true" : undefined}
                  key={row.shipmentId}
                >
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1"><ShipmentReferenceLink className="text-base md:min-h-6" publicReference={row.publicReference} /><ShipmentStatusBadge label={status.label} tone={status.tone} /></div>
                  <p className="min-w-0 text-sm font-medium wrap-anywhere">{row.recipientName} · {row.destinationAreaLabel}{multipleOutlets ? ` · ${row.outletName}` : ""}</p>
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <p className="min-w-0">
                      {/* The AWB is what staff copy, so it wraps in full rather than truncating. */}
                      {row.awb ? <><span className="min-w-0 max-w-full break-all">AWB <span className="font-mono text-foreground">{row.awb}</span></span>{" · "}</> : null}
                      <time className="whitespace-nowrap tabular-nums" dateTime={row.updatedAt.toISOString()} title={formatWibDateTime(row.updatedAt)}>{recentTimeFormatter.format(row.updatedAt)}<span className="sr-only"> WIB</span></time>
                    </p>
                    {action ? <Link className={cn(arrowLinkClassName, "font-medium")} href={action.href}>{action.label}<ArrowRight aria-hidden="true" /></Link> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        {allShipmentsLink}
      </Card>
    </section>
  );
}

function SkeletonCard({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <Card aria-busy={label ? "true" : undefined} aria-label={label} className={className}>{children}</Card>;
}

export function ReadinessSkeleton() { return <Skeleton aria-label="Memuat kesiapan outlet" className="h-20 w-full" />; }
export function PeriodSummarySkeleton() { return <div aria-busy="true" aria-label="Memuat ringkasan periode" className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">{Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index}><CardHeader className="flex flex-row items-center justify-between"><Skeleton className="h-4 w-28" /><Skeleton className="size-4" /></CardHeader><CardContent className="grid gap-2"><Skeleton className="h-8 w-20" /><Skeleton className="h-3 w-36" /></CardContent></SkeletonCard>)}</div>; }
export function PeriodTrendSkeleton() { return <SkeletonCard label="Memuat tren periode"><CardHeader><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></CardHeader><CardContent className="grid gap-4"><Skeleton className="h-60 w-full sm:h-72" /><Skeleton className="h-11 w-full" /></CardContent></SkeletonCard>; }
export function OutcomeSkeleton() { return <SkeletonCard label="Memuat hasil pengiriman"><CardHeader><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></CardHeader><CardContent><Skeleton className="h-44 w-full" /></CardContent></SkeletonCard>; }
export function CourierRecapSkeleton() { return <SkeletonCard label="Memuat rekap per kurir"><CardHeader><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></CardHeader><CardContent><Skeleton className="h-44 w-full" /></CardContent></SkeletonCard>; }
export function PeriodSupportSkeleton() { return <SkeletonCard label="Memuat record pendukung Ringkasan"><CardHeader><Skeleton className="h-5 w-64" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></SkeletonCard>; }
// Mirrors DashboardMetricsRegion's geometry: the three-line heading block beside the freshness
// control, then StatCard anatomy with the xl two-line title and the three-line description the longest admin card wraps to at xl.
export function RecentSkeleton() { return <SkeletonCard className="pb-0" label="Memuat kiriman terbaru dan tindak lanjut"><CardHeader><Skeleton className="h-5 w-36" /><Skeleton className="h-4 w-48" /></CardHeader><div className="divide-y border-t">{Array.from({ length: RECENT_VISIBLE_ROWS }, (_, index) => <div className="grid gap-1.5 px-(--card-spacing) py-3" key={index}><div className="flex justify-between gap-3"><Skeleton className="h-6 w-32" /><Skeleton className="h-6 w-24" /></div><Skeleton className="h-5 w-48 max-w-full" /><Skeleton className="h-5 w-24" /></div>)}</div></SkeletonCard>; }
