import { randomUUID } from "node:crypto";

import { ArrowRight, ChevronDown, PackageSearch } from "lucide-react";
import { PaymentStack, RecipientStack, shipmentIdLinkClassName, ShipmentRecordItem, StackedDateTime } from "@/components/cms/shipment-table-cells";
import { shipmentDetailHref } from "@/lib/shipment-number";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTablePagination } from "@/components/cms/data-table-pagination";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { RangeFilterForm } from "@/components/cms/range-filter-form";
import { desktopTableClassName, RecordList } from "@/components/cms/record-list";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { StateSummaryPanel } from "@/components/cms/state-summary-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db/client";
import {
  loadRtsShipmentsPage,
  type RtsFilterStatus,
} from "@/db/rts-repository";
import { withTenantContext } from "@/db/tenant-context";
import { listTenantOutlets } from "@/db/tenant-repository";
import { MengantarStatusPull } from "@/app/app/pengiriman/mengantar-status-pull";
import { pullMengantarStatus } from "@/app/app/pengiriman/status-sync-actions";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { formatRangeLabel, parseAnalyticsRange, serializeAnalyticsRange } from "@/lib/analytics-range";
import { formatWeight, formatWibDateTime } from "@/lib/label-format";
import { serviceDisplayName } from "@/lib/labels/courier";
import { providerDeliveryBasisSentence } from "@/lib/provider-delivery-status";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import {
  parseUiAuditScenarioForRoute,
  UI_AUDIT_HEADER,
} from "@/lib/ui-audit-scenario";

export const metadata: Metadata = {
  title: "Retur (RTS) · GeraiCUAN",
  robots: { index: false },
};

/** The table sits inside the list card, so its scroll region keeps only the focus ring (spec 10 §1.6). */
const inCardTableRegionClassName = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

type SearchValue = string | string[] | undefined;
type RtsPageProps = {
  searchParams: Promise<Record<string, SearchValue>>;
};

async function requireTenantPrincipal() {
  try {
    const principal = await requireCmsScope("tenant");
    if (principal.scope !== "tenant") redirect("/login/tenant");
    return principal;
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
}

type RtsQuery = { issues: string[]; page: number; status: RtsFilterStatus };

function parseRtsQuery(input: { page?: SearchValue; status?: SearchValue }): RtsQuery {
  const issues: string[] = [];

  const requestedStatus = Array.isArray(input.status) ? input.status[0] : input.status;
  let status: RtsFilterStatus = "ALL";
  if (requestedStatus && requestedStatus !== "ALL") {
    if (
      requestedStatus === "RTS_QUEUED" ||
      requestedStatus === "RTS_IN_TRANSIT" ||
      requestedStatus === "RTS_RECEIVED" ||
      requestedStatus === "PROBLEM"
    ) {
      status = requestedStatus;
    } else {
      issues.push(`Status "${requestedStatus}" tidak dikenal; seluruh retur ditampilkan.`);
    }
  }

  const requestedPage = Array.isArray(input.page) ? input.page[0] : input.page;
  let page = 1;
  if (requestedPage) {
    const parsed = Number.parseInt(requestedPage, 10);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      page = parsed;
    } else {
      issues.push(`Halaman "${requestedPage}" tidak valid; halaman pertama ditampilkan.`);
    }
  }

  return { issues, page, status };
}

const RTS_PAGE_SIZE = 20;

