import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
} from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import {
  loadRtsShipmentsPage,
  type RtsFilterStatus,
} from "@/db/rts-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { formatIdr, formatWeight, formatWibDateTime } from "@/lib/label-format";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import {
  parseUiAuditScenarioForRoute,
  UI_AUDIT_HEADER,
} from "@/lib/ui-audit-scenario";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Manajemen Retur (RTS) | GeraiCUAN",
  robots: { index: false },
};

type SearchValue = string | string[] | undefined;
type RtsPageProps = {
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

function rtsHref(status: RtsFilterStatus, page: number): string {
  const params = new URLSearchParams();
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
  const query = parseRtsQuery(await searchParams);
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
  const filterTabs: {
    key: RtsFilterStatus;
    label: string;
    count: number;
    description: string;
  }[] = [
    {
      key: "ALL",
      label: "Semua retur",
      count: data.summary.totalRtsCount,
      description: "Seluruh kiriman retur dan bermasalah",
    },
    {
      key: "RTS_QUEUED",
      label: SHIPMENT_STATUS_PRESENTATION.RTS_QUEUED.label,
      count: data.summary.queuedCount,
      description: SHIPMENT_STATUS_PRESENTATION.RTS_QUEUED.guidance,
    },
    {
      key: "RTS_IN_TRANSIT",
      label: SHIPMENT_STATUS_PRESENTATION.RTS_IN_TRANSIT.label,
      count: data.summary.inTransitCount,
      description: SHIPMENT_STATUS_PRESENTATION.RTS_IN_TRANSIT.guidance,
    },
    {
      key: "RTS_RECEIVED",
      label: SHIPMENT_STATUS_PRESENTATION.RTS_RECEIVED.label,
      count: data.summary.receivedCount,
      description: SHIPMENT_STATUS_PRESENTATION.RTS_RECEIVED.guidance,
    },
    {
      key: "PROBLEM",
      label: SHIPMENT_STATUS_PRESENTATION.PROBLEM.label,
      count: data.summary.problemCount,
      description: SHIPMENT_STATUS_PRESENTATION.PROBLEM.guidance,
    },
  ];

  return (
    <PageContainer width="data">
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
        title="Manajemen Retur (RTS)"
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

      <Card className="rounded-lg shadow-none">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Temukan kiriman retur</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Kelola paket gagal serah dan verifikasi barang sampai kembali ke outlet asal.
              </p>
            </div>
            <p className="text-sm tabular-nums text-muted-foreground">
              {data.totalCount} kiriman · halaman {data.page} dari {data.totalPages}
            </p>
          </div>

          {/* Each chip navigates, so this is a filter navigation rather than a
              tablist: there are no tab panels and no roving focus. The selected
              chip is `aria-current="true"`, not `"page"` — the shell already
              owns the one truthful current page, and this is a filter on it. */}
          <nav aria-label="Filter status retur" className="mt-4 flex flex-wrap gap-1.5 pt-2">
            {filterTabs.map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <Button
                  key={tab.key}
                  asChild
                  className={cn(
                    "min-h-9 text-xs sm:text-sm",
                    active
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  )}
                  size="sm"
                  variant={active ? "default" : "ghost"}
                >
                  <Link aria-current={active ? "true" : undefined} href={rtsHref(tab.key, 1)}>
                    {tab.label}
                    <Badge
                      className={cn(
                        "ml-1.5 text-[10px] px-1.5 py-0 tabular-nums",
                        active
                          ? "bg-primary-foreground text-primary"
                          : "bg-background text-foreground",
                      )}
                      variant="secondary"
                    >
                      {tab.count}
                    </Badge>
                  </Link>
                </Button>
              );
            })}
          </nav>
        </CardHeader>

        <CardContent className="p-0">
          {data.rows.length === 0 ? (
            <div className="py-12">
              <EmptyState
                description={
                  statusFilter === "ALL"
                    ? "Belum ada riwayat kiriman retur atau gagal serah yang tercatat."
                    : `Tidak ada kiriman pada status ${filterTabs.find((t) => t.key === statusFilter)?.label}.`
                }
                icon={PackageSearch}
                title="Tidak ada kiriman retur"
              />
            </div>
          ) : (
            <div className="overflow-hidden">
              <Table
                className="min-w-[70rem]"
                containerClassName="focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
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
                        seven scroll under it, and is opaque so the scrolled
                        content does not read through — the same treatment the
                        shipment queue gives its reference column. */}
                    <TableHead className="sticky left-0 z-10 min-w-[140px] bg-card">Resi</TableHead>
                    <TableHead className="min-w-[150px]">Penerima & Tujuan</TableHead>
                    <TableHead className="min-w-[120px]">Outlet & Kurir</TableHead>
                    <TableHead className="min-w-[120px]">Nilai & Berat</TableHead>
                    <TableHead className="min-w-[120px]">Status Retur</TableHead>
                    <TableHead className="min-w-[180px]">Catatan / Kejadian</TableHead>
                    <TableHead className="min-w-[110px]">Waktu Update</TableHead>
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
                        <TableCell className="sticky left-0 z-10 bg-card font-mono text-xs group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]">
                          <Link
                            className="font-semibold text-primary underline-offset-4 hover:underline"
                            href={`/app/pengiriman/${row.shipmentId}`}
                          >
                            {row.awb ? row.awb : row.shipmentId.slice(0, 8).toUpperCase()}
                          </Link>

                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-xs sm:text-sm">
                            {row.recipientName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.recipientPhoneMasked}
                          </div>
                          <div className="truncate text-xs text-muted-foreground" title={row.destinationAreaLabel}>
                            {row.destinationAreaLabel}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs sm:text-sm">{row.outletName}</div>
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
                        </TableCell>
                        <TableCell>
                          {row.latestEventNotes ? (
                            <p className="text-xs text-foreground line-clamp-2">
                              {row.latestEventNotes}
                            </p>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {statusMeta.guidance || "Belum ada catatan."}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatWibDateTime(row.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs">
                            <Link href={`/app/pengiriman/${row.shipmentId}`}>
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
            </div>
          )}

          {/* Pagination */}
          {data.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t px-4 py-3 sm:px-6">
              <p className="text-xs text-muted-foreground sm:text-sm">
                Menampilkan halaman <span className="font-medium">{data.page}</span> dari{" "}
                <span className="font-medium">{data.totalPages}</span>
              </p>
              <div className="flex items-center gap-1">
                <Button
                  asChild={data.page > 1}
                  disabled={data.page <= 1}
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                >
                  {data.page > 1 ? (
                    <Link href={rtsHref(statusFilter, data.page - 1)} aria-label="Halaman sebelumnya">
                      <ChevronLeft className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span>
                      <ChevronLeft className="h-4 w-4" />
                    </span>
                  )}
                </Button>
                <Button
                  asChild={data.page < data.totalPages}
                  disabled={data.page >= data.totalPages}
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                >
                  {data.page < data.totalPages ? (
                    <Link href={rtsHref(statusFilter, data.page + 1)} aria-label="Halaman berikutnya">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span>
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
