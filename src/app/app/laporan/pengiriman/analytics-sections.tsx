import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { reportTrendTotals, type ReportAnalyticsView } from "@/app/app/laporan/pengiriman/report-logic";
import { ReportTrendChart } from "@/app/app/laporan/pengiriman/report-trend-chart";
import { DataCard } from "@/components/app/data-card";
import { HelpHint } from "@/components/app/help-hint";
import { formatIdr } from "@/components/app/money";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ShipmentReportLifecycleTotal } from "@/db/shipment-report-repository";
import { shipmentStatuses } from "@/lib/domain-enums";
import { SHIPMENT_STATUS_PRESENTATION, type ShipmentStatus } from "@/lib/shipment-queue";
import { deliveredRate, formatRate, lowVolumeNote, returnRate, type RegionTotal, type RouteTotal, UNKNOWN_REGION_KEY } from "@/lib/shipment-report-analytics";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("id-ID");
const numeric = "text-right tabular-nums whitespace-nowrap";
/** Numeric columns share one width, so the wilayah and route tables line up (T-254). */
const numericColumn = cn(numeric, "w-24 max-lg:w-20");
/** A table inside a card: flush with the card padding; rows are not links, so they do not highlight. */
const inCardTable = "[&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0 [&_tr]:hover:bg-transparent";
const disclosureSummary = "inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground md:min-h-6 [&::-webkit-details-marker]:hidden";
const chevron = "size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none";
const REGION_TOP = 10;

/**
 * The "?" of a section header (T-254). The 40 px button is pulled into the title's line box, so
 * it centres on the title and does not add a row under it.
 */
export function SectionHelp({ children, label }: { children: ReactNode; label: string }) {
  return <span className="-my-2 flex"><HelpHint label={label}>{children}</HelpHint></span>;
}

/** Spec 19 M-0: a muted "Volume rendah (n = N)" under a group of fewer than 10 shipments; its rates stay. */
export function LowVolumeNote({ shipmentCount }: { shipmentCount: number }) {
  const note = lowVolumeNote({ shipmentCount });
  return note ? <span className="block text-xs whitespace-nowrap text-muted-foreground" data-low-volume="">{note}</span> : null;
}

function share(part: number, whole: number) {
  return formatRate(whole === 0 ? null : (part / whole) * 100);
}

/**
 * Spec 19 RPT-SHP-OUTCOME-COMPOSITION: the four disjoint outcome buckets of RPT-SHP-ROWS, in the
 * Dasbor's order and colours (SHP-OUTCOME-*). The three outcome predicates are disjoint status
 * sets and Masih berjalan (RPT-SHP-IN-PROGRESS) is the remainder, so the buckets sum to the total
 * exactly and need no "Lainnya"; tests/shipment-report binds that against the status counts.
 */
export function reportOutcomeComposition(kpis: ReportAnalyticsView["kpis"]) {
  const counts: Record<OutcomeKey, number> = {
    delivered: kpis.deliveredCount,
    failed: kpis.failedCount,
    "in-progress": kpis.inProgressCount,
    returned: kpis.returnedCount,
  };
  return OUTCOMES.map((outcome) => ({ ...outcome, count: counts[outcome.key] }));
}

type OutcomeKey = "delivered" | "returned" | "failed" | "in-progress";
const OUTCOMES: readonly { bar: string; key: OutcomeKey; label: string }[] = [
  { bar: "bg-ok", key: "delivered", label: "Terkirim" },
  { bar: "bg-warn", key: "returned", label: "Retur" },
  { bar: "bg-danger", key: "failed", label: "Gagal" },
  { bar: "bg-primary", key: "in-progress", label: "Masih berjalan" },
];

/**
 * The outcome bucket of each status: RPT-SHP-DELIVERED, -RETURNED (the RTS statuses, never
 * PROBLEM), -FAILED (gagal + dibatalkan) and -IN-PROGRESS (the rest). A `Record` over every status,
 * so a new status fails the type check until it is placed.
 */
// Named bucket constants rather than string literals: a status key beside a lowercase string
// reads as a label map to tests/shipment-status-copy, and this is a bucket map, not copy.
const DELIVERED_OUTCOME: OutcomeKey = "delivered";
const RETURNED_OUTCOME: OutcomeKey = "returned";
const FAILED_OUTCOME: OutcomeKey = "failed";
const IN_PROGRESS: OutcomeKey = "in-progress";