/** `carry` is the PR-53 range URL state, kept across a status change or a page turn. */
function rtsHref(status: RtsFilterStatus, page: number, carry?: Readonly<Record<string, string>>): string {
  const params = new URLSearchParams(carry ?? {});
  params.delete("status");
  params.delete("page");
  if (status !== "ALL") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/app/pengiriman/rts${query ? `?${query}` : ""}`;
}

function delayResult<T>(promise: Promise<T>, delayMs: number) {
  return promise.then((value) => new Promise<T>((resolve) => {
    setTimeout(() => resolve(value), delayMs);
  }));
}

export default async function RtsDashboardPage({ searchParams }: RtsPageProps) {
  const principal = await requireTenantPrincipal();
  const params = await searchParams;
  const query = parseRtsQuery(params);
  const now = new Date();
  const range = parseAnalyticsRange(params, now);
  const carry = Object.fromEntries(serializeAnalyticsRange(range));
  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/pengiriman/rts")
    : null;
  if (auditScenario === "shipment-rts-error") {
    throw new Error("Intentional development-only RTS dashboard failure.");
  }
  const statusFilter = auditScenario === "shipment-rts-filtered-empty"
    ? "RTS_RECEIVED"
    : query.status;
  const pageSize = auditScenario === "shipment-rts-paginated" ? 5 : RTS_PAGE_SIZE;

  let dataPromise = withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) =>
      loadRtsShipmentsPage(tx, context, {
        page: query.page,
        pageSize,
        range,
        status: statusFilter,
      }),
  );
  if (auditScenario === "shipment-rts-stream") dataPromise = delayResult(dataPromise, 1_200);
  const loadedData = await dataPromise;
  // T-204: the status pull moved here from Keuangan; Tenant Admin only, as before.
  const pullOutlets = principal.role === "TENANT_ADMIN"
    ? await withTenantContext(db, principal.userId, principal.tenantId, listTenantOutlets)
    : [];
  const data = auditScenario === "shipment-rts-empty" || auditScenario === "shipment-rts-filtered-empty"
    ? { ...loadedData, page: 1, rows: [], totalCount: 0, totalPages: 1 }
    : loadedData;

  const issues = [
    ...query.issues,
    ...(auditScenario === "shipment-rts-invalid-query"
      ? ['Status "TIDAK_ADA" tidak dikenal; seluruh retur ditampilkan.']
      : []),
    ...(data.page !== query.page && data.totalCount > 0
      ? [`Halaman ${query.page} tidak tersedia; halaman terakhir ditampilkan.`]
      : []),
  ];

  // Labels come from the shared lifecycle presentation, not a second copy: the
  // status badge in this same table reads from there, and two vocabularies for
  // one status is what this page used to show.
  //
  // T-203: each entry's description is a few words (spec 10 §6 StateSummaryPanel);
  // the full guidance stays with the status on the detail page.
  //
  // PR-52 names four entries; the provider-problem cohort stays as a fifth
  // because the repository already returns those rows inside "Semua retur" and
  // dropping the entry would leave that cohort visible but unfilterable.
  const filterTabs: {
    key: RtsFilterStatus;
    label: string;
    count: number;
    description: string;
    metricId: string;
  }[] = [
    {
      key: "ALL",
      label: "Semua retur",
      count: data.summary.totalRtsCount,
      description: "Termasuk kendala",
      metricId: "RTS-ALL",
    },
    {
      key: "RTS_QUEUED",
      label: SHIPMENT_STATUS_PRESENTATION.RTS_QUEUED.label,
      count: data.summary.queuedCount,
      description: "Tunggu dijemput",
      metricId: "RTS-QUEUED",
    },
    {
      key: "RTS_IN_TRANSIT",
      label: SHIPMENT_STATUS_PRESENTATION.RTS_IN_TRANSIT.label,
      count: data.summary.inTransitCount,
      description: "Menuju outlet asal",
      metricId: "RTS-IN-TRANSIT",
    },
    {
      key: "RTS_RECEIVED",
      label: SHIPMENT_STATUS_PRESENTATION.RTS_RECEIVED.label,
      count: data.summary.receivedCount,
      description: "Sudah di outlet",
      metricId: "RTS-RECEIVED",
    },
    {
      key: "PROBLEM",
      label: SHIPMENT_STATUS_PRESENTATION.PROBLEM.label,
      count: data.summary.problemCount,
      description: "Laporan kurir",
      metricId: "RTS-PROBLEM",
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="/app/pengiriman">
              <PackageSearch aria-hidden="true" />
              Histori kiriman
            </Link>
          </Button>
        }
        description="Pantau retur, tindak lanjuti kendala kurir, dan cek barang yang kembali ke outlet."
        eyebrow="Pengiriman"
        focusTargetId="rts-dashboard-heading"
        title="Retur (RTS)"
      />

      {issues.length > 0 ? (
        <Alert>
          <AlertTitle>Filter disesuaikan</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="rts-queue-heading" className="grid min-w-0 gap-4">
        <div className="sr-only">
          <h2 id="rts-queue-heading">Antrean retur</h2>
          <p>Pilih status untuk menindaklanjuti paket.</p>
        </div>

        <RangeFilterForm action="/app/pengiriman/rts" idPrefix="rts" now={now} preserved={{ status: statusFilter === "ALL" ? undefined : statusFilter }} range={range} />

        {pullOutlets.length > 0 ? (
          <MengantarStatusPull
            action={pullMengantarStatus}
            attemptId={randomUUID()}
            idPrefix="rts"
            outlets={pullOutlets}
            periodLabel={formatRangeLabel(range).periodLabel}
            range={{ presetId: range.presetId, timezone: range.timezone, startDate: range.startDate, lastIncludedDate: range.lastIncludedDate }}
          />
        ) : null}

        {/* No Reset link: "Semua retur" is the clear, and a second control for
            it would be a duplicate action. Each count is printed once, inside
            the entry that applies it. */}
        <StateSummaryPanel
          action="/app/pengiriman/rts"
          entries={filterTabs.map((tab) => ({
            count: tab.count,
            description: tab.description,
            label: tab.label,
            metricId: tab.metricId,
            value: tab.key,
          }))}
          label="Ringkasan status retur"
          param="status"
          preserved={carry}
          selected={statusFilter}
        />

        {/* T-206 reference: the records and the pagination share one bordered card. */}
        <Card className="min-w-0 gap-0 py-0">
        {/* PR-57: these states are Mengantar's report, applied when a Tenant
            Admin pulls provider data, so the queue says what feeds it and how
            far behind it may be rather than reading as live courier truth.
            T-206: the short fact leads the card; the full sentence is one click away. */}
        <details className="group border-b px-4 py-2 text-sm text-muted-foreground">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 [&::-webkit-details-marker]:hidden">
            {data.basis.observationVisible && data.basis.lastObservedAt
              ? `Status dari Mengantar · diperbarui ${formatWibDateTime(data.basis.lastObservedAt)}`
              : "Status dari Mengantar"}
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <p className="max-w-2xl pb-2">
            {providerDeliveryBasisSentence({
              formattedObservedAt: data.basis.lastObservedAt ? formatWibDateTime(data.basis.lastObservedAt) : null,
              observationVisible: data.basis.observationVisible,
              subject: "Status retur",
            })}
          </p>
        </details>
        {data.rows.length === 0 ? (
          <EmptyState
            description={
              statusFilter === "ALL"
                ? "Belum ada riwayat kiriman retur atau gagal serah yang tercatat."
                : `Tidak ada kiriman pada status ${filterTabs.find((t) => t.key === statusFilter)?.label}.`
            }
            icon={PackageSearch}
            title="Tidak ada kiriman retur"
          />
        ) : (
          <>
          <RecordList className="rounded-none border-0" label="Daftar kiriman retur">
            {data.rows.map((row) => (
              <ShipmentRecordItem
                areaLabel={row.destinationAreaLabel}
                at={row.updatedAt}
                awb={row.awb}
                href={shipmentDetailHref(row.publicReference)}
                key={row.shipmentId}
                payment={row}
                recipientName={row.recipientName}
                reference={row.publicReference}
                service={row.providerService}
                status={SHIPMENT_STATUS_PRESENTATION[row.status as keyof typeof SHIPMENT_STATUS_PRESENTATION] ?? { label: row.status, tone: "neutral" }}
              />
            ))}
          </RecordList>
          <Table
            className="min-w-[60rem]"
            containerClassName={`${inCardTableRegionClassName} ${desktopTableClassName}`}
            containerProps={{
              "aria-label": "Daftar kiriman retur; geser horizontal untuk melihat seluruh kolom",
              role: "region",
              tabIndex: 0,
            }}
          >
            <TableCaption className="sr-only">
              Daftar kiriman retur (RTS) dan detail statusnya.
            </TableCaption>
            <TableHeader>
              <TableRow>
                {/* The identifying column stays put while the other
                    six scroll under it, and is opaque so the scrolled
                    content does not read through — the same treatment the
                    shipment queue gives its reference column. */}
                <TableHead className="sticky left-0 z-10 min-w-36">Resi</TableHead>
                <TableHead className="min-w-36">Penerima</TableHead>
                <TableHead className="min-w-30">Outlet & Kurir</TableHead>
                <TableHead className="min-w-30">Pembayaran & Berat</TableHead>
                {/* Status and its update time share a column so the table fits 1440 without scrolling. */}
                <TableHead className="min-w-32">Status & Waktu</TableHead>
                <TableHead className="min-w-40">Catatan / Kejadian</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => {
                const statusMeta =
                  SHIPMENT_STATUS_PRESENTATION[row.status as keyof typeof SHIPMENT_STATUS_PRESENTATION] ?? {
                    label: row.status,
                    tone: "neutral" as const,
                    guidance: "",
                  };

                return (
                  <TableRow key={row.shipmentId}>
                    <TableCell className="sticky left-0 z-10 max-w-40 whitespace-normal bg-inherit">
                      <Link
                        className={`flex min-h-11 max-w-40 items-center break-all md:min-h-8 ${shipmentIdLinkClassName}`}
                        href={shipmentDetailHref(row.publicReference)}
                      >
                        {row.awb ? row.awb : row.publicReference}
                      </Link>

                    </TableCell>
                    {/* Names and outlets wrap within a ceiling so the table fits 1440 without scrolling. */}
                    <TableCell className="max-w-48 whitespace-normal">
                      <RecipientStack areaLabel={row.destinationAreaLabel} name={row.recipientName} phone={row.recipientPhone} />
                    </TableCell>
                    <TableCell className="max-w-48 whitespace-normal">
                      <div className="text-xs">{row.outletName}</div>
                      {row.providerService ? (
                        <div className="text-xs text-muted-foreground">
                          {serviceDisplayName(row.providerService)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <PaymentStack className="block text-xs [&>span:first-child]:font-semibold" facts={row} />
                      <div className="text-xs text-muted-foreground">
                        {formatWeight(row.packageWeightGrams)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ShipmentStatusBadge
                        label={statusMeta.label}
                        tone={statusMeta.tone}
                      />
                      <div className="mt-1 text-xs">
                        <StackedDateTime value={row.updatedAt} />
                      </div>
                    </TableCell>
                    {/* TableCell is nowrap; a clamped note must wrap or it
                        stretches the column and the table scrolls at 1440. */}
                    <TableCell className="min-w-40 max-w-64 whitespace-normal wrap-break-word">
                      {row.latestEventNotes ? (
                        <p className="text-xs text-foreground line-clamp-2">
                          {row.latestEventNotes}
                        </p>
                      ) : (
                        <span className="line-clamp-2 text-xs text-muted-foreground italic">
                          {statusMeta.guidance || "Belum ada catatan."}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost" className="max-md:min-h-11">
                        <Link href={shipmentDetailHref(row.publicReference)}>
                          Detail
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </>
        )}

        {data.totalPages > 1 ? (
          <DataTablePagination
            className="border-t p-4"
            hrefForPage={(page) => rtsHref(statusFilter, page, carry)}
            label="Paginasi daftar retur"
            page={data.page}
            summary={<span className="tabular-nums">{data.totalCount} kiriman</span>}
            totalCount={data.totalCount}
            totalPages={data.totalPages}
          />
        ) : (
          <p className="border-t p-4 text-sm tabular-nums text-muted-foreground">
            {data.totalCount} kiriman · halaman {data.page} dari {data.totalPages}
          </p>
        )}
        </Card>
      </section>
    </PageContainer>
  );
}
