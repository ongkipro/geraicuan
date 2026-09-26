import { Printer, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BatchPrintDialog, BatchSelectionProvider, SelectPageCheckbox, SelectRowCheckbox } from "@/app/app/label/batch-selection";
import { AWB_SUFFIX_ERROR, LABEL_PAGE_SIZE, labelIndexHref, labelTileShareBase, parseLabelQuery } from "@/app/app/label/label-query";
import { ListPagination } from "@/app/app/pengiriman/_list/list-pagination";
import { AdjustedFilterAlert, PeriodFilter, rangeIssueMessages } from "@/app/app/pengiriman/_list/period-filter";
import { type SearchValue } from "@/app/app/pengiriman/_list/search-params";
import { areaText, carrierText, idLinkClassName, paymentText, StackedDateTime } from "@/app/app/pengiriman/_list/shipment-cells";
import { requireTenantPrincipal } from "@/app/app/pengiriman/_list/tenant-page";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { ShipmentStatusBadge, shipmentStatusIcon, StatusBadge } from "@/components/app/status-badge";
import { StatusTiles } from "@/components/app/status-tiles";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db/client";
import { loadLabelIndexPage, type LabelIndexPage, type LabelPrintStateFilter } from "@/db/label-print-repository";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantBrand } from "@/db/tenant-settings-repository";
import { parseAnalyticsRange, serializeAnalyticsRange } from "@/lib/analytics-range";
import { formatWibDateTime } from "@/lib/label-format";
import { shipmentDetailHref, shipmentLabelHref, shipmentNumberFromReference } from "@/lib/shipment-number";

export const metadata: Metadata = { title: "Cetak resi", robots: { index: false } };

const PRINT_STATE_TILES = [
  { hint: "Siap dicetak", label: "Semua resi", metricId: "LBL-ALL", value: "semua" },
  { hint: "Perlu dicetak", label: "Belum dicetak", metricId: "LBL-UNPRINTED", value: "belum" },
  { hint: "Minimal sekali", label: "Sudah dicetak", metricId: "LBL-PRINTED", value: "sudah" },
  // T-238 (owner): resi Mengantar cancelled after issuance; listed, never printable.
  { hint: "Tidak dapat dicetak", label: "Dibatalkan", metricId: "LBL-CANCELLED", value: "batal" },
] as const satisfies readonly { hint: string; label: string; metricId: keyof LabelIndexPage["summary"]; value: LabelPrintStateFilter }[];

const EMPTY_PAGE: LabelIndexPage = { rows: [], summary: { "LBL-ALL": 0, "LBL-PRINTED": 0, "LBL-UNPRINTED": 0, "LBL-CANCELLED": 0 } };

function PrintCountBadge({ cancelled, count }: { cancelled?: boolean; count: number }) {
  if (cancelled) return <ShipmentStatusBadge status="CANCELLED" />;
  return count === 0
    ? <StatusBadge label="Belum dicetak" tone="warning" />
    : <StatusBadge icon={Printer} label={`${count}× dicetak`} tone="success" />;
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
  // PR-87: rows are selected by shipment number; a row without a resi is never listed here.
  // A cancelled resi (T-238) is never selectable.
  const selectable = rows.flatMap((row) => (row.awb && row.status !== "CANCELLED" ? [{ ...row, awb: row.awb, number: Number(shipmentNumberFromReference(row.publicReference)) }] : []));

  return (
    <>
      <PageHeader eyebrow="Pengiriman" title="Cetak resi" />

      <AdjustedFilterAlert issues={rangeIssueMessages(range)} />

      <PeriodFilter
        clearHref={labelIndexHref({ awbSuffix: query.awbSuffix, printState: query.printState })}
        hidden={{ cetak: query.printState === "semua" ? undefined : query.printState, q: query.awbSuffix || undefined }}
        range={range}
      />

      <StatusTiles
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
        }))}
      />

      <BatchSelectionProvider numbers={selectable.map((row) => row.number)}>
      <Card aria-label="Daftar resi" className="gap-0 py-0" role="region">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-start md:justify-between">
          <form action="/app/label" className="flex items-start gap-3" method="get" role="search">
            {Object.entries(carry).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
            {query.printState !== "semua" ? <input name="cetak" type="hidden" value={query.printState} /> : null}
            <div className="grid min-w-0 flex-1 gap-1 sm:w-72 sm:flex-none">
              <label className="sr-only" htmlFor="q-resi">Akhiran nomor resi</label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-describedby={query.awbSuffixError ? "q-resi-error" : undefined}
                  aria-invalid={Boolean(query.awbSuffixError) || undefined}
                  className="pl-9"
                  defaultValue={query.awbSuffix}
                  id="q-resi"
                  maxLength={24}
                  name="q"
                  placeholder="Akhiran resi, mis. 123ABC"
                  type="search"
                />
              </div>
              {query.awbSuffixError ? <p className="text-xs text-destructive" id="q-resi-error">{AWB_SUFFIX_ERROR}</p> : null}
            </div>
            <Button type="submit" variant="outline">Cari</Button>
          </form>
          {selectable.length > 0 ? <BatchPrintDialog defaultSize={defaultLabelSize} /> : null}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            action={filtered ? (
              <Button asChild variant="outline">
                <Link href={labelIndexHref({}, carry)}>Tampilkan semua resi</Link>
              </Button>
            ) : undefined}
            icon={Printer}
            title={query.awbSuffixError
              ? "Akhiran resi tidak dapat dicari."
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
              {selectable.length > 0 ? <div className="border-b px-4 py-1"><SelectPageCheckbox visibleLabel /></div> : null}
              <RecordList label="Daftar resi">
                {rows.map((row) => (
                  <RecordItem
                    detail={row.awb && row.status !== "CANCELLED" ? <SelectRowCheckbox awb={row.awb} number={Number(shipmentNumberFromReference(row.publicReference))} visibleLabel /> : undefined}
                    href={row.status === "CANCELLED" ? shipmentDetailHref(row.publicReference) : shipmentLabelHref(row.publicReference)}
                    key={row.shipmentId}
                    meta={<>{carrierText(row.providerService, row.courier)} · <span className="font-mono">{row.publicReference}</span></>}
                    status={<PrintCountBadge cancelled={row.status === "CANCELLED"} count={row.printCount} />}
                    subtitle={<span className="font-semibold">{row.recipientName} · {areaText(row.destinationAreaLabel)}</span>}
                    time={row.issuedAt ? <time dateTime={row.issuedAt.toISOString()}>{formatWibDateTime(row.issuedAt)}</time> : "—"}
                    title={<span className="font-mono">{row.awb}</span>}
                    value={paymentText({ ...row, declaredValueIdr: null }, " ")}
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
