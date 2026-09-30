import { Printer, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BatchPrintDialog, BatchSelectionProvider, SelectionNote, SelectPageCheckbox, SelectRowCheckbox, SelectUnprintedButton } from "@/app/app/label/batch-selection";
import { AWB_SUFFIX_ERROR, DEFAULT_PRINT_STATE, LABEL_PAGE_SIZE, labelIndexHref, labelTileShareBase, parseLabelQuery } from "@/app/app/label/label-query";
import { ListPagination } from "@/app/app/pengiriman/_list/list-pagination";
import { AdjustedFilterAlert, PeriodFilter, rangeIssueMessages } from "@/app/app/pengiriman/_list/period-filter";
import { activeFilterCount, type SearchValue } from "@/app/app/pengiriman/_list/search-params";
import { areaText, carrierText, idLinkClassName, paymentText, StackedDateTime } from "@/app/app/pengiriman/_list/shipment-cells";
import { requireTenantPrincipal } from "@/app/app/pengiriman/_list/tenant-page";
import { CourierLogo } from "@/components/app/courier-logo";
import { EmptyState } from "@/components/app/empty-state";
import { ListFilterSheet } from "@/components/app/list-filter-sheet";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { PRINT_STATE_TONE, ShipmentStatusBadge, shipmentStatusIcon, StatusBadge } from "@/components/app/status-badge";
import { StatusTiles } from "@/components/app/status-tiles";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db/client";
import { loadLabelIndexPage, type LabelIndexPage, type LabelPrintStateFilter } from "@/db/label-print-repository";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantBrand } from "@/db/tenant-settings-repository";
import { formatRangeLabel, parseAnalyticsRange, serializeAnalyticsRange } from "@/lib/analytics-range";
import { formatWibDateTime } from "@/lib/label-format";
import { shipmentDetailHref, shipmentLabelHref, shipmentNumberFromReference } from "@/lib/shipment-number";

export const metadata: Metadata = { title: "Cetak resi", robots: { index: false } };

const PRINT_STATE_TILES = [
  { hint: "Siap dicetak", label: "Semua resi", metricId: "LBL-ALL", value: "semua" },
  { hint: "Perlu dicetak", label: "Belum dicetak", metricId: "LBL-UNPRINTED", value: "belum" },
  // T-263 (owner 2026-09-30): printed and still "Resi terbit" — the courier has not picked it up
  // (ISSUED → IN_TRANSIT on pickup), so it waits at the counter. No handover is recorded.
  { hint: "Sudah dicetak, belum dijemput kurir", label: "Siap diserahkan", metricId: "LBL-PRINTED", value: "sudah" },
  // T-238 (owner): resi Mengantar cancelled after issuance; listed, never printable.
  { hint: "Tidak dapat dicetak", label: "Dibatalkan", metricId: "LBL-CANCELLED", value: "batal" },
] as const satisfies readonly { hint: string; label: string; metricId: keyof LabelIndexPage["summary"]; value: LabelPrintStateFilter }[];

const EMPTY_PAGE: LabelIndexPage = { rows: [], summary: { "LBL-ALL": 0, "LBL-PRINTED": 0, "LBL-UNPRINTED": 0, "LBL-CANCELLED": 0 } };

function PrintCountBadge({ cancelled, count }: { cancelled?: boolean; count: number }) {
  if (cancelled) return <ShipmentStatusBadge status="CANCELLED" />;
  return count === 0
    ? <StatusBadge label="Belum dicetak" tone={PRINT_STATE_TONE.belum} />
    : <StatusBadge icon={Printer} label={`${count}× dicetak`} tone={PRINT_STATE_TONE.sudah} />;
}

