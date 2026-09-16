import { ArrowRight, PackageSearch } from "lucide-react";
import { RecipientStack, StackedDateTime } from "@/components/cms/shipment-table-cells";
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
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { StateSummaryPanel } from "@/components/cms/state-summary-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseAnalyticsRange, serializeAnalyticsRange } from "@/lib/analytics-range";
import { formatIdr, formatWeight, formatWibDateTime } from "@/lib/label-format";
import { providerDeliveryBasisSentence } from "@/lib/provider-delivery-status";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import {
  parseUiAuditScenarioForRoute,
  UI_AUDIT_HEADER,
} from "@/lib/ui-audit-scenario";

export const metadata: Metadata = {
  title: "Retur (RTS) | GeraiCUAN",
  robots: { index: false },
};

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
      description: "Seluruh kiriman retur dan bermasalah",
      metricId: "RTS-ALL",
    },
    {
      key: "RTS_QUEUED",
      label: SHIPMENT_STATUS_PRESENTATION.RTS_QUEUED.label,
      count: data.summary.queuedCount,
      description: SHIPMENT_STATUS_PRESENTATION.RTS_QUEUED.guidance,
      metricId: "RTS-QUEUED",
    },
    {
      key: "RTS_IN_TRANSIT",
      label: SHIPMENT_STATUS_PRESENTATION.RTS_IN_TRANSIT.label,
      count: data.summary.inTransitCount,
      description: SHIPMENT_STATUS_PRESENTATION.RTS_IN_TRANSIT.guidance,
      metricId: "RTS-IN-TRANSIT",
    },
    {
      key: "RTS_RECEIVED",
      label: SHIPMENT_STATUS_PRESENTATION.RTS_RECEIVED.label,
      count: data.summary.receivedCount,
      description: SHIPMENT_STATUS_PRESENTATION.RTS_RECEIVED.guidance,
      metricId: "RTS-RECEIVED",
    },
    {
      key: "PROBLEM",
      label: SHIPMENT_STATUS_PRESENTATION.PROBLEM.label,
      count: data.summary.problemCount,
      description: SHIPMENT_STATUS_PRESENTATION.PROBLEM.guidance,
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
              Semua Kiriman
            </Link>
          </Button>
        }
        description="Pantau kiriman Return to Sender (RTS), tindak lanjuti kendala kurir, dan verifikasi barang yang sudah diterima kembali di outlet asal."
        eyebrow="Operasional kiriman"
        focusTargetId="rts-dashboard-heading"
        title="Retur (RTS)"
      />

      {issues.length > 0 ? (
        <Alert variant="destructive">
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

        {/* PR-57: these states are Mengantar's report, applied when a Tenant
            Admin pulls provider data, so the queue says what feeds it and how
            far behind it may be rather than reading as live courier truth. */}
        <p className="max-w-2xl text-sm text-muted-foreground">
          {providerDeliveryBasisSentence({
            formattedObservedAt: data.basis.lastObservedAt ? formatWibDateTime(data.basis.lastObservedAt) : null,
            observationVisible: data.basis.observationVisible,
            subject: "Status retur",
          })}
        </p>

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
          <Table
            className="min-w-[60rem]"
            containerClassName="rounded-md border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            containerProps={{
              "aria-label": "Daftar kiriman retur; geser horizontal untuk melihat seluruh kolom",
              role: "region",
              tabIndex: 0,
            }}
          >
            <TableCaption className="sr-only">
              Daftar kiriman retur to sender (RTS) dan detail statusnya.
            </TableCaption>
            <TableHeader>
              <TableRow>
                {/* The identifying column stays put while the other
                    six scroll under it, and is opaque so the scrolled
                    content does not read through — the same treatment the
                    shipment queue gives its reference column. */}
                <TableHead className="sticky left-0 z-10 min-w-[140px] bg-card">Resi</TableHead>
                <TableHead className="min-w-[150px]">Penerima</TableHead>
                <TableHead className="min-w-[120px]">Outlet & Kurir</TableHead>
                <TableHead className="min-w-[120px]">Nilai & Berat</TableHead>
                {/* Status and its update time share a column so the table fits 1440 without scrolling. */}
                <TableHead className="min-w-[130px]">Status & Waktu</TableHead>
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
                  <TableRow key={row.shipmentId} className="group">
                    <TableCell className="sticky left-0 z-10 max-w-40 whitespace-normal bg-inherit font-mono text-xs group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]">
                      <Link
                        className="flex min-h-11 max-w-40 items-center break-all font-semibold text-primary underline-offset-4 hover:underline md:min-h-8"
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
                          {row.providerService}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold tabular-nums">
                        {formatIdr(row.declaredValueIdr)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.isCod ? "COD" : "Non-COD"} · {formatWeight(row.packageWeightGrams)}
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
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs max-md:min-h-11">
                        <Link href={shipmentDetailHref(row.publicReference)}>
                          Detail
                          <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {data.totalPages > 1 ? (
          <DataTablePagination
            hrefForPage={(page) => rtsHref(statusFilter, page, carry)}
            label="Paginasi daftar retur"
            page={data.page}
            summary={<span className="tabular-nums">{data.totalCount} kiriman</span>}
            totalCount={data.totalCount}
            totalPages={data.totalPages}
          />
        ) : (
          <p className="text-sm tabular-nums text-muted-foreground">
            {data.totalCount} kiriman · halaman {data.page} dari {data.totalPages}
          </p>
        )}
      </section>
    </PageContainer>
  );
}