const OUTCOME_OF_STATUS: Record<ShipmentStatus, OutcomeKey> = {
  AWAITING_UPSTREAM_PAYMENT: IN_PROGRESS,
  CANCELLED: FAILED_OUTCOME,
  DELIVERED: DELIVERED_OUTCOME,
  DRAFT: IN_PROGRESS,
  ESTIMATED: IN_PROGRESS,
  FAILED: FAILED_OUTCOME,
  IN_TRANSIT: IN_PROGRESS,
  ISSUED: IN_PROGRESS,
  PROBLEM: IN_PROGRESS,
  RTS_IN_TRANSIT: RETURNED_OUTCOME,
  RTS_QUEUED: RETURNED_OUTCOME,
  RTS_RECEIVED: RETURNED_OUTCOME,
  SUBMISSION_QUEUED: IN_PROGRESS,
  SUBMISSION_UNKNOWN: IN_PROGRESS,
};

/**
 * Spec 19 RPT-SHP-LIFECYCLE-GROUP (T-254): RPT-SHP-LIFECYCLE-COUNT folded into the Ringkasan's four
 * outcome buckets, each with its statuses in lifecycle order. A bucket's count is the sum of its
 * status counts, which equals the matching Ringkasan figure (tests/shipment-report binds that).
 */
export function reportStatusGroups(totals: readonly ShipmentReportLifecycleTotal[]) {
  const counts = new Map(totals.map((row) => [row.status as ShipmentStatus, row.shipmentCount]));
  return OUTCOMES.map((outcome) => {
    const statuses = shipmentStatuses
      .filter((status) => OUTCOME_OF_STATUS[status] === outcome.key && (counts.get(status) ?? 0) > 0)
      .map((status) => ({ count: counts.get(status) ?? 0, status }));
    return { ...outcome, count: statuses.reduce((sum, row) => sum + row.count, 0), statuses };
  });
}

const statCell = "flex min-w-0 flex-col gap-1 bg-card px-3 py-2.5 @xl:px-4 @xl:py-3";
const statLabel = "flex items-center gap-1.5 text-xs font-medium text-muted-foreground";
const statValue = "text-xl leading-none font-semibold tabular-nums text-foreground";
const statNote = "text-xs tabular-nums text-muted-foreground";
/** A money cell: label and amount on one line in a narrow panel, stacked from a 28rem panel. */
const moneyCell = "flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-card px-4 py-2.5 @md:flex-col @md:py-3 @md:flex-nowrap @md:items-start @md:justify-start";

/**
 * Spec 10 §4.6b report summary (T-251, owner 2026-09-26: "ini card sepertinya perlu di rapikan
 * juga"): two panels instead of six cards, side by side from a 64rem summary (1440 px viewport;
 * at 1280 px the volume row would be 632 px and wrap its labels), stacked below. Volume is a §4.6 stat strip (not links, so no hover or
 * selected state) over one composition bar; the dot before each outcome label is the bar's
 * legend. Uang COD holds Nilai COD (a liability, never revenue) and Estimasi cair. Every figure
 * keeps its spec 19 RPT-SHP-* ID and sits in a <dd> after its <dt> label.
 */
