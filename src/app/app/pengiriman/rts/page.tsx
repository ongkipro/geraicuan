import { randomUUID } from "node:crypto";

import { PackageSearch, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FreshnessLine } from "@/app/app/pengiriman/_list/freshness-line";
import { ListPagination } from "@/app/app/pengiriman/_list/list-pagination";
import { AdjustedFilterAlert, PeriodFilter, rangeIssueMessages } from "@/app/app/pengiriman/_list/period-filter";
import {
  areaText,
  carrierText,
  DateTimeText,
  idLinkClassName,
  paymentText,
  RecipientCell,
} from "@/app/app/pengiriman/_list/shipment-cells";
import { StatusPull } from "@/app/app/pengiriman/_list/status-pull";
import { type SearchValue } from "@/app/app/pengiriman/_list/search-params";
import { requireTenantPrincipal } from "@/app/app/pengiriman/_list/tenant-page";
import { parseRtsQuery, RTS_PAGE_SIZE, rtsHref } from "@/app/app/pengiriman/rts/rts-query";
import { pullMengantarStatus } from "@/app/app/pengiriman/status-sync-actions";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { StatusTiles } from "@/components/app/status-tiles";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db/client";
import { loadRtsShipmentsPage, type RtsFilterStatus } from "@/db/rts-repository";
import { withTenantContext } from "@/db/tenant-context";
import { listTenantOutlets } from "@/db/tenant-repository";
import { parseAnalyticsRange, serializeAnalyticsRange } from "@/lib/analytics-range";
import { formatWeight, formatWibDateTime } from "@/lib/label-format";
import { SHIPMENT_STATUS_PRESENTATION, type ShipmentStatus } from "@/lib/shipment-queue";
import { shipmentDetailHref } from "@/lib/shipment-number";

export const metadata: Metadata = { title: "Retur (RTS)", robots: { index: false } };

