import { Banknote, ChevronDown, Package, PackageCheck, Truck, Undo2, Wallet } from "lucide-react";

import { RegionBarChart } from "@/app/app/laporan/pengiriman/region-bar-chart";
import type { ReportAnalyticsView } from "@/app/app/laporan/pengiriman/report-logic";
import { ReportTrendChart } from "@/app/app/laporan/pengiriman/report-trend-chart";
import { DataCard } from "@/components/app/data-card";
import { HelpHint } from "@/components/app/help-hint";
import { KpiCard } from "@/components/app/kpi-card";
import { formatIdr } from "@/components/app/money";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ShipmentReportLifecycleTotal } from "@/db/shipment-report-repository";
import { shipmentStatuses } from "@/lib/domain-enums";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import { deliveredRate, formatRate, returnRate, type RegionTotal, UNKNOWN_REGION_KEY } from "@/lib/shipment-report-analytics";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("id-ID");
const numeric = "text-right tabular-nums whitespace-nowrap";
/** A table inside a card: flush with the card padding; rows are not links, so they do not highlight. */
const inCardTable = cn(
  "[&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0 [&_tr]:hover:bg-transparent",
  "max-md:[&_td]:px-1.5 max-md:[&_td]:whitespace-normal max-md:[&_th]:px-1.5 max-md:[&_th]:whitespace-normal",
);
const disclosureSummary = "inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground md:min-h-6 [&::-webkit-details-marker]:hidden";
const REGION_TOP = 10;

function share(part: number, whole: number) {
  return formatRate(whole === 0 ? null : (part / whole) * 100);
}

/** Spec 19 RPT-SHP-KPI-*: six figures over the filtered cohort, each saying what it counts. */
export function ReportKpiStrip({ kpis }: { kpis: ReportAnalyticsView["kpis"] }) {
  const finished = kpis.deliveredCount + kpis.returnedCount;
  return (
    <section aria-label="Ringkasan laporan" className="grid grid-cols-2 gap-3 sm:gap-6 xl:grid-cols-3">
      <KpiCard icon={Package} label="Total kiriman" note="Dibuat pada periode dan filter ini" value={kpis.shipmentCount} />
      <KpiCard icon={PackageCheck} label="Terkirim" note={`${share(kpis.deliveredCount, kpis.shipmentCount)} dari ${number.format(kpis.shipmentCount)} kiriman`} value={kpis.deliveredCount} />
      <KpiCard icon={Undo2} label="Retur" note={`${formatRate(returnRate(kpis))} dari ${number.format(finished)} selesai`} value={kpis.returnedCount} />
      <KpiCard icon={Truck} label="Masih berjalan" note="Belum terkirim, retur atau gagal" value={kpis.inProgressCount} />
      <div className="col-span-2 grid xl:col-span-1">
        <KpiCard icon={Banknote} label="Nilai COD" note={`Ditagih kurir dari ${number.format(kpis.codOrderCount)} kiriman COD`} value={formatIdr(kpis.codValueIdr)} />
      </div>
      <div className="col-span-2 grid xl:col-span-1">
        <KpiCard icon={Wallet} label="Estimasi cair" note="Perkiraan, bukan dana yang sudah diterima" value={formatIdr(kpis.codDisbursementEstimateIdr)} />
      </div>
    </section>
  );
}

export function ReportKpiHelp() {
  return (
    <HelpHint label="Cara membaca ringkasan laporan">
      <p>Status terkini kiriman yang dibuat pada periode ini, sama dengan Dasbor. Retur mencakup antre retur, retur dalam perjalanan dan retur diterima; persentasenya dihitung dari kiriman yang selesai (terkirim + retur).</p>
      <p>Nilai COD adalah jumlah yang ditagih kurir untuk kiriman COD yang resinya sudah terbit. Estimasi cair = nilai COD dikurangi ongkir dan biaya COD Mengantar.</p>
    </HelpHint>
  );
}

