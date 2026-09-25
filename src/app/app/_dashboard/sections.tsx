import { ArrowRight, Banknote, ChevronDown, CircleAlert, Package, ReceiptText, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { HelpHint } from "@/components/app/help-hint";
import { CourierLogo } from "@/components/app/courier-logo";
import { KpiCard } from "@/components/app/kpi-card";
import { formatIdr } from "@/components/app/money";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  TenantDashboardCourierRecap,
  TenantDashboardOutcomeSummary,
  TenantDashboardPeriodSummary,
  TenantDashboardRecentShipment,
} from "@/db/tenant-dashboard-repository";
import { areaDisplayCase, formatDistrictCity } from "@/lib/label-format";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import { shipmentDetailHref } from "@/lib/shipment-number";
import type { TenantShipmentRole } from "@/lib/shipment-queue";
import { cn } from "@/lib/utils";

import { courierTotals, kpiDelta, recentNextStep } from "./dashboard-logic";
import { RetryButton } from "./retry-button";
import { TrendChart, type TrendPoint } from "./trend-chart";

const count = new Intl.NumberFormat("id-ID");

/** A table inside a card: no frame, flush with the card's padding, rows that are not links do not highlight. */
const inCardTable = cn(
  "[&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0 [&_tr]:hover:bg-transparent",
  // Below xl (phone, and the two-column rows at 1024) the columns tighten and wrap (as the reference does) so the card needs no side scroll.
  "max-xl:[&_td]:px-1.5 max-xl:[&_td]:whitespace-normal max-xl:[&_th]:px-1.5 max-xl:[&_th]:whitespace-normal",
);
const numeric = "text-right tabular-nums whitespace-nowrap";
/** "Rp 1.250" with a breakable space, so a phone-width column may put the figure under "Rp" (reference). */
/** The reference's plain arrow link ("Lihat semua kiriman →"). */
export const arrowLink = "inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary underline-offset-4 hover:underline md:min-h-6 [&_svg]:size-4";

/** Card of the dashboard grid: 18/700 title (spec 10 §4.3), optional description, 16px rhythm. */
export function DashboardCard({ action, children, className, description, id, title }: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col">
      <Card className={cn("min-w-0 flex-1 gap-4", className)}>
        <CardHeader>
          <CardTitle><h2 id={id}>{title}</h2></CardTitle>
          {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
          {action ? <CardAction className="flex items-center gap-4">{action}</CardAction> : null}
        </CardHeader>
        <CardContent className="flex min-w-0 flex-1 flex-col gap-4">{children}</CardContent>
      </Card>
    </section>
  );
}

/** A region that could not be read: the cause and a retry; the other regions keep rendering. */
export function RegionError({ title }: { title: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="grid gap-3">
        <p>Bagian lain dasbor tetap dapat dipakai.</p>
        <div><RetryButton /></div>
      </AlertDescription>
    </Alert>
  );
}

export function KpiRow({ comparison, summary }: { comparison: string; summary: TenantDashboardPeriodSummary }) {
  const { current, previous } = summary;
  const kpis = [
    { current: current.createdCount, icon: Package, label: "Kiriman dibuat", previous: previous.createdCount },
    { current: current.codCount, icon: Banknote, label: "Kiriman COD", previous: previous.codCount },
    { current: current.nonCodCount, icon: Wallet, label: "Kiriman non-COD", previous: previous.nonCodCount },
    { current: current.issuedCount, icon: ReceiptText, label: "Resi terbit", previous: previous.issuedCount },
  ];
  return (
    <section aria-label="Ringkasan periode" className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiCard comparison={comparison} delta={kpiDelta(kpi.current, kpi.previous)} icon={kpi.icon} key={kpi.label} label={kpi.label} value={kpi.current} />
      ))}
    </section>
  );
}

const outcomeDot = { danger: "bg-danger", neutral: "bg-primary", ok: "bg-ok", warn: "bg-warn" } as const;

