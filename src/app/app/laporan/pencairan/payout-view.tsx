import { randomUUID } from "node:crypto";

import { CircleAlert, HandCoins, SearchX } from "lucide-react";
import Link from "next/link";

import { FilterSelect } from "@/app/app/laporan/_components/filter-select";
import { ReportPagination } from "@/app/app/laporan/_components/report-pagination";
import { formatPayoutVariance, PAYOUT_PAGE_SIZE, PAYOUT_PATH, PAYOUT_TABS, payoutHref, type PayoutTabKey } from "@/app/app/laporan/pencairan/payout-logic";
import { StatusPull } from "@/app/app/pengiriman/_list/status-pull";
import { pullMengantarStatus } from "@/app/app/pengiriman/status-sync-actions";
import { DataCard } from "@/components/app/data-card";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { SectionHelp } from "@/components/app/help-hint";
import { formatIdr, Money } from "@/components/app/money";
import { OwnerMoneyStrip } from "@/components/app/owner-money-strip";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { StatusBadge, type StatusTone } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ownerMarginUnits,
  ownerPayoutState,
  payoutVarianceUnits,
  unitsToIdr,
  type OwnerMoneyRow,
  type OwnerMoneySummary,
  type OwnerPayoutState,
} from "@/db/owner-money-repository";
import type { AnalyticsPresetId } from "@/lib/analytics-range";
import { formatWibDateTime } from "@/lib/label-format";
import { formatRelativeAge } from "@/lib/relative-age";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-method";
import { shipmentDetailHref } from "@/lib/shipment-number";
import { cn } from "@/lib/utils";

const count = new Intl.NumberFormat("id-ID");
const numeric = "text-right tabular-nums";

const STATE_BADGE: Record<OwnerPayoutState, { label: string; tone: StatusTone }> = {
  BELUM_CAIR: { label: "Belum cair", tone: "pending" },
  PERLU_DICEK: { label: "Perlu dicek", tone: "warning" },
  RETUR: { label: "Retur", tone: "neutral" },
  SUDAH_CAIR: { label: "Sudah cair", tone: "success" },
};

/** Why a resi needs a look, in the owner's words (classifyProviderSettlement's reasons). */
function reviewReason(row: OwnerMoneyRow) {
  if (row.refundUnits !== BigInt(0)) return "Ada klaim atau refund dari Mengantar";
  if (row.settledUnits !== null && row.chargeUnits !== BigInt(0)) return "Sudah cair, lalu ada tagihan Mengantar";
  return "Dana cair berbeda dari perkiraan";
}

export type PayoutViewProps = {
  activeCount: number;
  carry: Record<string, string>;
  issues: string[];
  lastPullAt: Date | null;
  /** The read's database clock (`loadOwnerMoney` generatedAt), for "Terkirim n hari lalu". */
  now: Date;
  outletId: string | null;
  outlets: { id: string; name: string }[];
  page: number;
  range: { endDate: string; periodLabel: string; presetId: AnalyticsPresetId; startDate: string; timezone: string };
  rows: OwnerMoneyRow[];
  summary: OwnerMoneySummary;
  tab: PayoutTabKey;
  tabCounts: Record<PayoutTabKey, number>;
  totalPages: number;
  truncated: boolean;
};

function MarginCell({ row }: { row: OwnerMoneyRow }) {
  const margin = ownerMarginUnits(row);
  if (margin === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-col items-end">
      <Money amount={unitsToIdr(margin.units)} className={cn("font-medium", margin.units < BigInt(0) && "text-danger")} />
      <span className="text-xs text-muted-foreground">{margin.basis === "PROVEN" ? "Terbukti" : "Estimasi"}</span>
    </span>
  );
}

function rowFacts(row: OwnerMoneyRow) {
  const variance = payoutVarianceUnits(row);
  return {
    paid: row.settledUnits === null ? null : unitsToIdr(row.settledUnits),
    variance: formatPayoutVariance(variance),
    varianceOff: variance !== null && formatPayoutVariance(variance) !== "Sesuai",
  };
}

