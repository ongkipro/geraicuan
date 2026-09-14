import { PackageSearch, Plus, Upload } from "lucide-react";
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
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
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
import { isDataStale } from "@/lib/data-freshness";
import { formatWibDateTime, formatWeight } from "@/lib/label-format";
import {
  parseShipmentQueueQuery,
  SHIPMENT_QUEUE_PAGE_SIZE,
  SHIPMENT_STATUS_PRESENTATION,
  shipmentQueueHref,
} from "@/lib/shipment-queue";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";
import { shipmentReference } from "@/lib/shipment-reference";

export const metadata: Metadata = { robots: { index: false } };

type SearchValue = string | string[] | undefined;
type ShipmentQueuePageProps = {
  searchParams: Promise<{ page?: SearchValue; status?: SearchValue }>;
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
  const query = parseShipmentQueueQuery(await searchParams);
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
  const selectedStatus = query.status === "ALL"
    ? null
    : query.status === "ACTION_REQUIRED"
      ? { label: "Perlu tindakan" }
      : SHIPMENT_STATUS_PRESENTATION[query.status];

  return (
    <PageContainer width="data">
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
          <CircleAlertIcon />
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
          resetHref="/app/pengiriman"
        >
          <ShipmentQueueFilter status={query.status} />
        </DataTableToolbar>

        {data.rows.length === 0 ? (
          <EmptyState
            action={
              <Button asChild>
                <Link href={selectedStatus ? "/app/pengiriman" : "/app/pengiriman/baru"}>
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
            containerClassName="rounded-md border bg-card focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
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
                <TableHead className="sticky left-0 z-10 bg-card px-3">Referensi</TableHead>
                <TableHead className="px-3">Status / Pembayaran</TableHead>
                <TableHead className="px-3">Penerima / Tujuan</TableHead>
                <TableHead className="px-3">Paket / Outlet</TableHead>
                <TableHead className="px-3">Layanan / AWB</TableHead>
                <TableHead className="px-3">Aktivitas terakhir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => {
                const status = SHIPMENT_STATUS_PRESENTATION[row.status];
                return (
                  <TableRow className="group" key={row.shipmentId}>
                    <TableCell className="sticky left-0 z-10 bg-card px-3 font-medium group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]">
                      <Link
                        className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline md:min-h-8"
                        href={`/app/pengiriman/${encodeURIComponent(row.shipmentId)}`}
                      >
                        {shipmentReference(row.shipmentId)}
                      </Link>
                    </TableCell>
                    <TableCell className="px-3">
                      <ShipmentStatusBadge label={status.label} tone={status.tone} />
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {row.isCod ? "COD" : "Non-COD"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-44 whitespace-normal px-3">
                      <span className="block wrap-anywhere">{row.recipientName}</span>
                      <span className="block text-xs wrap-anywhere text-muted-foreground">
                        {row.destinationAreaLabel}
                      </span>
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
                    <TableCell className="max-w-40 whitespace-normal px-3">
                      <span className="block wrap-anywhere">{row.providerService ?? "—"}</span>
                      {row.awb ? (
                        <span className="block break-all font-mono text-xs text-muted-foreground">{row.awb}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-32 whitespace-normal px-3 text-xs text-muted-foreground">
                      {formatWibDateTime(row.updatedAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {data.totalCount > 0 ? (
          <DataTablePagination
            hrefForPage={(page) => shipmentQueueHref(query.status, page)}
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

function CircleAlertIcon() {
  return <span aria-hidden="true" className="mt-0.5 size-4 rounded-full border border-current" />;
}
