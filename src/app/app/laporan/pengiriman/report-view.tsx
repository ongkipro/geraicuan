import { CircleAlert, Download, FileSpreadsheet, SearchX } from "lucide-react";
import Link from "next/link";

import { AdvancedFilters } from "@/app/app/laporan/pengiriman/advanced-filters";
import { CourierIssueRateCard, LowVolumeNote, RegionCard, ReportKpiHelp, ReportKpiStrip, ReportTrendCard, RoutesCard, SectionHelp, StatusDistribution } from "@/app/app/laporan/pengiriman/analytics-sections";
import { REPORT_PATH, type CourierPerformancePoint, type ReportAnalyticsView } from "@/app/app/laporan/pengiriman/report-logic";
import { FilterSelect } from "@/app/app/laporan/_components/filter-select";
import { ReportPagination } from "@/app/app/laporan/_components/report-pagination";
import { CourierLogo } from "@/components/app/courier-logo";
import { DataCard } from "@/components/app/data-card";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { MoneyBreakdownCompact } from "@/components/app/money-breakdown";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ShipmentReportPage } from "@/db/shipment-report-repository";
import type { AnalyticsPresetId } from "@/lib/analytics-range";
import { serviceDisplayName } from "@/lib/labels/courier";
import { areaDisplayCase, formatDistrictCity, formatWibDateTimeParts } from "@/lib/label-format";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-method";
import { MONEY_LABELS, reportRowMoneyLines } from "@/lib/shipment-money";
import { shipmentDetailHref } from "@/lib/shipment-number";
import { shipmentReportHref } from "@/lib/shipment-report";
import { deliveredRate, formatRate, returnRate } from "@/lib/shipment-report-analytics";

type Option = { label: string; value: string };

export type ShipmentReportViewProps = {
  activeCount: number;
  /** T-235 analytics; `null` when that read failed — the totals and the list stay. */
  analytics: ReportAnalyticsView | null;
  carry: Record<string, string>;
  data: ShipmentReportPage;
  exportHref: string;
  filterRejected: boolean;
  filters: { courier: string | null; lifecycleStatus: string | null; outletId: string | null };
  issues: string[];
  options: { couriers: Option[]; outlets: Option[]; statuses: Option[] };
  /** `null` when the performance read failed; the rest of the report stays. */
  performance: CourierPerformancePoint[] | null;
  range: { endDate: string; periodLabel: string; presetId: AnalyticsPresetId; startDate: string };
};

const number = new Intl.NumberFormat("id-ID");
/** Logos differ in width; a fixed box keeps the names in one column. */
const logoBox = "h-5 w-16 object-contain object-left";
const monoLink = "font-mono text-sm font-semibold text-primary hover:underline";

function carrierName(courier: string | null) {
  return courier ? courierDisplayName(courier) : "Belum ada kurir";
}