export function ReportKpiStrip({ kpis }: { kpis: ReportAnalyticsView["kpis"] }) {
  const finished = kpis.deliveredCount + kpis.returnedCount;
  const composition = reportOutcomeComposition(kpis);
  const caption: Record<string, string | undefined> = {
    delivered: `${share(kpis.deliveredCount, kpis.shipmentCount)} dari ${number.format(kpis.shipmentCount)} kiriman`,
    returned: `${formatRate(returnRate(kpis))} dari ${number.format(finished)} selesai`,
  };
  return (
    <section aria-label="Ringkasan laporan" className="@container/summary">
      {/* A container query cannot style its own container, so the grid sits one level in. */}
      <div className="grid gap-3 sm:gap-6 @5xl/summary:grid-cols-3">
        <div aria-label="Volume kiriman" className="@container flex flex-col overflow-hidden rounded-2xl bg-card shadow-card @5xl/summary:col-span-2" role="group">
          <dl className="grid flex-1 grid-cols-3 gap-px bg-border @xl:flex">
            <div className={cn(statCell, "@xl:flex-auto")} data-kpi="total">
              <dt className={statLabel}>Total kiriman</dt>
              <dd className={statValue}>{number.format(kpis.shipmentCount)}</dd>
            </div>
            {composition.map((part, index) => (
              <div className={cn(statCell, "@xl:flex-auto", index === composition.length - 1 && "col-span-2")} data-kpi={part.key} key={part.key}>
                <dt className={statLabel}>
                  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", part.bar)} />
                  {part.label}
                </dt>
                <dd className={statValue}>{number.format(part.count)}</dd>
                {caption[part.key] ? <dd className={statNote}>{caption[part.key]}</dd> : null}
              </div>
            ))}
          </dl>
          {kpis.shipmentCount > 0 ? (
            <div aria-hidden="true" className="flex h-1.5 gap-0.5" data-slot="kpi-composition">
              {composition.filter((part) => part.count > 0).map((part) => (
                <span
                  className={cn("block h-full", part.bar)}
                  data-count={part.count}
                  data-segment={part.key}
                  key={part.key}
                  style={{ width: `${(part.count / kpis.shipmentCount) * 100}%` }}
                />
              ))}
            </div>
          ) : null}
          <p className="sr-only">Terkirim, retur, gagal dan masih berjalan berjumlah {number.format(kpis.shipmentCount)} kiriman.</p>
        </div>
        <div aria-label="Uang COD" className="@container overflow-hidden rounded-2xl bg-card shadow-card" role="group">
          <dl className="grid h-full gap-px bg-border @md:grid-cols-2">
            <div className={moneyCell} data-kpi="cod-value">
              <dt className={statLabel}>Nilai COD</dt>
              <dd className={cn(statValue, "whitespace-nowrap")}>{formatIdr(kpis.codValueIdr)}</dd>
              <dd className={cn(statNote, "basis-full")}>Ditagih kurir dari {number.format(kpis.codOrderCount)} kiriman COD</dd>
            </div>
            <div className={moneyCell} data-kpi="cod-disbursement-estimate">
              <dt className={statLabel}>
                Estimasi cair
                <Badge className="h-5 px-2" variant="secondary">Estimasi</Badge>
              </dt>
              <dd className={cn(statValue, "whitespace-nowrap")}>{formatIdr(kpis.codDisbursementEstimateIdr)}</dd>
              <dd className={cn(statNote, "basis-full")}>Perkiraan, bukan dana diterima</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}


export function ReportKpiHelp() {
  return (
    <SectionHelp label="Cara membaca ringkasan laporan">
      <p>Status terkini kiriman yang dibuat pada periode ini, sama dengan Dasbor. Retur mencakup antre retur, retur dalam perjalanan dan retur diterima; persentasenya dihitung dari kiriman yang selesai (terkirim + retur). Gagal mencakup kiriman gagal dan dibatalkan. Masih berjalan adalah sisanya: belum terkirim, retur atau gagal.</p>
      <p>Garis warna di bawah angka membagi total kiriman menjadi terkirim, retur, gagal dan masih berjalan.</p>
      <p>Nilai COD adalah jumlah yang ditagih kurir untuk kiriman COD yang resinya sudah terbit. Estimasi cair = nilai COD dikurangi ongkir dan biaya COD Mengantar.</p>
    </SectionHelp>
  );
}

/** A legend entry that also carries the series' period total (spec 19 RPT-SHP-TREND-TOTALS). */
function LegendTotal({ children, label, swatch }: { children: ReactNode; label: string; swatch: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden="true" className={cn("w-4 self-center", swatch)} />
        {label}
      </dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

export function ReportTrendCard({ granularity, trend }: Pick<ReportAnalyticsView, "granularity" | "trend">) {
  const unit = granularity === "harian" ? "hari" : "bulan";
  const totals = reportTrendTotals(trend);
  const legend = "flex flex-wrap items-baseline gap-x-6 gap-y-1";
  return (
    <DataCard
      action={(
        <SectionHelp label="Penjelasan tren">
          <p>Kiriman dikelompokkan per {unit} menurut waktu dibuat (WIB). COD mengikuti penanda COD saat kiriman dibuat, termasuk COD Ongkir.</p>
          <p>Nilai COD per {unit} hanya menghitung kiriman COD yang resinya sudah terbit.</p>
          <p>Angka di samping keterangan garis adalah total periode ini.</p>
        </SectionHelp>
      )}
      title={granularity === "harian" ? "Tren harian" : "Tren bulanan"}
    >
      <Tabs defaultValue="kiriman">
        <TabsList aria-label="Tampilan tren">
          <TabsTrigger value="kiriman">Jumlah kiriman</TabsTrigger>
          <TabsTrigger value="nilai">Nilai COD per {unit}</TabsTrigger>
        </TabsList>
        <TabsContent className="grid gap-3" value="kiriman">
          <dl aria-label="Total periode ini" className={legend}>
            <LegendTotal label="COD" swatch="h-0.5 bg-chart-1">{number.format(totals.cod)} kiriman</LegendTotal>
            <LegendTotal label="Non-COD" swatch="border-t-2 border-dashed border-chart-2">{number.format(totals.nonCod)} kiriman</LegendTotal>
          </dl>
          <ReportTrendChart data={trend} mode="count" />
        </TabsContent>
        <TabsContent className="grid gap-3" value="nilai">
          <dl aria-label="Total periode ini" className={legend}>
            <LegendTotal label="Nilai COD" swatch="h-0.5 bg-chart-1">{formatIdr(totals.codValue)}</LegendTotal>
          </dl>
          <ReportTrendChart data={trend} mode="value" />
        </TabsContent>
      </Tabs>
      <details className="group">
        <summary className={disclosureSummary}>
          Lihat tabel data tren
          <ChevronDown aria-hidden="true" className={chevron} />
        </summary>
        <Table aria-label="Data tren" className={cn(inCardTable, "mt-2 text-xs max-md:[&_td]:px-1.5 max-md:[&_th]:px-1.5 max-md:[&_th]:whitespace-normal")}>
          <TableCaption className="sr-only">Kiriman COD, non-COD dan nilai COD per {unit}, terbaru di atas.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{granularity === "harian" ? "Tanggal" : "Bulan"} (WIB)</TableHead>
              <TableHead className={numeric}>COD</TableHead>
              <TableHead className={numeric}>Non-COD</TableHead>
              <TableHead className={numeric}>Nilai COD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...trend].reverse().map((point) => (
              <TableRow className="h-auto" key={point.label}>
                <TableCell className="h-auto py-1.5">{point.label}</TableCell>
                <TableCell className={cn(numeric, "h-auto py-1.5")}>{number.format(point.cod)}</TableCell>
                <TableCell className={cn(numeric, "h-auto py-1.5")}>{number.format(point.nonCod)}</TableCell>
                <TableCell className={cn(numeric, "h-auto py-1.5")}>{formatIdr(point.codValue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </DataCard>
  );
}

/** A share bar: 8 px track, rounded fill from zero (M-3), tokens only. */
function ShareBar({ className, value }: { className: string; value: number }) {
  return (
    <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-muted">
      <span className={cn("block h-full rounded-full", className)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </span>
  );
}

function CountShare({ count, total }: { count: number; total: number }) {
  return (
    <span className="shrink-0 text-sm tabular-nums">
      <span className="font-semibold">{number.format(count)}</span>
      <span className="text-muted-foreground"> · {share(count, total)}</span>
    </span>
  );
}

/**
 * Spec 19 RPT-SHP-LIFECYCLE-GROUP (T-254): the lifecycle counts grouped into the Ringkasan's
 * outcome buckets (same order and colours), each with its share bar; a bucket holding more than
 * one status opens to the statuses with their badge, count and share. Four rows instead of up to
 * fourteen, so the card sits level with Tren harian.
 */
export function StatusDistribution({ total, totals }: { total: number; totals: ShipmentReportLifecycleTotal[] }) {
  const groups = reportStatusGroups(totals).filter((group) => group.count > 0);
  return (
    <DataCard
      action={(
        <SectionHelp label="Penjelasan distribusi status">
          <p>Status terkini kiriman pada periode ini, dikelompokkan seperti Ringkasan: Terkirim, Retur, Gagal dan Masih berjalan. Buka kelompok untuk melihat statusnya.</p>
          <p>Persen dihitung dari semua kiriman pada periode ini.</p>
        </SectionHelp>
      )}
      title="Distribusi status"
    >
      <ul aria-label="Distribusi status" className="grid divide-y">
        {groups.map((group) => {
          const head = (
            <span className="grid w-full gap-2">
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", group.bar)} />
                  {group.label}
                  {group.statuses.length > 1 ? <ChevronDown aria-hidden="true" className={cn(chevron, "text-muted-foreground")} /> : null}
                </span>
                <CountShare count={group.count} total={total} />
              </span>
              <ShareBar className={group.bar} value={group.count / Math.max(1, total)} />
            </span>
          );
          return (
            <li className="py-3 first:pt-0 last:pb-0" data-outcome={group.key} key={group.key}>
              {group.statuses.length > 1 ? (
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center md:min-h-10 [&::-webkit-details-marker]:hidden">
                    {head}
                    <span className="sr-only">, {group.statuses.length} status</span>
                  </summary>
                  <ul aria-label={`Status ${group.label}`} className="mt-3 grid gap-2 border-l-2 pl-3">
                    {group.statuses.map((row) => (
                      <li className="flex items-center justify-between gap-3" data-status={row.status} key={row.status}>
                        <ShipmentStatusBadge status={row.status} />
                        <CountShare count={row.count} total={total} />
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <div className="flex min-h-10 items-center" data-status={group.statuses[0]?.status}>{head}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="sr-only">
        {groups.flatMap((group) => group.statuses).map((row) => `${SHIPMENT_STATUS_PRESENTATION[row.status].label} ${number.format(row.count)}`).join("; ")}.
      </p>
    </DataCard>
  );
}

/**
 * Wilayah and route rows (T-254): a table from `md` (numeric columns one shared width, the volume
 * bar under the name instead of a separate chart), a record list below it. `max` scales the bars.
 */
function RegionRows({ label, max, rows }: { label: string; max: number; rows: RegionTotal[] }) {
  return (
    <>
      <ul aria-label={label} className="divide-y md:hidden">
        {rows.map((row) => (
          <li className="grid gap-1.5 py-3 first:pt-0 last:pb-0" key={row.key}>
            <div className="flex items-baseline justify-between gap-3">
              <RegionName row={row} />
              <span className="shrink-0 font-semibold tabular-nums">{number.format(row.shipmentCount)}</span>
            </div>
            {row.key === UNKNOWN_REGION_KEY ? null : <ShareBar className="bg-chart-1" value={row.shipmentCount / max} />}
            <p className="text-xs tabular-nums text-muted-foreground">
              Terkirim {number.format(row.deliveredCount)} · Retur {number.format(row.returnedCount)} · % retur {formatRate(returnRate(row))}
            </p>
            <LowVolumeNote shipmentCount={row.shipmentCount} />
          </li>
        ))}
      </ul>
      <div className="max-md:hidden">
        <Table aria-label={label} className={cn(inCardTable, "table-fixed")}>
          <TableHeader>
            <TableRow>
              <TableHead>Wilayah</TableHead>
              <TableHead className={numericColumn}>Kiriman</TableHead>
              <TableHead className={numericColumn}>Terkirim</TableHead>
              <TableHead className={numericColumn}>Retur</TableHead>
              <TableHead className={numericColumn}>% retur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="whitespace-normal">
                  <span className="grid gap-1.5">
                    <RegionName row={row} />
                    {row.key === UNKNOWN_REGION_KEY ? null : <span className="max-w-md"><ShareBar className="bg-chart-1" value={row.shipmentCount / max} /></span>}
                    <LowVolumeNote shipmentCount={row.shipmentCount} />
                  </span>
                </TableCell>
                <TableCell className={cn(numeric, "font-semibold")}>{number.format(row.shipmentCount)}</TableCell>
                <TableCell className={numeric}>{number.format(row.deliveredCount)}</TableCell>
                <TableCell className={numeric}>{number.format(row.returnedCount)}</TableCell>
                <TableCell className={numeric}>{formatRate(returnRate(row))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function RegionName({ row }: { row: RegionTotal }) {
  return (
    <span className="min-w-0">
      <span className={cn("font-medium", row.key === UNKNOWN_REGION_KEY && "text-muted-foreground")}>{row.name}</span>
      {row.province ? <span className="text-xs text-muted-foreground"> · {row.province}</span> : null}
    </span>
  );
}

function RegionPanel({ noun, rows }: { noun: string; rows: RegionTotal[] }) {
  const top = rows.slice(0, REGION_TOP);
  const rest = rows.slice(REGION_TOP);
  const max = Math.max(1, ...rows.filter((row) => row.key !== UNKNOWN_REGION_KEY).map((row) => row.shipmentCount));
  return (
    <div className="grid gap-3">
      <RegionRows label={`Kiriman per ${noun}`} max={max} rows={top} />
      {rest.length > 0 ? (
        <details className="group">
          <summary className={disclosureSummary}>
            Tampilkan semua ({number.format(rows.length)} {noun})
            <ChevronDown aria-hidden="true" className={chevron} />
          </summary>
          {/* A long remainder scrolls inside its own box with the header pinned (from md). */}
          <div className="mt-2 md:[&_[data-slot=table-container]]:max-h-96 md:[&_thead_th]:sticky md:[&_thead_th]:top-0 md:[&_thead_th]:z-10 md:[&_thead_th]:bg-card">
            <RegionRows label={`Kiriman per ${noun}, lainnya`} max={max} rows={rest} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** Spec 19 RPT-SHP-REGION-*: per province and per city of the stored destination area label. */
export function RegionCard({ regions }: { regions: ReportAnalyticsView["regions"] }) {
  return (
    <DataCard
      action={(
        <SectionHelp label="Penjelasan wilayah tujuan">
          <p>Wilayah dibaca dari area penerima kiriman. Area yang tidak memuat kota dan provinsi masuk ke &quot;Wilayah tidak dikenal&quot;.</p>
          <p>Panjang garis mengikuti jumlah kiriman. % retur = retur dibagi kiriman yang selesai (terkirim + retur) di wilayah itu.</p>
        </SectionHelp>
      )}
      title="Wilayah tujuan"
    >
      <Tabs defaultValue="provinsi">
        <TabsList aria-label="Kelompok wilayah">
          <TabsTrigger value="provinsi">Per provinsi</TabsTrigger>
          <TabsTrigger value="kota">Per kota</TabsTrigger>
        </TabsList>
        <TabsContent value="provinsi"><RegionPanel noun="provinsi" rows={regions.provinces} /></TabsContent>
        <TabsContent value="kota"><RegionPanel noun="kota" rows={regions.cities} /></TabsContent>
      </Tabs>
    </DataCard>
  );
}

function RouteName({ route }: { route: RouteTotal }) {
  return (
    <span className="min-w-0">
      <span className="text-muted-foreground">{route.outletName}</span>
      <span aria-hidden="true" className="text-muted-foreground"> → </span><span className="sr-only"> ke </span>
      <span className="font-medium">{route.city}</span>
    </span>
  );
}

/** Spec 19 RPT-SHP-ROUTE-COUNT: the five busiest outlet → destination city pairs. */
export function RoutesCard({ routes }: { routes: ReportAnalyticsView["routes"] }) {
  return (
    <DataCard
      action={(
        <SectionHelp label="Penjelasan rute teratas">
          <p>Lima pasangan outlet → kota tujuan dengan kiriman terbanyak. Kiriman ke &quot;Wilayah tidak dikenal&quot; tidak dihitung, jadi jumlahnya tidak selalu sama dengan total.</p>
          <p>% terkirim = terkirim dibagi kiriman rute itu. % retur = retur dibagi kiriman yang selesai (terkirim + retur).</p>
        </SectionHelp>
      )}
      title="Rute teratas"
    >
      {routes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada rute dengan wilayah tujuan yang dikenal.</p>
      ) : (
        <>
          <ul aria-label="Rute teratas" className="divide-y md:hidden">
            {routes.map((route) => (
              <li className="grid gap-1 py-3 first:pt-0 last:pb-0" key={route.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <RouteName route={route} />
                  <span className="shrink-0 font-semibold tabular-nums">{number.format(route.shipmentCount)}</span>
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  Terkirim {formatRate(deliveredRate(route))} · Retur {formatRate(returnRate(route))}
                </p>
                <LowVolumeNote shipmentCount={route.shipmentCount} />
              </li>
            ))}
          </ul>
          <div className="max-md:hidden">
            <Table aria-label="Rute teratas" className={cn(inCardTable, "table-fixed")}>
              <TableHeader>
                <TableRow>
                  <TableHead>Rute</TableHead>
                  <TableHead className={numericColumn}>Kiriman</TableHead>
                  <TableHead className={numericColumn}>% terkirim</TableHead>
                  <TableHead className={numericColumn}>% retur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((route) => (
                  <TableRow key={route.key}>
                    <TableCell className="whitespace-normal">
                      <RouteName route={route} />
                      <LowVolumeNote shipmentCount={route.shipmentCount} />
                    </TableCell>
                    <TableCell className={cn(numeric, "font-semibold")}>{number.format(route.shipmentCount)}</TableCell>
                    <TableCell className={numeric}>{formatRate(deliveredRate(route))}</TableCell>
                    <TableCell className={numeric}>{formatRate(returnRate(route))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </DataCard>
  );
}
