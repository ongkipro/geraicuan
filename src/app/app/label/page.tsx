import { Clock, Handshake, Printer, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BatchPrintDialog, BatchSelectionProvider, SelectionNote, SelectPageCheckbox, SelectRowCheckbox, SelectUnprintedButton } from "@/app/app/label/batch-selection";
import { HandoverDialog, HandoverNotice, HandoverScanField, SelectReadyButton } from "@/app/app/label/handover-dialog";
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
import { loadLabelIndexPage, type LabelIndexPage, type LabelPrintStateFilter, type PrintableShipmentRow } from "@/db/label-print-repository";
import { countHandedOverToday } from "@/db/shipment-handover-repository";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantBrand } from "@/db/tenant-settings-repository";
import { formatRangeLabel, parseAnalyticsRange, serializeAnalyticsRange } from "@/lib/analytics-range";
import { formatWibDateTime } from "@/lib/label-format";
import { printStateIgnoresPeriod } from "@/lib/label-queue";
import { formatRelativeAge } from "@/lib/relative-age";
import { formatHandoverTime } from "@/lib/shipment-handover";
import { shipmentDetailHref, shipmentLabelHref, shipmentNumberFromReference } from "@/lib/shipment-number";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Cetak resi", robots: { index: false } };

// T-270 (owner 2026-10-01): Belum dicetak, Siap diserahkan and Diserahkan are work queues — every
// parcel in that state, whatever the period; Semua resi and Dibatalkan are history in the period.
const PRINT_STATE_TILES = [
  { hint: "Terbit pada periode ini", label: "Semua resi", metricId: "LBL-ALL", value: "semua" },
  { hint: "Perlu dicetak, semua tanggal", label: "Belum dicetak", metricId: "LBL-UNPRINTED", value: "belum" },
  // T-263 (owner 2026-09-30): printed and still "Resi terbit", waiting at the counter.
  // T-267: and no handover recorded — "Tandai sudah diserahkan" empties it.
  { hint: "Sudah dicetak, belum diserahkan, semua tanggal", label: "Siap diserahkan", metricId: "LBL-PRINTED", value: "sudah" },
  // T-267: handed over, still ISSUED until Mengantar reports the courier's pickup scan (→ IN_TRANSIT).
  { hint: "Menunggu scan kurir, semua tanggal", label: "Diserahkan", metricId: "LBL-HANDED-OVER", value: "diserahkan" },
  // T-238 (owner): resi Mengantar cancelled after issuance; listed, never printable.
  { hint: "Tidak dapat dicetak, terbit pada periode ini", label: "Dibatalkan", metricId: "LBL-CANCELLED", value: "batal" },
] as const satisfies readonly { hint: string; label: string; metricId: keyof LabelIndexPage["summary"]; value: LabelPrintStateFilter }[];

const EMPTY_PAGE: LabelIndexPage = {
  rows: [],
  summary: { "LBL-ALL": 0, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 0, "LBL-PRINTED": 0, "LBL-READY-PENDING": 0, "LBL-READY-TODAY": 0, "LBL-UNPRINTED": 0 },
};

/**
 * T-270: how long a Siap diserahkan parcel has waited since its first print — "dicetak 3 hari lalu"
 * (the shared `formatRelativeAge`), or the WIB date past 29 days.
 */
function WaitingAge({ now, row }: { now: Date; row: Pick<PrintableShipmentRow, "firstPrintedAt" | "printedToday"> }) {
  if (!row.firstPrintedAt) return null;
  const age = formatRelativeAge(row.firstPrintedAt, now, 29);
  return (
    <span className={cn("tabular-nums", !row.printedToday && "font-medium text-warn")} data-slot="waiting-age">
      dicetak <time dateTime={row.firstPrintedAt.toISOString()}>{age ?? formatWibDateTime(row.firstPrintedAt)}</time>
    </span>
  );
}

/** T-270: Siap diserahkan's two groups; Tertunda (printed before today, WIB) in the warn tone. */
const READY_GROUPS = [
  { key: "today", label: "Hari ini", metricId: "LBL-READY-TODAY" },
  { key: "pending", label: "Tertunda", metricId: "LBL-READY-PENDING" },
] as const;