export default async function LabelIndexPage({ searchParams }: { searchParams: Promise<Record<string, SearchValue>> }) {
  const principal = await requireTenantPrincipal();
  const params = await searchParams;
  const query = parseLabelQuery(params);
  const range = parseAnalyticsRange(params, new Date());
  const carry = Object.fromEntries(serializeAnalyticsRange(range));

  const data = query.awbSuffixError
    ? EMPTY_PAGE
    : await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      loadLabelIndexPage(tx, context, {
        awbSuffix: query.awbSuffix || undefined,
        printState: query.printState,
        range,
        status: "issued",
      }));

  // T-243: the batch dialog preselects the gerai's default label size (Informasi label).
  const { defaultLabelSize } = await withTenantContext(db, principal.userId, principal.tenantId, loadTenantBrand);

  // The repository lists the newest 100; they are paged here, 20 at a time.
  const totalPages = Math.max(1, Math.ceil(data.rows.length / LABEL_PAGE_SIZE));
  const page = Math.min(query.page, totalPages);
  const rows = data.rows.slice((page - 1) * LABEL_PAGE_SIZE, page * LABEL_PAGE_SIZE);
  const selectedCount = data.summary[PRINT_STATE_TILES.find((tile) => tile.value === query.printState)!.metricId];
  const filtered = Boolean(query.awbSuffix) || query.printState !== "semua";
  // The print state the URL carries: the default ("Belum dicetak") is the one it leaves out.
  const cetakParam = query.printState === DEFAULT_PRINT_STATE ? undefined : query.printState;
  const selectedTile = PRINT_STATE_TILES.find((tile) => tile.value === query.printState)!;
  const { periodLabel, presetLabel } = formatRangeLabel(range);
  const allHref = labelIndexHref({ awbSuffix: query.awbSuffix, printState: "semua" }, carry);
  const searchForm = (id: string, placeholder: string) => (
    <form action="/app/label" className="flex items-start gap-3" method="get" role="search">
      {Object.entries(carry).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
      {cetakParam ? <input name="cetak" type="hidden" value={cetakParam} /> : null}
      <div className="grid min-w-0 flex-1 gap-1 sm:w-72 sm:flex-none">
        <label className="sr-only" htmlFor={id}>Akhiran nomor resi</label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-describedby={query.awbSuffixError ? `${id}-error` : undefined}
            aria-invalid={Boolean(query.awbSuffixError) || undefined}
            className="pl-9"
            defaultValue={query.awbSuffix}
            id={id}
            maxLength={24}
            name="q"
            placeholder={placeholder}
            type="search"
          />
        </div>
        {query.awbSuffixError ? <p className="text-xs text-destructive" id={`${id}-error`}>{AWB_SUFFIX_ERROR}</p> : null}
      </div>
      <Button type="submit" variant="outline">Cari</Button>
    </form>
  );
  // PR-87: rows are selected by shipment number; a row without a resi is never listed here.
  // A cancelled resi (T-238) is never selectable.
  const selectable = rows.flatMap((row) => (row.awb && row.status !== "CANCELLED" ? [{ ...row, awb: row.awb, number: Number(shipmentNumberFromReference(row.publicReference)) }] : []));
  // T-266: "Pilih semua belum dicetak" reaches past this page (Server Action, same filter). It is
  // offered on Belum dicetak when the queue is longer than this page, and on Semua whenever any
  // resi is unprinted; Siap diserahkan and Dibatalkan hold none.
  const unprintedTotal = data.summary["LBL-UNPRINTED"];
  const unprintedHere = selectable.filter((row) => row.printCount === 0).length;
  const offerUnprinted = !query.awbSuffixError && unprintedTotal > 0
    && (query.printState === "semua" || (query.printState === "belum" && unprintedTotal > unprintedHere));
  const unprintedParams = { ...carry, ...(query.awbSuffix ? { q: query.awbSuffix } : {}) };

  return (
    <>
      <PageHeader description="Resi yang perlu dicetak dan paket yang menunggu kurir." eyebrow="Pengiriman" title="Cetak resi" />

      <AdjustedFilterAlert issues={rangeIssueMessages(range)} />

      {/* T-263: phones get search + one Filter sheet; the filter row and tiles are from 768px. */}
      <ListFilterSheet
        action="/app/label"
        allHref={query.printState === "semua" ? undefined : allHref}
        allLabel="Tampilkan semua resi"
        clearHref={labelIndexHref({ awbSuffix: query.awbSuffix })}
        count={activeFilterCount({ defaultStatus: DEFAULT_PRINT_STATE, presetId: range.presetId, status: query.printState })}
        hidden={{ q: query.awbSuffix || undefined }}
        options={PRINT_STATE_TILES.map((tile) => ({ count: data.summary[tile.metricId], label: tile.label, value: tile.value }))}
        range={{ endDate: range.lastIncludedDate, presetId: range.presetId, startDate: range.startDate }}
        search={searchForm("q-resi-ponsel", "Akhiran resi")}
        statusLegend="Status cetak"
        statusName="cetak"
        summary={`${selectedTile.label} · ${range.presetId === "kustom" ? periodLabel : presetLabel}`}
        value={query.printState}
      />

      <div className="max-md:hidden">
        <PeriodFilter
          clearHref={labelIndexHref({ awbSuffix: query.awbSuffix, printState: query.printState })}
          hidden={{ cetak: cetakParam, q: query.awbSuffix || undefined }}
          range={range}
        />
      </div>

      <StatusTiles
        className="max-md:hidden"
        label="Ringkasan status cetak resi"
        total={labelTileShareBase(data.summary)}
        tiles={PRINT_STATE_TILES.map((tile) => ({
          count: data.summary[tile.metricId],
          hint: tile.hint,
          href: labelIndexHref({ awbSuffix: query.awbSuffix, printState: tile.value }, carry),
          icon: tile.value === "batal" ? shipmentStatusIcon("CANCELLED") ?? undefined : undefined,
          key: tile.metricId,
          label: tile.label,
          selected: query.printState === tile.value,
          tone: tile.value === "semua" ? undefined : PRINT_STATE_TONE[tile.value],
        }))}
      />

      {/* T-266: picks can reach past this page, so a new filter always starts a new selection. */}
      <BatchSelectionProvider key={labelIndexHref({ awbSuffix: query.awbSuffix, printState: query.printState }, carry)} numbers={selectable.map((row) => row.number)}>
      <Card aria-label="Daftar resi" className="gap-0 py-0 outline-none" id="daftar-resi" role="region" tabIndex={-1}>
        {/* T-266: on phones the toolbar box dissolves (its search lives in the filter sheet); the
            print control inside it is the selection bar, pinned while resi are chosen. */}
        <div className={`flex flex-col gap-3 border-b p-4 md:flex-row md:items-start md:justify-between ${selectable.length > 0 ? "max-md:contents" : "max-md:hidden"}`}>
          <div className="max-md:hidden">{searchForm("q-resi", "Akhiran resi, mis. 123ABC")}</div>
          {selectable.length > 0 ? (
            <div className="flex items-start gap-3 max-md:contents">
              {offerUnprinted ? <SelectUnprintedButton className="max-md:hidden" params={unprintedParams} total={unprintedTotal} /> : null}
              <BatchPrintDialog defaultSize={defaultLabelSize} />
            </div>
          ) : null}
        </div>
        {selectable.length > 0 ? <SelectionNote className="border-b px-4 py-2 text-right max-lg:hidden" /> : null}

        {rows.length === 0 ? (
          <EmptyState
            action={filtered ? (
              <Button asChild variant="outline">
                <Link href={labelIndexHref({ printState: "semua" }, carry)}>Tampilkan semua resi</Link>
              </Button>
            ) : undefined}
            icon={Printer}
            title={query.awbSuffixError
              ? "Akhiran resi tidak dapat dicari."
              : query.printState === "belum" && !query.awbSuffix
                ? "Semua resi pada periode ini sudah dicetak."
                : filtered
                  ? "Tidak ada resi yang cocok dengan filter ini."
                  : "Belum ada resi yang terbit pada periode ini."}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">{selectable.length > 0 ? <SelectPageCheckbox /> : null}</TableHead>
                    <TableHead>Ekspedisi / Resi</TableHead>
                    <TableHead>Terbit</TableHead>
                    <TableHead>Penerima</TableHead>
                    <TableHead>Pembayaran</TableHead>
                    <TableHead>Cetak</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.shipmentId}>
                      <TableCell className="w-10 align-top">
                        {row.awb && row.status !== "CANCELLED" ? <SelectRowCheckbox awb={row.awb} number={Number(shipmentNumberFromReference(row.publicReference))} /> : null}
                      </TableCell>
                      <TableCell className="align-top">
                        <span className="block font-semibold">{carrierText(row.providerService, row.courier)}</span>
                        <Link className={`${idLinkClassName} block text-sm`} href={shipmentLabelHref(row.publicReference)}>{row.awb}</Link>
                        <span className="block font-mono text-xs text-muted-foreground">{row.publicReference}</span>
                      </TableCell>
                      <TableCell className="align-top text-xs">
                        <StackedDateTime value={row.issuedAt} />
                      </TableCell>
                      <TableCell className="max-w-56 align-top whitespace-normal">
                        <span className="block font-semibold wrap-anywhere">{row.recipientName}</span>
                        <span className="block text-xs text-muted-foreground">{areaText(row.destinationAreaLabel)}</span>
                      </TableCell>
                      <TableCell className="align-top text-xs font-medium tabular-nums">
                        {paymentText({ ...row, declaredValueIdr: null })}
                      </TableCell>
                      <TableCell className="align-top">
                        <PrintCountBadge cancelled={row.status === "CANCELLED"} count={row.printCount} />
                      </TableCell>
                      <TableCell className="align-top text-right">
                        {row.status === "CANCELLED" ? (
                          <Button asChild variant="outline">
                            <Link aria-label={`Detail kiriman ${row.publicReference}`} href={shipmentDetailHref(row.publicReference)}>Detail</Link>
                          </Button>
                        ) : (
                          <Button asChild variant="outline">
                            <Link aria-label={`${row.printCount === 0 ? "Cetak" : "Cetak ulang"} label ${row.awb}`} href={shipmentLabelHref(row.publicReference)}>
                              <Printer aria-hidden="true" />
                              {row.printCount === 0 ? "Cetak" : "Cetak ulang"}
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="md:hidden">
              {selectable.length > 0 ? (
                <div className="grid border-b pr-4">
                  <SelectPageCheckbox visibleLabel />
                  {offerUnprinted ? <SelectUnprintedButton className="pb-3 pl-4 *:w-full" params={unprintedParams} total={unprintedTotal} /> : null}
                </div>
              ) : null}
              {/* T-266 (critique #4): dense queue rows — resi + print state, recipient · area, courier
                  logo · payment · issued; the selection is the 44px leading column. */}
              <RecordList label="Daftar resi">
                {rows.map((row) => (
                  <RecordItem
                    dense
                    href={row.status === "CANCELLED" ? shipmentDetailHref(row.publicReference) : shipmentLabelHref(row.publicReference)}
                    key={row.shipmentId}
                    leading={row.awb && row.status !== "CANCELLED" ? <SelectRowCheckbox awb={row.awb} number={Number(shipmentNumberFromReference(row.publicReference))} visibleLabel /> : <span aria-hidden="true" />}
                    meta={<>
                      {row.providerService || row.courier ? <CourierLogo className="h-4 shrink-0" courier={row.providerService ?? row.courier!} /> : null}
                      <span className="truncate tabular-nums">
                        {paymentText({ ...row, declaredValueIdr: null })}
                        {row.issuedAt ? <> · <time dateTime={row.issuedAt.toISOString()}>{formatWibDateTime(row.issuedAt)}</time></> : null}
                      </span>
                    </>}
                    status={<PrintCountBadge cancelled={row.status === "CANCELLED"} count={row.printCount} />}
                    subtitle={<><span className="font-semibold">{row.recipientName}</span> · {areaText(row.destinationAreaLabel)}</>}
                    title={<span className="font-mono">{row.awb}</span>}
                  />
                ))}
              </RecordList>
            </div>
          </>
        )}

        {data.rows.length > 0 ? (
          <ListPagination
            hrefForPage={(target) => labelIndexHref({ awbSuffix: query.awbSuffix, page: target, printState: query.printState }, carry)}
            label="Halaman cetak resi"
            noun={selectedCount > data.rows.length ? "resi terbaru" : "resi"}
            page={page}
            pageSize={LABEL_PAGE_SIZE}
            totalCount={data.rows.length}
            totalPages={totalPages}
          />
        ) : null}
      </Card>
      </BatchSelectionProvider>
    </>
  );
}
