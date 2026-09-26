import { randomUUID } from "node:crypto";

import { PackageSearch, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FreshnessLine } from "@/app/app/pengiriman/_list/freshness-line";
import { ListPagination } from "@/app/app/pengiriman/_list/list-pagination";
import { AdjustedFilterAlert, PeriodFilter, rangeIssueMessages } from "@/app/app/pengiriman/_list/period-filter";
import {
  areaText,
  carrierText,
  idLinkClassName,
  paymentText,
} from "@/app/app/pengiriman/_list/shipment-cells";
import { StatusPull } from "@/app/app/pengiriman/_list/status-pull";
import { StatusSelect } from "@/app/app/pengiriman/_list/status-select";
import { type SearchValue } from "@/app/app/pengiriman/_list/search-params";
import { requireTenantPrincipal } from "@/app/app/pengiriman/_list/tenant-page";
import { pullMengantarStatus } from "@/app/app/pengiriman/status-sync-actions";
import { CourierLogo } from "@/components/app/courier-logo";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { ShipmentStatusBadge, shipmentStatusTone } from "@/components/app/status-badge";
import { StatusTiles } from "@/components/app/status-tiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db/client";
import { loadProviderDeliveryStatusBasis } from "@/db/provider-settlement-repository";
import { loadShipmentQueuePage } from "@/db/shipment-queue-repository";
import { withTenantContext } from "@/db/tenant-context";
import { listTenantOutlets } from "@/db/tenant-repository";
import { parseAnalyticsRange, serializeAnalyticsRange } from "@/lib/analytics-range";
import { formatWeight, formatWibDateTime, formatWibDateTimeParts } from "@/lib/label-format";
import {
  isStaleShipmentFilter,
  parseShipmentQueueQuery,
  SHIPMENT_QUEUE_PAGE_SIZE,
  SHIPMENT_QUEUE_SUMMARY_ENTRIES,
  SHIPMENT_STATUS_OPTIONS,
  shipmentQueueHref,
} from "@/lib/shipment-queue";
import { shipmentDetailHref } from "@/lib/shipment-number";

export const metadata: Metadata = { title: "Histori kiriman", robots: { index: false } };

/** One short line per tile (spec 10 §4.6); the full meaning of each status lives on the detail page. */
const TILE_HINTS: Record<(typeof SHIPMENT_QUEUE_SUMMARY_ENTRIES)[number]["metricId"], string> = {
  "QUE-ALL": "Semua tahap",
  "QUE-ATTENTION": "Kendala/pelunasan",
  "QUE-AWAITING-PICKUP": "Tunggu dijemput",
  "QUE-DELIVERED": "Sampai penerima",
  "QUE-IN-TRANSIT": "Sedang diantar",
  "QUE-NEEDS-AWB": "Belum punya resi",
};

