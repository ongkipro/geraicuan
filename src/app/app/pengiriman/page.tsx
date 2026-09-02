import { ChevronLeft, ChevronRight, PackageSearch, Plus, Upload } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ShipmentQueueFilter } from "@/app/app/pengiriman/shipment-queue-filter";
import { DataFreshnessControl } from "@/components/cms/data-freshness-control";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function shipmentReference(shipmentId: string) {
  return shipmentId.slice(0, 8).toUpperCase();
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
      <PageHeader
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
        description="Pantau setiap kiriman dari draf sampai AWB terbit dan buka tindakan yang sesuai dengan statusnya."
        eyebrow="Operasional kiriman"
        focusTargetId="shipment-queue-heading"
        title="Pengiriman"
      />

      <Card className="rounded-lg shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Temukan kiriman</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <ShipmentQueueFilter status={query.status} />
          <p className="text-sm tabular-nums text-muted-foreground">
            {data.totalCount} kiriman · halaman {data.page} dari {data.totalPages}
          </p>
        </CardContent>
      </Card>

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

      <DataFreshnessControl
        formattedGeneratedAt={formatWibDateTime(data.generatedAt)}
        generatedAtIso={data.generatedAt.toISOString()}
        initiallyStale={isDataStale(data.generatedAt, new Date())}
      />

      <section aria-labelledby="hasil-antrean-heading" className="space-y-3" id="shipment-queue-results" tabIndex={-1}>
        <div>
          <h2 className="text-base font-semibold" id="hasil-antrean-heading">
            {selectedStatus ? selectedStatus.label : "Semua kiriman"}
          </h2>
          <p className="text-sm text-muted-foreground">Urutan aktivitas terbaru.</p>
        </div>

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
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table
              className="min-w-[70rem]"
              containerClassName="focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
              containerProps={{
                "aria-label": "Daftar kiriman; geser horizontal untuk melihat seluruh kolom",
                role: "region",
                tabIndex: 0,
              }}
            >
              <TableCaption className="sr-only">
                Daftar lifecycle kiriman tenant, diurutkan dari aktivitas terbaru.
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-card">Referensi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Penerima</TableHead>
                  <TableHead>Tujuan</TableHead>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead>Pembayaran</TableHead>
                  <TableHead>Layanan / AWB</TableHead>
                  <TableHead>Aktivitas terakhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => {
                  const status = SHIPMENT_STATUS_PRESENTATION[row.status];
                  return (
                    <TableRow key={row.shipmentId}>
                      <TableCell className="sticky left-0 z-10 bg-card font-medium group-hover:bg-muted/50">
                        <Link
                          className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline sm:min-h-8"
                          href={`/app/pengiriman/${encodeURIComponent(row.shipmentId)}`}
                        >
                          {shipmentReference(row.shipmentId)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <ShipmentStatusBadge label={status.label} tone={status.tone} />
                      </TableCell>
                      <TableCell>{row.recipientName}</TableCell>
                      <TableCell>{row.destinationAreaLabel}</TableCell>
                      <TableCell>{row.outletName}</TableCell>
                      <TableCell>
                        <span className="block max-w-52 truncate">{row.packageContent}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatWeight(row.packageWeightGrams)}
                        </span>
                      </TableCell>
                      <TableCell>{row.isCod ? "COD" : "Non-COD"}</TableCell>
                      <TableCell>
                        <span className="block">{row.providerService ?? "—"}</span>
                        {row.awb ? (
                          <span className="font-mono text-xs text-muted-foreground">{row.awb}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatWibDateTime(row.updatedAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {data.totalCount > 0 ? (
          <nav aria-label="Paginasi antrean kiriman" className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <span className="text-sm text-muted-foreground">
              Halaman {data.page} dari {data.totalPages}
            </span>
            <div className="flex gap-2">
              <Button asChild={data.page > 1} className="min-h-11 sm:min-h-9" disabled={data.page <= 1} variant="outline">
                {data.page > 1 ? (
                  <Link href={shipmentQueueHref(query.status, data.page - 1)}>
                    <ChevronLeft aria-hidden="true" />
                    Sebelumnya
                  </Link>
                ) : (
                  <span><ChevronLeft aria-hidden="true" />Sebelumnya</span>
                )}
              </Button>
              <Button
                asChild={data.page < data.totalPages}
                className="min-h-11 sm:min-h-9"
                disabled={data.page >= data.totalPages}
                variant="outline"
              >
                {data.page < data.totalPages ? (
                  <Link href={shipmentQueueHref(query.status, data.page + 1)}>
                    Berikutnya
                    <ChevronRight aria-hidden="true" />
                  </Link>
                ) : (
                  <span>Berikutnya<ChevronRight aria-hidden="true" /></span>
                )}
              </Button>
            </div>
          </nav>
        ) : null}
      </section>
    </PageContainer>
  );
}

function CircleAlertIcon() {
  return <span aria-hidden="true" className="mt-0.5 size-4 rounded-full border border-current" />;
}