export function ReportTrendCard({ granularity, trend }: Pick<ReportAnalyticsView, "granularity" | "trend">) {
  const unit = granularity === "harian" ? "hari" : "bulan";
  const totals = trend.reduce((sum, point) => ({ cod: sum.cod + point.cod, nonCod: sum.nonCod + point.nonCod, value: sum.value + point.codValue }), { cod: 0, nonCod: 0, value: 0 });
  return (
    <DataCard
      action={(
        <HelpHint label="Penjelasan tren">
          <p>Kiriman dikelompokkan per {unit} menurut waktu dibuat (WIB). COD mengikuti penanda COD saat kiriman dibuat, termasuk COD Ongkir.</p>
          <p>Nilai COD per {unit} hanya menghitung kiriman COD yang resinya sudah terbit.</p>
        </HelpHint>
      )}
      title={granularity === "harian" ? "Tren harian" : "Tren bulanan"}
    >
      <Tabs defaultValue="kiriman">
        <TabsList aria-label="Tampilan tren">
          <TabsTrigger value="kiriman">Jumlah kiriman</TabsTrigger>
          <TabsTrigger value="nilai">Nilai COD per {unit}</TabsTrigger>
        </TabsList>
        <TabsContent className="grid gap-2" value="kiriman">
          <div aria-hidden="true" className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-chart-1" />COD</span>
            <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-chart-2" />Non-COD</span>
          </div>
          <ReportTrendChart data={trend} mode="count" />
          <p className="sr-only">
            {number.format(totals.cod)} kiriman COD dan {number.format(totals.nonCod)} kiriman non-COD pada periode ini.
          </p>
        </TabsContent>
        <TabsContent value="nilai">
          <ReportTrendChart data={trend} mode="value" />
          <p className="sr-only">Nilai COD pada periode ini {formatIdr(totals.value)}.</p>
        </TabsContent>
      </Tabs>
      <details className="group">
        <summary className={disclosureSummary}>
          Lihat tabel data tren
          <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <Table aria-label="Data tren" className={cn(inCardTable, "mt-2 text-xs")}>
          <TableCaption className="sr-only">Kiriman COD, non-COD dan nilai COD per {unit}, terbaru di atas.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{granularity === "harian" ? "Tanggal" : "Bulan"}</TableHead>
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

/** Spec 19 RPT-SHP-LIFECYCLE-COUNT as bars in lifecycle order (M-3: not a funnel); numbers stay visible. */
export function StatusDistribution({ total, totals }: { total: number; totals: ShipmentReportLifecycleTotal[] }) {
  const counts = new Map(totals.map((row) => [row.status, row.shipmentCount]));
  const rows = shipmentStatuses.filter((status) => (counts.get(status) ?? 0) > 0);
  const max = Math.max(1, ...totals.map((row) => row.shipmentCount));
  return (
    <DataCard title="Distribusi status">
      <ul aria-label="Distribusi status" className="grid gap-3">
        {rows.map((status) => {
          const value = counts.get(status) ?? 0;
          return (
            <li className="grid gap-1.5" data-status={status} key={status}>
              <div className="flex items-center justify-between gap-3">
                <ShipmentStatusBadge status={status} />
                <span className="text-sm tabular-nums">
                  <span className="font-semibold">{number.format(value)}</span>
                  <span className="text-muted-foreground"> · {share(value, total)}</span>
                </span>
              </div>
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-chart-1" style={{ width: `${(value / max) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="sr-only">
        {rows.map((status) => `${SHIPMENT_STATUS_PRESENTATION[status].label} ${number.format(counts.get(status) ?? 0)}`).join("; ")}.
      </p>
    </DataCard>
  );
}

function RegionTable({ label, rows }: { label: string; rows: RegionTotal[] }) {
  return (
    <Table aria-label={label} className={inCardTable}>
      <TableHeader>
        <TableRow>
          <TableHead>Wilayah</TableHead>
          <TableHead className={numeric}>Kiriman</TableHead>
          <TableHead className={numeric}>Terkirim</TableHead>
          <TableHead className={numeric}>Retur</TableHead>
          <TableHead className={numeric}>% retur</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="min-w-0 whitespace-normal">
              <span className={cn("font-medium", row.key === UNKNOWN_REGION_KEY && "text-muted-foreground")}>{row.name}</span>
              {row.province ? <span className="block text-xs text-muted-foreground">{row.province}</span> : null}
            </TableCell>
            <TableCell className={cn(numeric, "font-semibold")}>{number.format(row.shipmentCount)}</TableCell>
            <TableCell className={numeric}>{number.format(row.deliveredCount)}</TableCell>
            <TableCell className={numeric}>{number.format(row.returnedCount)}</TableCell>
            <TableCell className={numeric}>{formatRate(returnRate(row))}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RegionPanel({ noun, rows }: { noun: string; rows: RegionTotal[] }) {
  const top = rows.slice(0, REGION_TOP);
  const rest = rows.slice(REGION_TOP);
  const chartRows = top.filter((row) => row.key !== UNKNOWN_REGION_KEY);
  return (
    <div className="grid gap-4">
      {chartRows.length > 0 ? (
        <figure className="grid gap-2">
          <RegionBarChart data={chartRows.map((row) => ({ count: row.shipmentCount, name: row.name }))} />
          <figcaption className="sr-only">
            Kiriman per {noun}, {chartRows.length} teratas: {chartRows.map((row) => `${row.name} ${number.format(row.shipmentCount)}`).join("; ")}.
          </figcaption>
        </figure>
      ) : null}
      <RegionTable label={`Kiriman per ${noun}`} rows={top} />
      {rest.length > 0 ? (
        <details className="group">
          <summary className={disclosureSummary}>
            Tampilkan semua ({number.format(rows.length)} {noun})
            <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="mt-2"><RegionTable label={`Kiriman per ${noun}, lainnya`} rows={rest} /></div>
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
        <HelpHint label="Penjelasan wilayah tujuan">
          <p>Wilayah dibaca dari area penerima kiriman. Area yang tidak memuat kota dan provinsi masuk ke &quot;Wilayah tidak dikenal&quot;.</p>
          <p>% retur = retur dibagi kiriman yang selesai (terkirim + retur) di wilayah itu.</p>
        </HelpHint>
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

/** Spec 19 RPT-SHP-ROUTE-COUNT: the five busiest outlet → destination city pairs. */
export function RoutesCard({ routes }: { routes: ReportAnalyticsView["routes"] }) {
  return (
    <DataCard title="Rute teratas">
      {routes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada rute dengan wilayah tujuan yang dikenal.</p>
      ) : (
        <Table aria-label="Rute teratas" className={inCardTable}>
          <TableHeader>
            <TableRow>
              <TableHead>Rute</TableHead>
              <TableHead className={numeric}>Kiriman</TableHead>
              <TableHead className={numeric}>% terkirim</TableHead>
              <TableHead className={numeric}>% retur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((route) => (
              <TableRow key={route.key}>
                <TableCell className="min-w-0 whitespace-normal">
                  <span className="block text-xs text-muted-foreground">{route.outletName}</span>
                  <span className="font-medium"><span aria-hidden="true">→ </span><span className="sr-only">ke </span>{route.city}</span>
                </TableCell>
                <TableCell className={cn(numeric, "font-semibold")}>{number.format(route.shipmentCount)}</TableCell>
                <TableCell className={numeric}>{formatRate(deliveredRate(route))}</TableCell>
                <TableCell className={numeric}>{formatRate(returnRate(route))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </DataCard>
  );
}