export function OutcomeTable({ outcome }: { outcome: TenantDashboardOutcomeSummary }) {
  const rows = [
    { dot: outcomeDot.ok, label: "Terkirim", value: outcome.delivered },
    { dot: outcomeDot.warn, label: "Retur", value: outcome.returned },
    { dot: outcomeDot.danger, label: "Gagal", value: outcome.failed },
    { dot: outcomeDot.neutral, label: "Masih berjalan", value: outcome.inProgress },
  ];
  return (
    <Table className={inCardTable}>
      <TableCaption className="sr-only">Status terkini dari {count.format(outcome.cohortCount)} kiriman yang dibuat pada periode ini.</TableCaption>
      <TableHeader>
        <TableRow><TableHead>Hasil</TableHead><TableHead className={numeric}>COD</TableHead><TableHead className={numeric}>Non-COD</TableHead><TableHead className={numeric}>Total</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="font-medium">
              <span className="flex items-center gap-2"><span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", row.dot)} data-slot="outcome-dot" />{row.label}</span>
            </TableCell>
            <TableCell className={numeric}>{count.format(row.value.codCount)}</TableCell>
            <TableCell className={numeric}>{count.format(row.value.nonCodCount)}</TableCell>
            <TableCell className={cn(numeric, "font-semibold")}>{count.format(row.value.totalCount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Spec 19 SHP-OUTCOME-*: a cohort (created in the period, where they stand now), said once behind "?". */
export function OutcomeHelp({ basisSentence }: { basisSentence: string }) {
  return (
    <HelpHint label="Cara membaca hasil pengiriman">
      <p>Status terkini kiriman yang dibuat pada periode ini. Retur mencakup antre retur, retur dalam perjalanan dan retur diterima. COD mengikuti penanda COD saat kiriman dibuat, termasuk COD Ongkir.</p>
      <p>{basisSentence}</p>
    </HelpHint>
  );
}

export function TrendLegend({ compare }: { compare: boolean }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-primary" />Periode ini</span>
      {compare ? <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-input" />Lalu</span> : null}
    </div>
  );
}

export function TrendBody({ compare, data }: { compare: boolean; data: TrendPoint[] }) {
  return (
    <>
      <TrendChart compare={compare} data={data} />
      <details className="group text-xs text-muted-foreground">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium hover:text-foreground md:min-h-6 [&::-webkit-details-marker]:hidden">
          Lihat tabel data tren
          <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <Table className={cn(inCardTable, "mt-2 text-xs")}>
          <TableCaption className="sr-only">Kiriman dibuat per {compare ? "hari, periode ini dan periode lalu" : "bulan"}.</TableCaption>
          <TableHeader>
            <TableRow><TableHead>Tanggal</TableHead><TableHead className={numeric}>Periode ini</TableHead>{compare ? <><TableHead>Pembanding</TableHead><TableHead className={numeric}>Periode lalu</TableHead></> : null}</TableRow>
          </TableHeader>
          <TableBody>
            {[...data].reverse().map((row) => (
              <TableRow className="h-auto" key={row.label}>
                <TableCell className="h-auto py-1.5">{row.label}</TableCell>
                <TableCell className={cn(numeric, "h-auto py-1.5 font-medium text-foreground")}>{count.format(row.current)}</TableCell>
                {compare ? <><TableCell className="h-auto py-1.5">{row.previousLabel}</TableCell><TableCell className={cn(numeric, "h-auto py-1.5")}>{row.previous === null ? "—" : count.format(row.previous)}</TableCell></> : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </>
  );
}

export function RecentList({ multipleOutlets, role, rows }: { multipleOutlets: boolean; role: TenantShipmentRole; rows: TenantDashboardRecentShipment[] }) {
  return (
    <ul aria-label="Kiriman terbaru" className="-my-3 divide-y">
      {rows.map((row) => {
        const next = recentNextStep(row, role);
        return (
          <li className="grid gap-1 py-3" data-actionable={next.actionable || undefined} key={row.shipmentId}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Link className="inline-flex min-h-11 items-center font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline md:min-h-6" href={shipmentDetailHref(row.publicReference)}>{row.publicReference}</Link>
              <ShipmentStatusBadge status={row.status} />
            </div>
            <p className="min-w-0 text-sm font-medium wrap-anywhere">
              {row.recipientName} · {areaDisplayCase(formatDistrictCity(row.destinationAreaLabel))}{multipleOutlets ? ` · ${row.outletName}` : ""}
            </p>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 text-xs">
              <span className="min-w-0 text-muted-foreground wrap-anywhere">
                {row.awb ? <>Resi <span className="font-mono text-foreground">{row.awb}</span></> : "Belum ada resi"}
              </span>
              <Link className={cn(arrowLink, "font-medium")} href={next.href}>{next.label}<ArrowRight aria-hidden="true" /></Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CourierRecapTable({ recap }: { recap: TenantDashboardCourierRecap }) {
  const rows = recap.rows
    .filter((row) => row.shipmentCount > 0)
    .sort((a, b) => b.shipmentCount - a.shipmentCount || courierDisplayName(a.courier).localeCompare(courierDisplayName(b.courier)));
  const totals = courierTotals(rows);
  const showCost = recap.shippingCostVisible;
  return (
    <Table className={inCardTable}>
      <TableCaption className="sr-only">Rekap per kurir: kiriman, terkirim dan retur{showCost ? ", serta biaya kirim" : ""}.</TableCaption>
      <TableHeader>
        <TableRow><TableHead>Kurir</TableHead><TableHead className={numeric}>Kiriman</TableHead><TableHead className={cn(numeric, "max-sm:hidden")}>Terkirim</TableHead><TableHead className={cn(numeric, "max-sm:hidden")}>Retur</TableHead>{showCost ? <TableHead className={numeric}>Biaya kirim</TableHead> : null}</TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.courier}>
            <TableCell className="font-medium">
              <span className="flex items-center gap-2"><CourierLogo className="h-5 w-auto" courier={row.courier} decorative />{courierDisplayName(row.courier)}</span>
            </TableCell>
            <TableCell className={numeric}>{count.format(row.shipmentCount)}</TableCell>
            <TableCell className={cn(numeric, "max-sm:hidden")}>{count.format(row.deliveredCount)}</TableCell>
            <TableCell className={cn(numeric, "max-sm:hidden")}>{count.format(row.returnedCount)}</TableCell>
            {showCost ? <TableCell className={cn(numeric, "font-medium")}>{formatIdr(row.shippingCostIdr ?? 0)}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter className="bg-card font-semibold">
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className={numeric}>{count.format(totals.shipmentCount)}</TableCell>
          <TableCell className={cn(numeric, "max-sm:hidden")}>{count.format(totals.deliveredCount)}</TableCell>
          <TableCell className={cn(numeric, "max-sm:hidden")}>{count.format(totals.returnedCount)}</TableCell>
          {showCost ? <TableCell className={cn(numeric, "text-primary")} data-slot="courier-cost-total">{formatIdr(totals.shippingCostIdr ?? 0)}</TableCell> : null}
        </TableRow>
      </TableFooter>
    </Table>
  );
}