function ReadyGroupHeading({ count, group }: { count: number; group: (typeof READY_GROUPS)[number] }) {
  const pending = group.key === "pending";
  return (
    <span className={cn("flex items-center gap-2 text-sm font-semibold", pending ? "text-warn" : "text-foreground")}>
      {pending ? <Clock aria-hidden="true" className="size-4" /> : null}
      {group.label}
      <span className="font-normal tabular-nums" data-metric-id={group.metricId}>({count})</span>
      <span className="text-xs font-normal text-muted-foreground">{pending ? "dicetak sebelum hari ini, belum diserahkan" : "dicetak hari ini"}</span>
    </span>
  );
}

function PrintCountBadge({ cancelled, count, handedOverAt }: { cancelled?: boolean; count: number; handedOverAt?: Date | null }) {
  if (cancelled) return <ShipmentStatusBadge status="CANCELLED" />;
  // T-267: the sub-state "Diserahkan · menunggu scan kurir" until Mengantar reports the pickup.
  if (handedOverAt) return <StatusBadge icon={Handshake} label="Diserahkan" tone={PRINT_STATE_TONE.diserahkan} />;
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

  // T-267: the closing moment. "Siap diserahkan" emptied (no suffix filter) → count the parcels
  // handed over today (LBL-HANDED-OVER-TODAY); an empty day is never celebrated. T-270: the queue has
  // no period, so an empty queue means nothing printed is waiting at all, and "Semua paket hari ini
  // sudah diserahkan" is true exactly when at least one handover was recorded today.
  const handoverQueue = query.printState === "sudah";
  const queueTab = printStateIgnoresPeriod(query.printState);
  const now = new Date();
  const readyQueueEmpty = handoverQueue && !query.awbSuffix && !query.awbSuffixError && data.summary["LBL-PRINTED"] === 0;
  const handedOverToday = readyQueueEmpty
    ? await withTenantContext(db, principal.userId, principal.tenantId, countHandedOverToday)
    : 0;

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
  // T-267 "Pilih semua siap diserahkan (N)": on Siap diserahkan when the queue is longer than this page.
  const readyTotal = data.summary["LBL-PRINTED"];
  const offerReady = handoverQueue && !query.awbSuffixError && readyTotal > selectable.length;
  const handedOverTab = query.printState === "diserahkan";
  // T-270: Siap diserahkan groups this page's rows by first print — Hari ini, then Tertunda (the
  // repository orders them so); the headers carry the whole queue's counts (LBL-READY-*).
  const groups = handoverQueue
    ? READY_GROUPS.flatMap((group) => {
      const groupRows = rows.filter((row) => row.printedToday === (group.key === "today"));
      return groupRows.length > 0
        ? [{ heading: <ReadyGroupHeading count={data.summary[group.metricId]} group={group} />, key: group.key, label: group.label, rows: groupRows }]
        : [];
    })
    : [{ heading: null, key: null, label: null, rows }];

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
        summary={`${selectedTile.label} · ${queueTab ? "semua tanggal" : range.presetId === "kustom" ? periodLabel : presetLabel}`}
        value={query.printState}
      />

      <div className="max-md:hidden">
        <PeriodFilter
          clearHref={labelIndexHref({ awbSuffix: query.awbSuffix, printState: query.printState })}
          hidden={{ cetak: cetakParam, q: query.awbSuffix || undefined }}
          range={range}
        />
      </div>

      {/* T-270: say which tabs the period governs, where the queue ignores it. */}
      {queueTab ? (
        <p className="-mt-2 text-sm text-muted-foreground" data-slot="queue-period-note">
          <b className="font-semibold text-foreground">{selectedTile.label}</b> memuat semua paket yang masih menunggu, berapa pun tanggalnya. Periode hanya berlaku untuk Semua resi dan Dibatalkan.
        </p>
      ) : null}

      <StatusTiles
        className="max-md:hidden"
        label="Ringkasan status cetak resi"
        total={labelTileShareBase(data.summary)}
        tiles={PRINT_STATE_TILES.map((tile) => ({
          count: data.summary[tile.metricId],
          hint: tile.hint,
          href: labelIndexHref({ awbSuffix: query.awbSuffix, printState: tile.value }, carry),
          icon: tile.value === "batal" ? shipmentStatusIcon("CANCELLED") ?? undefined : tile.value === "diserahkan" ? Handshake : undefined,
          key: tile.metricId,
          label: tile.label,
          selected: query.printState === tile.value,
          // T-270: Dibatalkan follows the period, the share base (the three queues) does not.
          share: tile.value !== "batal",
          tone: tile.value === "semua" ? undefined : PRINT_STATE_TONE[tile.value],
        }))}
      />

      {/* T-266: picks can reach past this page, so a new filter always starts a new selection. */}
      <BatchSelectionProvider
        awbs={Object.fromEntries(selectable.map((row) => [row.number, row.awb]))}
        key={labelIndexHref({ awbSuffix: query.awbSuffix, printState: query.printState }, carry)}
        numbers={selectable.map((row) => row.number)}
        types={Object.fromEntries(selectable.map((row) => [row.number, row.handoverType]))}
      >
      <Card aria-label="Daftar resi" className="gap-0 py-0 outline-none" id="daftar-resi" role="region" tabIndex={-1}>
        <HandoverNotice />
        {/* T-270: scan to select for handover — only on the handover queue. */}
        {handoverQueue && !query.awbSuffixError ? <HandoverScanField /> : null}
        {/* T-266: on phones the toolbar box dissolves (its search lives in the filter sheet); the
            print control inside it is the selection bar, pinned while resi are chosen. */}
        <div className={`flex flex-col gap-3 border-b p-4 md:flex-row md:items-start md:justify-between ${selectable.length > 0 ? "max-md:contents" : "max-md:hidden"}`}>
          <div className="max-md:hidden">{searchForm("q-resi", "Akhiran resi, mis. 123ABC")}</div>
          {selectable.length > 0 ? (
            <div className="flex items-start gap-3 max-md:contents">
              {offerUnprinted ? <SelectUnprintedButton className="max-md:hidden" params={unprintedParams} total={unprintedTotal} /> : null}
              {offerReady ? <SelectReadyButton className="max-md:hidden" params={unprintedParams} total={readyTotal} /> : null}
              {/* T-267: the handover queue's bar records the handover; every other tab's prints. */}
              {handoverQueue ? <HandoverDialog /> : <BatchPrintDialog defaultSize={defaultLabelSize} />}
            </div>
          ) : null}
        </div>
        {selectable.length > 0 ? <SelectionNote className="border-b px-4 py-2 text-right max-lg:hidden" /> : null}

        {rows.length === 0 && readyQueueEmpty && handedOverToday > 0 ? (
          <EmptyState
            action={(
              <Button asChild variant="outline">
                <Link href={labelIndexHref({ printState: "diserahkan" }, carry)}>Lihat yang diserahkan</Link>
              </Button>
            )}
            description={<><span className="tabular-nums" data-metric-id="LBL-HANDED-OVER-TODAY">{handedOverToday}</span> paket diserahkan hari ini. Paket keluar dari daftar setelah Mengantar mencatat scan kurir.</>}
            icon={Handshake}
            title="Semua paket hari ini sudah diserahkan"
          />
        ) : rows.length === 0 ? (
          <EmptyState
            action={filtered ? (
              <Button asChild variant="outline">
                <Link href={labelIndexHref({ printState: "semua" }, carry)}>Tampilkan semua resi</Link>
              </Button>
            ) : undefined}
            icon={handoverQueue || handedOverTab ? Handshake : Printer}
            title={query.awbSuffixError
              ? "Akhiran resi tidak dapat dicari."
              : query.printState === "belum" && !query.awbSuffix
                ? "Semua resi sudah dicetak."
                : readyQueueEmpty
                  ? "Belum ada paket yang siap diserahkan."
                  : handedOverTab && !query.awbSuffix
                    ? "Tidak ada paket yang menunggu scan kurir."
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
                {groups.map((group) => (
                  <TableBody data-group={group.key ?? undefined} key={group.key ?? "all"}>
                    {group.heading ? (
                      <TableRow className={cn("hover:bg-transparent", group.key === "pending" ? "bg-warn-surface/60 hover:bg-warn-surface/60" : "bg-muted/40 hover:bg-muted/40")}>
                        <th className="px-4 py-2 text-left" colSpan={7} scope="colgroup">{group.heading}</th>
                      </TableRow>
                    ) : null}
                    {group.rows.map((row) => (
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
                          <PrintCountBadge cancelled={row.status === "CANCELLED"} count={row.printCount} handedOverAt={row.handedOverAt} />
                          {row.handedOverAt ? (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              <time className="tabular-nums" dateTime={row.handedOverAt.toISOString()}>{formatHandoverTime(row.handedOverAt)}</time> · menunggu scan kurir
                            </span>
                          ) : handoverQueue ? (
                            <span className="mt-1 block text-xs text-muted-foreground"><WaitingAge now={now} row={row} /></span>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          {row.status === "CANCELLED" || (handedOverTab && row.handedOverAt) ? (
                            <Button asChild variant="outline">
                              <Link aria-label={`Detail kiriman ${row.publicReference}`} href={shipmentDetailHref(row.publicReference)}>Detail</Link>
                            </Button>
                          ) : handoverQueue ? (
                            // T-270 (critique 2026-09-30 P2): on the handover queue, reprint is a quiet
                            // named icon action; the row's job here is to be handed over.
                            <Button asChild size="icon" title={`Cetak ulang label ${row.awb}`} variant="ghost">
                              <Link aria-label={`Cetak ulang label ${row.awb}`} href={shipmentLabelHref(row.publicReference)}>
                                <Printer aria-hidden="true" />
                              </Link>
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
                ))}
              </Table>
            </div>
            <div className="md:hidden">
              {selectable.length > 0 ? (
                <div className="grid border-b pr-4">
                  <SelectPageCheckbox visibleLabel />
                  {offerUnprinted ? <SelectUnprintedButton className="pb-3 pl-4 *:w-full" params={unprintedParams} total={unprintedTotal} /> : null}
                  {offerReady ? <SelectReadyButton className="pb-3 pl-4 *:w-full" params={unprintedParams} total={readyTotal} /> : null}
                </div>
              ) : null}
              {/* T-266 (critique #4): dense queue rows — resi + print state, recipient · area, courier
                  logo · payment · issued; the selection is the 44px leading column. T-270: on
                  Siap diserahkan, grouped (Hari ini / Tertunda) with the waiting age. */}
              {groups.map((group) => (
                <section aria-label={group.label ?? undefined} data-group={group.key ?? undefined} key={group.key ?? "all"}>
                  {group.heading ? (
                    <h2 className={cn("border-b px-4 py-2", group.key === "pending" ? "bg-warn-surface/60" : "bg-muted/40")}>{group.heading}</h2>
                  ) : null}
                  <RecordList label={group.label ? `Daftar resi ${group.label.toLowerCase()}` : "Daftar resi"}>
                    {group.rows.map((row) => (
                      <RecordItem
                        dense
                        href={row.status === "CANCELLED" || (handedOverTab && row.handedOverAt) ? shipmentDetailHref(row.publicReference) : shipmentLabelHref(row.publicReference)}
                        key={row.shipmentId}
                        leading={row.awb && row.status !== "CANCELLED" ? <SelectRowCheckbox awb={row.awb} number={Number(shipmentNumberFromReference(row.publicReference))} visibleLabel /> : <span aria-hidden="true" />}
                        meta={<>
                          {row.providerService || row.courier ? <CourierLogo className="h-4 shrink-0" courier={row.providerService ?? row.courier!} /> : null}
                          <span className="truncate tabular-nums">
                            {paymentText({ ...row, declaredValueIdr: null })}
                            {row.handedOverAt
                              ? <> · diserahkan <time dateTime={row.handedOverAt.toISOString()}>{formatHandoverTime(row.handedOverAt)}</time></>
                              : handoverQueue && row.firstPrintedAt ? <> · <WaitingAge now={now} row={row} /></>
                              : row.issuedAt ? <> · <time dateTime={row.issuedAt.toISOString()}>{formatWibDateTime(row.issuedAt)}</time></> : null}
                          </span>
                        </>}
                        status={<PrintCountBadge cancelled={row.status === "CANCELLED"} count={row.printCount} handedOverAt={row.handedOverAt} />}
                        subtitle={<><span className="font-semibold">{row.recipientName}</span> · {areaText(row.destinationAreaLabel)}</>}
                        title={<span className="font-mono">{row.awb}</span>}
                      />
                    ))}
                  </RecordList>
                </section>
              ))}
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