/**
 * T-287 (market scan gap 5): how long a delivered COD resi has waited for its payout, so the owner
 * knows which to chase with Mengantar — from Mengantar's own delivery time, on the read's clock.
 */
export function deliveredAge(deliveredAt: Date, now: Date) {
  return formatRelativeAge(deliveredAt, now, 60) ?? formatWibDateTime(deliveredAt);
}

/** Spec 17 §T-275 Pencairan COD: the owner's payouts and ongkir margin (D-41). */
export function PayoutView({
  activeCount,
  carry,
  issues,
  lastPullAt,
  now,
  outletId,
  outlets,
  page,
  range,
  rows,
  summary,
  tab,
  tabCounts,
  totalPages,
  truncated,
}: PayoutViewProps) {
  const activeTab = PAYOUT_TABS.find((candidate) => candidate.key === tab)!;
  const tabTotal = tabCounts[tab];
  return (
    <>
      <PageHeader
        description="Dana COD dari Mengantar dan margin ongkir gerai. Hanya terlihat oleh pemilik gerai."
        eyebrow="Laporan"
        title="Pencairan COD"
      />

      <FilterBar action={PAYOUT_PATH} clearHref={activeCount > 0 ? PAYOUT_PATH : undefined} label="Filter pencairan" summary={`${range.periodLabel} · resi terbit · WIB (UTC+07:00)`}>
        <DateRangePicker endDate={range.endDate} presetId={range.presetId} startDate={range.startDate} />
        <FilterSelect allLabel="Semua outlet" label="Outlet" name="outlet" options={outlets.map((outlet) => ({ label: outlet.name, value: outlet.id }))} value={outletId} />
      </FilterBar>

      {issues.length > 0 ? (
        <Alert role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Filter disesuaikan</AlertTitle>
          <AlertDescription><ul className="list-disc pl-5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></AlertDescription>
        </Alert>
      ) : null}
      {truncated ? (
        <Alert role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Periode terlalu panjang</AlertTitle>
          <AlertDescription>Angka di halaman ini hanya mencakup resi terbaru. Pilih periode lebih pendek untuk angka lengkap.</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="ringkasan-uang" className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold" id="ringkasan-uang">Ringkasan</h2>
          <SectionHelp label="Cara membaca pencairan COD">
            <p>COD belum cair: nilai COD yang masih dipegang kurir atau Mengantar. Estimasi cair = nilai COD dikurangi ongkir dibayar ke Mengantar dan biaya COD (termasuk PPN).</p>
            <p>Sudah cair: dana yang dibayarkan Mengantar menurut invoice pencairan yang sudah lunas (statusCleared).</p>
            <p>Margin ongkir: yang tersisa untuk gerai setelah Mengantar mengambil bagiannya. COD: dana cair dikurangi nilai barang. COD Ongkir: seluruh dana cair. Non-COD: ongkir yang dibayar pelanggan dikurangi ongkir dibayar ke Mengantar. Retur: tagihan retur dari Mengantar. Terbukti berarti dari invoice Mengantar; selain itu perkiraan. Klaim atau refund tidak dihitung sebagai margin.</p>
          </SectionHelp>
        </div>
        <OwnerMoneyStrip summary={summary} />
      </section>

      <DataCard
        action={(
          <SectionHelp label="Tentang margin per kurir">
            <p>Termasuk kiriman Non-COD. Kolom Terbukti hanya menjumlah resi yang sudah ada di invoice Mengantar.</p>
          </SectionHelp>
        )}
        flush
        title="Margin per kurir"
      >
        {summary.byCourier.length === 0 ? (
          <EmptyState icon={HandCoins} title="Belum ada resi terbit pada periode ini" />
        ) : (
          <Table>
            <TableCaption className="sr-only">Margin ongkir per kurir, resi terbit pada periode ini.</TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 sm:pl-6">Kurir</TableHead>
                <TableHead className={numeric}>Resi</TableHead>
                <TableHead className={cn(numeric, "max-sm:pr-4 max-sm:whitespace-normal")} data-metric-id="OWN-MARGIN-IDR">Margin ongkir</TableHead>
                <TableHead className={cn(numeric, "pr-6 max-sm:hidden")} data-metric-id="OWN-MARGIN-PROVEN-IDR">Terbukti</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.byCourier.map((courier) => (
                <TableRow key={courier.courier}>
                  <TableCell className="pl-4 font-medium whitespace-normal sm:pl-6">{courierDisplayName(courier.courier)}</TableCell>
                  <TableCell className={numeric}>{count.format(courier.count)}</TableCell>
                  <TableCell className={cn(numeric, "max-sm:pr-4")}>
                    <Money amount={courier.marginIdr} className={cn(courier.marginIdr < 0 && "text-danger")} />
                    {/* Phones: the proven part under the margin instead of a fourth column. */}
                    <span className="block text-xs whitespace-normal text-muted-foreground sm:hidden">terbukti <Money amount={courier.provenIdr} /></span>
                  </TableCell>
                  <TableCell className={cn(numeric, "pr-6 text-muted-foreground max-sm:hidden")}><Money amount={courier.provenIdr} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataCard>

      <DataCard
        flush
        footer={tabTotal > 0 ? (
          <ReportPagination
            hrefForPage={(target) => payoutHref(tab, target, carry)}
            label="Halaman pencairan"
            noun="resi"
            page={page}
            pageSize={PAYOUT_PAGE_SIZE}
            total={tabTotal}
            totalPages={totalPages}
          />
        ) : undefined}
        title="Resi COD"
      >
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <nav aria-label="Status pencairan" className="w-full md:w-auto">
            <ul className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:grid-cols-4">
              {PAYOUT_TABS.map((candidate) => {
                const selected = candidate.key === tab;
                return (
                  <li className="flex" key={candidate.key}>
                    <Link
                      aria-current={selected ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9",
                        selected && "bg-card font-semibold text-foreground shadow-sm",
                      )}
                      href={payoutHref(candidate.key, 1, carry)}
                    >
                      {candidate.label}
                      <span className="text-sm font-semibold tabular-nums">{count.format(tabCounts[candidate.key])}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex flex-wrap items-center gap-3 md:ml-auto">
            <StatusPull
              action={pullMengantarStatus}
              attemptId={randomUUID()}
              outlets={outlets}
              range={{ lastIncludedDate: range.endDate, presetId: range.presetId, startDate: range.startDate, timezone: range.timezone }}
            />
          </div>
          <p className="basis-full text-xs text-muted-foreground">
            {lastPullAt
              ? `Data pencairan terakhir ditarik dari Mengantar ${formatWibDateTime(lastPullAt)}.`
              : "Data pencairan belum pernah ditarik dari Mengantar. Tekan Perbarui status dari Mengantar untuk menarik invoice pencairan."}
          </p>
        </div>

        {rows.length === 0 ? (
          activeCount > 0 && tabTotal === 0 && Object.values(tabCounts).every((value) => value === 0)
            ? <EmptyState icon={SearchX} title="Tidak ada resi COD yang cocok dengan filter ini" />
            : <EmptyState icon={HandCoins} title={`Tidak ada resi ${activeTab.label.toLowerCase()} pada periode ini`} />
        ) : (
          <>
            <div className="xl:hidden">
              <RecordList label={`Resi ${activeTab.label.toLowerCase()}`}>
                {rows.map((row) => {
                  const facts = rowFacts(row);
                  const state = ownerPayoutState(row);
                  return (
                    <RecordItem
                      detail={(
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <dt className="text-muted-foreground">Ditagih ke penerima</dt><dd className={numeric}><Money amount={row.collectIdr} /></dd>
                          <dt className="text-muted-foreground">Estimasi cair</dt><dd className={numeric}><Money amount={row.estimatedPayoutIdr} /></dd>
                          <dt className="text-muted-foreground">Cair</dt><dd className={numeric}><Money amount={facts.paid} /></dd>
                          {state === "BELUM_CAIR" && row.deliveredAt ? <><dt className="text-muted-foreground">Terkirim</dt><dd className="text-right" data-slot="delivered-age">{deliveredAge(row.deliveredAt, now)}</dd></> : null}
                          {facts.varianceOff ? <><dt className="text-muted-foreground">Selisih</dt><dd className={cn(numeric, "font-medium text-danger")}>{facts.variance}</dd></> : null}
                          <dt className="text-muted-foreground">Margin ongkir</dt><dd className="text-right"><MarginCell row={row} /></dd>
                        </dl>
                      )}
                      href={shipmentDetailHref(row.publicReference)}
                      key={row.shipmentId}
                      meta={[courierDisplayName(row.courier), PAYMENT_METHOD_LABELS[row.paymentMethod], row.outletName].join(" · ")}
                      status={state ? <StatusBadge label={STATE_BADGE[state].label} tone={STATE_BADGE[state].tone} /> : null}
                      subtitle={state === "PERLU_DICEK" ? reviewReason(row) : <span className="font-mono">{row.cnoteNo}</span>}
                      title={<span className="font-mono">{row.publicReference}</span>}
                    />
                  );
                })}
              </RecordList>
            </div>
            <div className="max-xl:hidden">
              <Table aria-label={`Resi ${activeTab.label.toLowerCase()}`}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Nomor</TableHead>
                    <TableHead>Kurir</TableHead>
                    <TableHead className={numeric}>Ditagih ke penerima</TableHead>
                    <TableHead className={numeric} data-metric-id="RPT-SHP-COD-DISBURSEMENT-EST-IDR">Estimasi cair</TableHead>
                    <TableHead className={numeric} data-metric-id="SETTLE-PAYOUT-IDR">Cair</TableHead>
                    <TableHead className={numeric} data-metric-id="SETTLE-VARIANCE-IDR">Selisih</TableHead>
                    <TableHead className={cn(numeric, "pr-6")} data-metric-id="OWN-MARGIN-IDR">Margin ongkir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const facts = rowFacts(row);
                    return (
                      <TableRow key={row.shipmentId}>
                        <TableCell className="pl-6">
                          <Link className="font-mono text-sm font-semibold text-primary hover:underline" href={shipmentDetailHref(row.publicReference)}>{row.publicReference}</Link>
                          <span className="block font-mono text-xs text-muted-foreground">{row.cnoteNo}</span>
                          {tab === "dicek" ? <span className="block text-xs text-warn">{reviewReason(row)}</span> : null}
                          {tab === "belum" && row.deliveredAt ? <span className="block text-xs text-muted-foreground" data-slot="delivered-age">Terkirim {deliveredAge(row.deliveredAt, now)}</span> : null}
                        </TableCell>
                        <TableCell>
                          <span className="block">{courierDisplayName(row.courier)}</span>
                          <span className="block text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[row.paymentMethod]}</span>
                        </TableCell>
                        <TableCell className={numeric}><Money amount={row.collectIdr} /></TableCell>
                        <TableCell className={numeric}><Money amount={row.estimatedPayoutIdr} /></TableCell>
                        <TableCell className={numeric}><Money amount={facts.paid} /></TableCell>
                        <TableCell className={cn(numeric, facts.varianceOff ? "font-medium text-danger" : "text-muted-foreground")}>{facts.variance}</TableCell>
                        <TableCell className={cn(numeric, "pr-6")}><MarginCell row={row} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </DataCard>
      {summary.margin.unknownCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {count.format(summary.margin.unknownCount)} resi lama tanpa rincian nilai barang tidak dihitung dalam margin {formatIdr(summary.margin.idr)}.
        </p>
      ) : null}
    </>
  );
}
