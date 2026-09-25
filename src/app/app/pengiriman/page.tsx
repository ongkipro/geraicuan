import { CircleAlert, PackageSearch, Plus, Upload } from "lucide-react";
import { CourierAwbStack, PaymentStack, RecipientStack, StackedDateTime } from "@/components/cms/shipment-table-cells";
import { shipmentDetailHref } from "@/lib/shipment-number";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ShipmentQueueFilter } from "@/app/app/pengiriman/shipment-queue-filter";
import { DataFreshnessControl } from "@/components/cms/data-freshness-control";
import { DataTablePagination } from "@/components/cms/data-table-pagination";
import { DataTableToolbar } from "@/components/cms/data-table-toolbar";
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
import { loadShipmentQueuePage } from "@/db/shipment-queue-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseAnalyticsRange, serializeAnalyticsRange } from "@/lib/analytics-range";
import { isDataStale } from "@/lib/data-freshness";
import { formatWibDateTime, formatWeight } from "@/lib/label-format";
import {
  parseShipmentQueueQuery,
  SHIPMENT_QUEUE_PAGE_SIZE,
  SHIPMENT_QUEUE_SUMMARY_ENTRIES,
  SHIPMENT_STATUS_OPTIONS,
  SHIPMENT_STATUS_PRESENTATION,
  shipmentQueueHref,
} from "@/lib/shipment-queue";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