/** Spec 17 §UX-v3.6 Laporan pengiriman (ref `laporan-pengiriman.html`). */
export function ShipmentReportView({
  activeCount,
  analytics,
  carry,
  data,
  exportHref,
  filterRejected,
  filters,
  issues,
  options,
  performance,
  range,
}: ShipmentReportViewProps) {
  const count = data.totals.shipmentCount;
  const hasRows = count > 0 && !filterRejected;

  return (
    <>
      <PageHeader
        actions={hasRows ? (
          <Button asChild variant="outline">
            <Link href={exportHref} prefetch={false}><Download aria-hidden="true" />Ekspor CSV</Link>
          </Button>
        ) : null}
        eyebrow="Laporan"
        title="Laporan pengiriman"
      />

      <FilterBar action={REPORT_PATH} clearHref={activeCount > 0 || filterRejected ? REPORT_PATH : undefined} label="Filter laporan" summary={`${range.periodLabel} · WIB (UTC+07:00)`}>
        <DateRangePicker
          endDate={range.endDate}
          presetId={range.presetId}
          startDate={range.startDate}
        />
        <FilterSelect allLabel="Semua outlet" label="Outlet" name="outlet" options={options.outlets} value={filters.outletId} />
        <AdvancedFilters
          courier={filters.courier}
          couriers={options.couriers}
          status={filters.lifecycleStatus}
          statuses={options.statuses}
        />
      </FilterBar>

      {issues.length > 0 ? (
        <Alert role={filterRejected ? "alert" : "status"} variant={filterRejected ? "destructive" : "default"}>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{filterRejected ? "Filter ditolak" : "Filter disesuaikan"}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {!hasRows ? (
        <DataCard>
          {activeCount > 0 || filterRejected ? (
            // "Hapus filter" sits in the filter row right above; no second copy here.
            <EmptyState
              icon={SearchX}
              title="Tidak ada kiriman yang cocok dengan filter ini"
            />
          ) : (
            <EmptyState
              action={<Button asChild><Link href="/app/pengiriman/baru">Buat kiriman</Link></Button>}
              description="Laporan terisi setelah kiriman dibuat pada periode ini."
              icon={FileSpreadsheet}
              title="Belum ada kiriman pada periode ini"
            />
          )}
        </DataCard>
      ) : (
        <>
          {analytics === null ? (
            <Alert role="alert" variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Ringkasan dan analitik tidak dapat dimuat</AlertTitle>
              <AlertDescription>Total per kurir dan daftar kiriman di bawah tetap lengkap. Muat ulang halaman untuk mencoba lagi.</AlertDescription>
            </Alert>
          ) : (
            <>
              <section aria-labelledby="ringkasan-laporan" className="grid gap-3">
                {/* T-254: the card header's anatomy on the ground — 18/700 title, "?" at the right. */}
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg leading-snug font-bold" id="ringkasan-laporan">Ringkasan</h2>
                  <ReportKpiHelp />
                </div>
                <ReportKpiStrip kpis={analytics.kpis} />
              </section>
              {/* Trend beside the grouped status distribution; both cards fill the row, so neither leaves a hole. */}
              <div className="grid min-w-0 gap-6 xl:grid-cols-5 [&>div>[data-slot=card]]:h-full">
                <div className="min-w-0 xl:col-span-3"><ReportTrendCard granularity={analytics.granularity} trend={analytics.trend} /></div>
                <div className="min-w-0 xl:col-span-2"><StatusDistribution total={count} totals={data.totals.byLifecycle} /></div>
              </div>
            </>
          )}
          <CourierTotals totals={data.totals.byCourier} />
          <CourierIssueRateCard points={performance} />
          {/* T-254: full width — the wilayah table (10 rows) beside a five-route table left a 500 px hole. */}
          {analytics === null ? null : (
            <>
              <RegionCard regions={analytics.regions} />
              <RoutesCard routes={analytics.routes} />
            </>
          )}
          {/* RPT-SHP-ROWS: the count badge and "Menampilkan … dari N" (T-273 metric ID); `contents` keeps the grid. */}
          <div className="contents" data-metric-id="RPT-SHP-ROWS"><ShipmentRows carry={carry} count={count} data={data} /></div>
        </>
      )}
    </>
  );
}

function CourierTotals({ totals }: { totals: ShipmentReportPage["totals"]["byCourier"] }) {
  return (
    <DataCard
      action={(
        <SectionHelp label="Penjelasan total per kurir">
          <p>Ongkir dibayar ke Mengantar dan biaya COD adalah tagihan Mengantar per kiriman.</p>
          <p>Estimasi cair adalah perkiraan dana COD yang dicairkan Mengantar: nilai COD dikurangi ongkir dibayar ke Mengantar dan biaya COD (termasuk PPN). Jumlah pasti mengikuti pencairan Mengantar.</p>
          <p>% terkirim = terkirim dibagi kiriman kurir itu. % retur = retur dibagi kiriman terkirim + retur, sama seperti di Ringkasan.</p>
        </SectionHelp>
      )}
      title="Total per kurir"
    >
      {/* T-235: seven columns fit only from xl; below it each courier is a short record. */}
      <ul aria-label="Total per kurir" className="divide-y xl:hidden">
        {totals.map((total) => (
          <li className="grid gap-1 py-3 first:pt-0 last:pb-0" key={total.courier ?? "tanpa-kurir"}>
            <div className="flex items-center justify-between gap-3">
              {/* Owner (2026-09-26): logo only; the logo's alt text (or the name without a logo) labels the row. */}
              <span className="flex min-w-0 items-center font-medium">
                {total.courier ? <CourierLogo className={logoBox} courier={total.courier} /> : carrierName(total.courier)}
              </span>
              <span className="shrink-0 tabular-nums" data-metric-id="RPT-SHP-COURIER-COUNT">{number.format(total.shipmentCount)} kiriman</span>
            </div>
            <p className="text-xs text-muted-foreground">
              <span data-metric-id="RPT-SHP-COURIER-DELIVERED-RATE">% terkirim {formatRate(deliveredRate(total))}</span> · <span data-metric-id="RPT-SHP-COURIER-RETURN-RATE">% retur {formatRate(returnRate(total))}</span>
            </p>
            <LowVolumeNote shipmentCount={total.shipmentCount} />
            <p className="text-xs text-muted-foreground">
              <span data-metric-id="RPT-SHP-COURIER-SHIPPING-COST-IDR">{MONEY_LABELS.shippingCost} <Money amount={total.shippingCostIdr} /></span> · <span data-metric-id="RPT-SHP-COURIER-COD-FEE-IDR">{MONEY_LABELS.codFee} <Money amount={total.codFeeIdr} /></span>
            </p>
            <div className="flex items-baseline justify-between gap-3" data-metric-id="RPT-SHP-COURIER-COD-DISBURSEMENT-EST-IDR">
              <span className="text-xs text-muted-foreground">Estimasi cair</span>
              <Money amount={total.codDisbursementEstimateIdr} className="font-semibold" />
            </div>
          </li>
        ))}
      </ul>
      <div className="max-xl:hidden">
      <Table aria-label="Total per kurir">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pr-2 pl-0">Kurir</TableHead>
            <TableHead className="px-2 text-right" data-metric-id="RPT-SHP-COURIER-COUNT">Kiriman</TableHead>
            <TableHead className="px-2 text-right" data-metric-id="RPT-SHP-COURIER-DELIVERED-RATE">% terkirim</TableHead>
            <TableHead className="px-2 text-right" data-metric-id="RPT-SHP-COURIER-RETURN-RATE">% retur</TableHead>
            <TableHead className="px-2 text-right" data-metric-id="RPT-SHP-COURIER-SHIPPING-COST-IDR">{MONEY_LABELS.shippingCost}</TableHead>
            <TableHead className="px-2 text-right" data-metric-id="RPT-SHP-COURIER-COD-FEE-IDR">{MONEY_LABELS.codFee}</TableHead>
            <TableHead className="pr-0 pl-2 text-right" data-metric-id="RPT-SHP-COURIER-COD-DISBURSEMENT-EST-IDR">Estimasi cair</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {totals.map((total) => (
            <TableRow className="hover:bg-transparent" key={total.courier ?? "tanpa-kurir"}>
              <TableCell className="pr-2 pl-0">
                <span className="flex items-center font-medium">
                  {total.courier ? <CourierLogo className={logoBox} courier={total.courier} /> : carrierName(total.courier)}
                </span>
                <LowVolumeNote shipmentCount={total.shipmentCount} />
              </TableCell>
              <TableCell className="px-2 text-right font-semibold">{number.format(total.shipmentCount)}</TableCell>
              <TableCell className="px-2 text-right tabular-nums">{formatRate(deliveredRate(total))}</TableCell>
              <TableCell className="px-2 text-right tabular-nums">{formatRate(returnRate(total))}</TableCell>
              <TableCell className="px-2 text-right"><Money amount={total.shippingCostIdr} /></TableCell>
              <TableCell className="px-2 text-right"><Money amount={total.codFeeIdr} /></TableCell>
              <TableCell className="pr-0 pl-2 text-right font-semibold"><Money amount={total.codDisbursementEstimateIdr} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </DataCard>
  );
}

function ShipmentRows({ carry, count, data }: { carry: Record<string, string>; count: number; data: ShipmentReportPage }) {
  return (
    <DataCard
      count={count}
      flush
      footer={(
        <ReportPagination
          hrefForPage={(page) => shipmentReportHref(page, carry)}
          label="Halaman daftar kiriman"
          noun="kiriman"
          page={data.page}
          pageSize={data.pageSize}
          total={count}
          totalPages={data.totalPages}
        />
      )}
      title="Daftar kiriman"
    >
      <div className="xl:hidden">
        <RecordList label="Daftar kiriman">
          {data.rows.map((row) => {
            const created = formatWibDateTimeParts(row.createdAt);
            return (
              <RecordItem
                href={shipmentDetailHref(row.publicReference)}
                key={row.shipmentId}
                meta={`${row.providerService ? serviceDisplayName(row.providerService) : carrierName(row.courier)} · ${PAYMENT_METHOD_LABELS[row.paymentMethod]}`}
                status={<ShipmentStatusBadge status={row.status} />}
                subtitle={areaDisplayCase(formatDistrictCity(row.destinationAreaLabel))}
                time={<time dateTime={row.createdAt.toISOString()}>{created.date}, {created.time}</time>}
                title={<span className="font-mono">{row.publicReference}</span>}
                value={<MoneyBreakdownCompact align="start" lines={reportRowMoneyLines(row)} />}
              />
            );
          })}
        </RecordList>
      </div>
      <div className="max-xl:hidden">
      <Table aria-label="Daftar kiriman">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-6">Nomor</TableHead>
            <TableHead>Dibuat</TableHead>
            <TableHead>Penerima</TableHead>
            <TableHead>Kurir/Layanan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Pembayaran</TableHead>
            <TableHead className="pr-6 text-right">Biaya Mengantar</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => {
            const created = formatWibDateTimeParts(row.createdAt);
            return (
              <TableRow key={row.shipmentId}>
                <TableCell className="pl-6">
                  <Link className={monoLink} href={shipmentDetailHref(row.publicReference)}>{row.publicReference}</Link>
                </TableCell>
                <TableCell>
                  <time dateTime={row.createdAt.toISOString()}>
                    <span className="block">{created.date}</span>
                    <span className="block text-xs text-muted-foreground">{created.time}</span>
                  </time>
                </TableCell>
                <TableCell className="min-w-40 whitespace-normal">
                  {areaDisplayCase(formatDistrictCity(row.destinationAreaLabel))}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-3">
                    {row.courier ? <span className="flex w-16 shrink-0"><CourierLogo className={logoBox} courier={row.courier} decorative /></span> : null}
                    <span className="font-medium">
                      {row.providerService ? serviceDisplayName(row.providerService) : carrierName(row.courier)}
                    </span>
                  </span>
                </TableCell>
                <TableCell><ShipmentStatusBadge status={row.status} /></TableCell>
                <TableCell>{PAYMENT_METHOD_LABELS[row.paymentMethod]}</TableCell>
                <TableCell className="pr-6 text-right">
                  <MoneyBreakdownCompact lines={reportRowMoneyLines(row)} showFirstLabel={false} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </DataCard>
  );
}