export default async function ShipmentHistoryPage({ searchParams }: { searchParams: Promise<Record<string, SearchValue>> }) {
  const principal = await requireTenantPrincipal();
  const params = await searchParams;
  const parsed = parseShipmentQueueQuery(params);
  const range = parseAnalyticsRange(params, new Date());
  const rangeCarry: Record<string, string> = Object.fromEntries(serializeAnalyticsRange(range));
  const carry = parsed.search ? { ...rangeCarry, cari: parsed.search } : rangeCarry;
  const isAdmin = principal.role === "TENANT_ADMIN";
  // T-231: "Tanpa update" reads provider observations, which RLS shows to a Tenant Admin only.
  const query = !isAdmin && isStaleShipmentFilter(parsed.status)
    ? { ...parsed, issues: [...parsed.issues, "Filter tanpa update hanya untuk Pemilik gerai; semua status ditampilkan."], status: "ALL" as const }
    : parsed;
  const statusOptions = isAdmin ? SHIPMENT_STATUS_OPTIONS : SHIPMENT_STATUS_OPTIONS.filter((option) => !isStaleShipmentFilter(option.value));

  const { basis, data, outlets } = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => ({
    data: await loadShipmentQueuePage(tx, context, {
      page: query.page,
      pageSize: SHIPMENT_QUEUE_PAGE_SIZE,
      range,
      search: query.search,
      status: query.status,
    }),
    // PR-73: the pull and its basis are Tenant Admin only (the action and the loader re-check).
    basis: isAdmin ? await loadProviderDeliveryStatusBasis(tx, context) : null,
    outlets: isAdmin ? await listTenantOutlets(tx, context) : [],
  }));

  const issues = [
    ...rangeIssueMessages(range),
    ...query.issues,
    ...(data.page !== query.page && data.totalCount > 0 ? [`Halaman ${query.page} tidak tersedia; halaman terakhir ditampilkan.`] : []),
  ];
  const statusParam = query.status === "ALL" ? undefined : query.status;
  const selectedLabel = statusOptions.find((option) => option.value === query.status)?.label;
  const freshness = basis?.observationVisible
    ? basis.lastObservedAt
      ? `Status Mengantar diperbarui ${formatWibDateTime(basis.lastObservedAt)}`
      : "Status Mengantar belum pernah diperbarui"
    : `Diperbarui ${formatWibDateTime(data.generatedAt)}`;

  return (
    <>
      <PageHeader
        actions={
          <Button asChild>
            <Link href="/app/pengiriman/baru">
              <Plus aria-hidden="true" />
              Buat kiriman
            </Link>
          </Button>
        }
        eyebrow="Pengiriman"
        title="Histori kiriman"
      />

      <AdjustedFilterAlert issues={issues} />

      <PeriodFilter
        clearHref={shipmentQueueHref(query.status)}
        hidden={{ status: statusParam }}
        range={range}
      />

      <StatusTiles
        label="Ringkasan status kiriman"
        tiles={SHIPMENT_QUEUE_SUMMARY_ENTRIES.map((entry) => ({
          count: data.summary[entry.metricId],
          hint: TILE_HINTS[entry.metricId],
          href: shipmentQueueHref(entry.value, 1, carry),
          key: entry.metricId,
          label: entry.label,
          selected: query.status === entry.value,
          tone: entry.value === "NEEDS_ATTENTION" ? "danger" : shipmentStatusTone(entry.value) ?? undefined,
        }))}
      />

      <Card aria-label="Daftar kiriman" className="gap-0 py-0" role="region">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <StatusSelect
            label="Status kiriman"
            options={statusOptions.map((option) => ({
              href: shipmentQueueHref(option.value, 1, carry),
              label: option.label,
              value: option.value,
            }))}
            value={query.status}
          />
          {isAdmin ? (
            <StatusPull
              action={pullMengantarStatus}
              attemptId={randomUUID()}
              outlets={outlets}
              range={{ lastIncludedDate: range.lastIncludedDate, presetId: range.presetId, startDate: range.startDate, timezone: range.timezone }}
            />
          ) : null}
          <form action="/app/pengiriman" className="flex gap-2 max-md:w-full" method="get" role="search">
            {Object.entries(rangeCarry).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
            {statusParam ? <input name="status" type="hidden" value={statusParam} /> : null}
            <label className="sr-only" htmlFor="cari-kiriman">Nomor kiriman atau resi</label>
            <div className="relative min-w-0 flex-1 md:w-64 md:flex-none">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" defaultValue={query.search} id="cari-kiriman" maxLength={40} name="cari" placeholder="Nomor kiriman / resi" type="search" />
            </div>
            <Button type="submit" variant="outline">Cari</Button>
          </form>
          <div className="md:ml-auto">
            <FreshnessLine generatedAtIso={data.generatedAt.toISOString()} key={data.generatedAt.toISOString()} text={freshness} />
          </div>
        </div>

        {data.rows.length === 0 ? (
          <EmptyState
            action={
              <Button asChild variant="outline">
                <Link href={statusParam || query.search ? shipmentQueueHref("ALL", 1, rangeCarry) : "/app/pengiriman/baru"}>
                  {statusParam || query.search ? "Tampilkan semua kiriman" : "Buat kiriman pertama"}
                </Link>
              </Button>
            }
            icon={PackageSearch}
            title={
              query.search
                ? `Tidak ada kiriman dengan nomor atau resi "${query.search}".`
                : statusParam ? `Tidak ada kiriman berstatus ${selectedLabel}.` : "Belum ada kiriman pada periode ini."
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              {/* Spec 10 §4.13: six columns; Ekspedisi/Resi and Aktivitas from lg, Paket from xl. */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Nomor kiriman</TableHead>
                    <TableHead className="w-50">Status / Pembayaran</TableHead>
                    <TableHead>Penerima</TableHead>
                    <TableHead className="hidden w-50 lg:table-cell">Ekspedisi / Resi</TableHead>
                    <TableHead className="hidden w-45 xl:table-cell">Paket</TableHead>
                    <TableHead className="hidden w-35 lg:table-cell">Aktivitas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => {
                    const activity = formatWibDateTimeParts(row.updatedAt);
                    return (
                      <TableRow key={row.shipmentId}>
                        <TableCell className="align-top">
                          <Link className={idLinkClassName} href={shipmentDetailHref(row.publicReference, carry)}>
                            {row.publicReference}
                          </Link>
                          <span className="block text-xs whitespace-normal text-muted-foreground">{row.outletName}</span>
                        </TableCell>
                        <TableCell className="align-top">
                          <ShipmentStatusBadge status={row.status} />
                          <span className="mt-1 block text-xs font-medium tabular-nums">{paymentText(row)}</span>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal">
                          <span className="block font-semibold wrap-anywhere">{row.recipientName}</span>
                          <span className="block text-xs wrap-anywhere text-muted-foreground">{areaText(row.destinationAreaLabel)}</span>
                        </TableCell>
                        <TableCell className="hidden align-top lg:table-cell">
                          {row.providerService ? <CourierLogo className="h-5" courier={row.providerService} /> : null}
                          {row.awb
                            ? <span className="mt-1 block font-mono text-xs break-all text-muted-foreground">{row.awb}</span>
                            : <span className="mt-1 block text-xs text-muted-foreground">Belum ada resi</span>}
                        </TableCell>
                        <TableCell className="hidden align-top whitespace-normal xl:table-cell">
                          <span className="block wrap-anywhere">{row.packageContent}</span>
                          <span className="block text-xs text-muted-foreground">{formatWeight(row.packageWeightGrams)}</span>
                        </TableCell>
                        <TableCell className="hidden align-top lg:table-cell">
                          <time className="block tabular-nums" dateTime={row.updatedAt.toISOString()}>
                            <span className="block text-xs">{activity.date}</span>
                            <span className="block text-xs text-muted-foreground">{activity.time}</span>
                          </time>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="md:hidden">
              <RecordList label="Daftar kiriman">
                {data.rows.map((row) => (
                  <RecordItem
                    href={shipmentDetailHref(row.publicReference, carry)}
                    key={row.shipmentId}
                    meta={<>{carrierText(row.providerService) ?? "Belum memilih kurir"} · {row.awb ? <span className="font-mono">{row.awb}</span> : "Belum ada resi"}</>}
                    status={<ShipmentStatusBadge status={row.status} />}
                    subtitle={<span className="font-semibold">{row.recipientName} · {areaText(row.destinationAreaLabel)}</span>}
                    time={<time dateTime={row.updatedAt.toISOString()}>{formatWibDateTime(row.updatedAt)}</time>}
                    title={<span className="font-mono">{row.publicReference}</span>}
                    value={paymentText(row, " ")}
                  />
                ))}
              </RecordList>
            </div>
          </>
        )}

        {data.totalCount > 0 ? (
          <ListPagination
            hrefForPage={(page) => shipmentQueueHref(query.status, page, carry)}
            label="Halaman histori kiriman"
            noun="kiriman"
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