type SearchValue = string | string[] | undefined;
type ShipmentQueuePageProps = {
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


function delayResult<T>(promise: Promise<T>, delayMs: number) {
  return promise.then((value) => new Promise<T>((resolve) => {
    setTimeout(() => resolve(value), delayMs);
  }));
}

export default async function ShipmentQueuePage({ searchParams }: ShipmentQueuePageProps) {
  const principal = await requireTenantPrincipal();
  const params = await searchParams;
  const query = parseShipmentQueueQuery(params);
  // PR-53: the same control, the same URL contract, on the queue's existing
  // created basis.
  const now = new Date();
  const range = parseAnalyticsRange(params, now);
  const rangeQuery = serializeAnalyticsRange(range);
  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/pengiriman")
    : null;
  if (auditScenario === "shipment-queue-error") {
    throw new Error("Intentional development-only shipment queue failure.");
  }
  const pageSize = auditScenario === "shipment-queue-paginated" ? 5 : SHIPMENT_QUEUE_PAGE_SIZE;
  let dataPromise = withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) =>
      loadShipmentQueuePage(tx, context, {
        page: query.page,
        pageSize,
        range,
        status: query.status,
      }),
  );
  if (auditScenario === "shipment-queue-stream") dataPromise = delayResult(dataPromise, 1_200);
  const loadedData = await dataPromise;
  const data = auditScenario === "shipment-queue-empty"
    ? { ...loadedData, page: 1, rows: [], totalCount: 0, totalPages: 1 }
    : auditScenario === "shipment-queue-stale"
      ? { ...loadedData, generatedAt: new Date(loadedData.generatedAt.getTime() - 7 * 60_000) }
      : loadedData;
  const issues = [
    ...query.issues,
    ...(data.page !== query.page
      ? [`Halaman ${query.page} tidak tersedia; halaman terakhir ditampilkan.`]
      : []),
  ];
  const carry = Object.fromEntries(rangeQuery);
  const selectedStatus = query.status === "ALL"
    ? null
    : query.status === "ACTION_REQUIRED"
      ? { label: "Perlu tindakan" }
      : SHIPMENT_STATUS_PRESENTATION[query.status];

  return (
    <PageContainer>
      <PageHeader eyebrow="Operasional kiriman"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/app/impor">
                <Upload aria-hidden="true" />
                Impor CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/app/pengiriman/baru">
                <Plus aria-hidden="true" />
                Buat kiriman
              </Link>
            </Button>
          </>
        }
        focusTargetId="shipment-queue-heading"
        description="Kelola draf, penerbitan resi, dan tindak lanjut kiriman."
        title="Pengiriman"
      />

      {issues.length > 0 ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Filter disesuaikan</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="hasil-antrean-heading" className="grid gap-4 outline-none" id="shipment-queue-results" tabIndex={-1}>
        <div className="sr-only">
          <h2 id="hasil-antrean-heading">
            {selectedStatus ? selectedStatus.label : "Semua kiriman"}
          </h2>
          <p>Urutan aktivitas terbaru.</p>
        </div>

        <RangeFilterForm action="/app/pengiriman" idPrefix="shipment-queue" now={now} preserved={{ status: query.status === "ALL" ? undefined : query.status }} range={range} />

        {/* PR-52: every entry writes this page's own `status` URL state, and
            its count comes from the same tenant-scoped pass as the rows below. */}
        <StateSummaryPanel
          action="/app/pengiriman"
          entries={SHIPMENT_QUEUE_SUMMARY_ENTRIES.map((entry) => ({
            count: data.summary[entry.metricId],
            description: entry.description,
            label: entry.label,
            metricId: entry.metricId,
            value: entry.value,
          }))}
          label="Ringkasan status kiriman"
          param="status"
          preserved={carry}
          selected={query.status}
          selectedElsewhereLabel={
            SHIPMENT_STATUS_OPTIONS.find((option) => option.value === query.status)?.label
          }
        />

        {/* Below md the toolbar stacks: the status filter takes the full width
            and the freshness control gets its own row, so neither overlaps. */}
        <DataTableToolbar
          className="max-md:flex-col max-md:items-stretch max-md:[&>*:last-child]:ms-0 max-md:[&>*:last-child>*]:flex-1"
          actions={
            <DataFreshnessControl
              formattedGeneratedAt={formatWibDateTime(data.generatedAt)}
              generatedAtIso={data.generatedAt.toISOString()}
              initiallyStale={isDataStale(data.generatedAt, new Date())}
            />
          }
          isFiltered={query.status !== "ALL"}
          resetHref={shipmentQueueHref("ALL", 1, carry)}
        >
          <ShipmentQueueFilter carry={carry} status={query.status} />
        </DataTableToolbar>

        {data.rows.length === 0 ? (
          <EmptyState
            action={
              <Button asChild>
                <Link href={selectedStatus ? shipmentQueueHref("ALL", 1, carry) : "/app/pengiriman/baru"}>
                  {selectedStatus ? "Tampilkan semua kiriman" : "Buat kiriman pertama"}
                </Link>
              </Button>
            }
            description={
              selectedStatus
                ? "Pilih status lain atau tampilkan seluruh antrean."
                : "Kiriman akan muncul di sini setelah draf pertama disimpan."
            }
            icon={PackageSearch}
            title={
              selectedStatus
                ? `Tidak ada kiriman berstatus ${selectedStatus.label}.`
                : "Belum ada kiriman tersimpan."
            }
          />
        ) : (
          // Six columns, secondary facts stacked under their primary value, so
          // the queue fits the data container at desktop widths without a
          // horizontal scroll; narrower viewports still scroll inside the
          // labelled region.
          <Table
            className="min-w-[56rem]"
            containerClassName="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            containerProps={{
              "aria-label": "Daftar kiriman; geser horizontal untuk melihat seluruh kolom",
              role: "region",
              tabIndex: 0,
            }}
          >
            <TableCaption className="sr-only">
              Kiriman diurutkan dari aktivitas terbaru.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-inherit px-3">Nomor kiriman</TableHead>
                <TableHead className="px-3">Status / Pembayaran</TableHead>
                <TableHead className="px-3">Penerima</TableHead>
                <TableHead className="px-3">Paket / Outlet</TableHead>
                <TableHead className="px-3">Ekspedisi / Resi</TableHead>
                <TableHead className="px-3">Aktivitas terakhir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => {
                const status = SHIPMENT_STATUS_PRESENTATION[row.status];
                return (
                  <TableRow className="group transition-colors hover:bg-muted/30" key={row.shipmentId}>
                    <TableCell className="sticky left-0 z-10 bg-inherit px-3 font-medium group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]">
                      <Link
                        className="inline-flex min-h-11 items-center whitespace-nowrap text-primary underline-offset-4 hover:underline md:min-h-8"
                        href={shipmentDetailHref(row.publicReference, carry)}
                      >
                        {row.publicReference}
                      </Link>
                    </TableCell>
                    <TableCell className="px-3">
                      <ShipmentStatusBadge label={status.label} tone={status.tone} />
                      <PaymentStack className="mt-1 block text-xs text-muted-foreground" facts={row} />
                    </TableCell>
                    <TableCell className="max-w-48 whitespace-normal px-3">
                      <RecipientStack areaLabel={row.destinationAreaLabel} name={row.recipientName} phone={row.recipientPhone} />
                    </TableCell>
                    <TableCell className="max-w-44 whitespace-normal px-3">
                      {/* Wraps rather than truncates: an overflow-hidden nowrap
                          block still contributes its full text to the table's
                          min-content width, so one long item widened the queue
                          past the container at 1440px. */}
                      <span className="block wrap-anywhere">{row.packageContent}</span>
                      <span className="block text-xs wrap-anywhere text-muted-foreground">
                        {formatWeight(row.packageWeightGrams)} · {row.outletName}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-44 whitespace-normal px-3">
                      <CourierAwbStack awb={row.awb} service={row.providerService} />
                    </TableCell>
                    <TableCell className="px-3">
                      <StackedDateTime value={row.updatedAt} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {data.totalCount > 0 ? (
          <DataTablePagination
            hrefForPage={(page) => shipmentQueueHref(query.status, page, carry)}
            label="Paginasi antrean kiriman"
            page={data.page}
            summary={<span className="tabular-nums">{data.totalCount} kiriman</span>}
            totalCount={data.totalCount}
            totalPages={data.totalPages}
          />
        ) : null}
      </section>
    </PageContainer>
  );
}