export default async function RtsPage({ searchParams }: { searchParams: Promise<Record<string, SearchValue>> }) {
  const principal = await requireTenantPrincipal();
  const params = await searchParams;
  const query = parseRtsQuery(params);
  const range = parseAnalyticsRange(params, new Date());
  const carry = Object.fromEntries(serializeAnalyticsRange(range));
  const isAdmin = principal.role === "TENANT_ADMIN";

  const { data, outlets } = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => ({
    data: await loadRtsShipmentsPage(tx, context, { page: query.page, pageSize: RTS_PAGE_SIZE, range, status: query.status }),
    outlets: isAdmin ? await listTenantOutlets(tx, context) : [],
  }));

  const issues = [
    ...rangeIssueMessages(range),
    ...query.issues,
    ...(data.page !== query.page && data.totalCount > 0 ? [`Halaman ${query.page} tidak tersedia; halaman terakhir ditampilkan.`] : []),
  ];

  // Labels come from the shared lifecycle presentation, so a tile and the badge in the row
  // below it can never name one state twice.
  const tiles: { count: number; hint: string; key: RtsFilterStatus; label: string }[] = [
    { count: data.summary.totalRtsCount, hint: "Termasuk kendala", key: "ALL", label: "Semua retur" },
    { count: data.summary.queuedCount, hint: "Tunggu dijemput", key: "RTS_QUEUED", label: SHIPMENT_STATUS_PRESENTATION.RTS_QUEUED.label },
    { count: data.summary.inTransitCount, hint: "Menuju outlet asal", key: "RTS_IN_TRANSIT", label: SHIPMENT_STATUS_PRESENTATION.RTS_IN_TRANSIT.label },
    { count: data.summary.receivedCount, hint: "Sudah di outlet", key: "RTS_RECEIVED", label: SHIPMENT_STATUS_PRESENTATION.RTS_RECEIVED.label },
    { count: data.summary.problemCount, hint: "Laporan kurir", key: "PROBLEM", label: SHIPMENT_STATUS_PRESENTATION.PROBLEM.label },
  ];
  const selected = tiles.find((tile) => tile.key === query.status);
  const freshness = data.basis.observationVisible
    ? data.basis.lastObservedAt
      ? `Status Mengantar diperbarui ${formatWibDateTime(data.basis.lastObservedAt)}`
      : "Status Mengantar belum pernah diperbarui"
    : `Diperbarui ${formatWibDateTime(data.generatedAt)}`;

  return (
    <>
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href={`/app/pengiriman?${new URLSearchParams(carry)}`}>
              <PackageSearch aria-hidden="true" />
              Histori kiriman
            </Link>
          </Button>
        }
        description="Pantau retur, tindak lanjuti kendala kurir, dan cek barang yang kembali ke outlet."
        eyebrow="Pengiriman"
        title="Retur (RTS)"
      />

      <AdjustedFilterAlert issues={issues} />

      <PeriodFilter clearHref={rtsHref(query.status)} hidden={{ status: query.status === "ALL" ? undefined : query.status }} range={range} />

      {/* Five tiles fill one row, as in the reference (StatusTiles lays out six). */}
      <div className="lg:[&>nav>ul]:grid-cols-5">
        <StatusTiles
          label="Ringkasan status retur"
          tiles={tiles.map((tile) => ({ ...tile, href: rtsHref(tile.key, 1, carry), selected: tile.key === query.status }))}
        />
      </div>

      <Card aria-label="Daftar retur" className="gap-0 py-0" role="region">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          {isAdmin ? (
            <StatusPull
              action={pullMengantarStatus}
              attemptId={randomUUID()}
              outlets={outlets}
              range={{ lastIncludedDate: range.lastIncludedDate, presetId: range.presetId, startDate: range.startDate, timezone: range.timezone }}
            />
          ) : null}
          <div className="md:ml-auto">
            <FreshnessLine generatedAtIso={data.generatedAt.toISOString()} key={data.generatedAt.toISOString()} text={freshness} />
          </div>
        </div>

        {data.rows.length === 0 ? (
          <EmptyState
            action={query.status === "ALL" ? undefined : (
              <Button asChild variant="outline">
                <Link href={rtsHref("ALL", 1, carry)}>Tampilkan semua retur</Link>
              </Button>
            )}
            icon={Undo2}
            title={query.status === "ALL" ? "Belum ada retur pada periode ini." : `Tidak ada kiriman berstatus ${selected?.label}.`}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resi / Kiriman</TableHead>
                    <TableHead>Penerima</TableHead>
                    <TableHead>Outlet & kurir</TableHead>
                    <TableHead>Pembayaran & berat</TableHead>
                    <TableHead>Status & waktu</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.shipmentId}>
                      <TableCell className="align-top">
                        <Link className={`${idLinkClassName} break-all`} href={shipmentDetailHref(row.publicReference, carry)}>
                          {row.awb ?? row.publicReference}
                        </Link>
                        {row.awb ? <span className="block font-mono text-xs text-muted-foreground">{row.publicReference}</span> : null}
                      </TableCell>
                      <TableCell className="max-w-52 align-top whitespace-normal">
                        <RecipientCell areaLabel={row.destinationAreaLabel} name={row.recipientName} />
                      </TableCell>
                      <TableCell className="max-w-48 align-top whitespace-normal">
                        <span className="block font-medium">{carrierText(row.providerService) ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground">{row.outletName}</span>
                      </TableCell>
                      <TableCell className="align-top">
                        <span className="block font-semibold tabular-nums">{paymentText(row, " ")}</span>
                        <span className="block text-xs text-muted-foreground">{formatWeight(row.packageWeightGrams)}</span>
                      </TableCell>
                      <TableCell className="align-top">
                        <ShipmentStatusBadge status={row.status as ShipmentStatus} />
                        <span className="mt-1 block text-xs text-muted-foreground">
                          <DateTimeText value={row.latestEventAt ?? row.updatedAt} />
                        </span>
                      </TableCell>
                      <TableCell className="max-w-64 align-top text-xs whitespace-normal text-muted-foreground">
                        {row.latestEventNotes ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="md:hidden">
              <RecordList label="Daftar retur">
                {data.rows.map((row) => (
                  <RecordItem
                    detail={row.latestEventNotes ? <p className="text-xs text-muted-foreground">{row.latestEventNotes}</p> : undefined}
                    href={shipmentDetailHref(row.publicReference, carry)}
                    key={row.shipmentId}
                    meta={<>{carrierText(row.providerService) ?? "—"} · <span className="font-mono">{row.publicReference}</span></>}
                    status={<ShipmentStatusBadge status={row.status as ShipmentStatus} />}
                    subtitle={<span className="font-semibold">{row.recipientName} · {areaText(row.destinationAreaLabel)}</span>}
                    time={<DateTimeText value={row.latestEventAt ?? row.updatedAt} />}
                    title={<span className="font-mono">{row.awb ?? row.publicReference}</span>}
                    value={paymentText(row, " ")}
                  />
                ))}
              </RecordList>
            </div>
          </>
        )}

        {data.totalCount > 0 ? (
          <ListPagination
            hrefForPage={(page) => rtsHref(query.status, page, carry)}
            label="Halaman retur"
            noun="retur"
            page={data.page}
            pageSize={data.pageSize}
            totalCount={data.totalCount}
            totalPages={data.totalPages}
          />
        ) : null}
      </Card>
    </>
  );
}
