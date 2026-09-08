import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  PackageCheck,
  PackageSearch,
  PackageX,
  Truck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
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

function parseFilterStatus(status: SearchValue): RtsFilterStatus {
  const val = Array.isArray(status) ? status[0] : status;
  if (
    val === "RTS_QUEUED" ||
    val === "RTS_IN_TRANSIT" ||
    val === "RTS_RECEIVED" ||
    val === "PROBLEM"
  ) {
    return val;
  }
  return "ALL";
}

function parsePageNumber(page: SearchValue): number {
  const val = Array.isArray(page) ? page[0] : page;
  const parsed = val ? Number.parseInt(val, 10) : 1;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function rtsHref(status: RtsFilterStatus, page: number): string {
  const params = new URLSearchParams();
  if (status !== "ALL") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/app/pengiriman/rts${query ? `?${query}` : ""}`;
}

export default async function RtsDashboardPage({ searchParams }: RtsPageProps) {
  const principal = await requireTenantPrincipal();
  const resolvedParams = await searchParams;
  const statusFilter = parseFilterStatus(resolvedParams.status);
  const requestedPage = parsePageNumber(resolvedParams.page);

  const data = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) =>
      loadRtsShipmentsPage(tx, context, {
        page: requestedPage,
        pageSize: 20,
        status: statusFilter,
      }),
  );

  const filterTabs: {
    key: RtsFilterStatus;
    label: string;
    count: number;
    description: string;
  }[] = [
    {
      key: "ALL",
      label: "Semua Retur",
      count: data.summary.totalRtsCount,
      description: "Seluruh kiriman retur dan bermasalah",
    },
    {
      key: "RTS_QUEUED",
      label: "Antre Retur",
      count: data.summary.queuedCount,
      description: "Menunggu penjemputan/pengembalian kurir",
    },
    {
      key: "RTS_IN_TRANSIT",
      label: "Dalam Perjalanan",
      count: data.summary.inTransitCount,
      description: "Sedang dikirim balik ke gudang",
    },
    {
      key: "RTS_RECEIVED",
      label: "Diterima Gudang",
      count: data.summary.receivedCount,
      description: "Barang retur sudah sampai dan diverifikasi",
    },
    {
      key: "PROBLEM",
      label: "Bermasalah",
      count: data.summary.problemCount,
      description: "Kendala kurir / gagal kirim",
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
        description="Pantau kiriman Return to Sender (RTS), tindak lanjuti kendala kurir, dan verifikasi barang yang sudah diterima kembali di gudang."
        eyebrow="Operasional kiriman"
        focusTargetId="rts-dashboard-heading"
        title="Manajemen Retur (RTS)"
      />

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
              Total Retur & Masalah
            </CardTitle>
            <PackageX className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold tabular-nums sm:text-2xl">
              {data.summary.totalRtsCount}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Kiriman tidak terkirim
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
              Antre Dikembalikan
            </CardTitle>
            <Clock className="h-4 w-4 text-[var(--warn)]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold tabular-nums text-[var(--warn)] sm:text-2xl">
              {data.summary.queuedCount}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Menunggu proses kurir
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
              Dalam Perjalanan (RTS)
            </CardTitle>
            <Truck className="h-4 w-4 text-primary" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold tabular-nums sm:text-2xl">
              {data.summary.inTransitCount}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Sedang dikirim balik
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
              Selesai Diterima
            </CardTitle>
            <PackageCheck className="h-4 w-4 text-[var(--ok)]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold tabular-nums text-[var(--ok)] sm:text-2xl">
              {data.summary.receivedCount}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Fisik kembali di gudang
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="mt-6 rounded-lg shadow-none">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Daftar Kiriman Retur</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                Kelola paket gagal serah dan verifikasi barang sampai kembali ke outlet pengirim.
              </p>
            </div>
            <div className="text-xs text-muted-foreground sm:text-sm">
              {data.totalCount} kiriman ditemukan · Halaman {data.page} dari {data.totalPages}
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div className="mt-4 flex flex-wrap gap-1.5 pt-2" role="tablist" aria-label="Filter status RTS">
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
                  <Link href={rtsHref(tab.key, 1)}>
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
          </div>
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
            <div className="overflow-x-auto">
              <Table>
                <TableCaption className="sr-only">
                  Daftar kiriman retur to sender (RTS) dan detail statusnya.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">Resi & ID</TableHead>
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
                      <TableRow key={row.shipmentId} className="hover:bg-muted/40">
                        <TableCell className="font-mono text-xs">
                          <Link
                            className="font-semibold text-primary underline-offset-4 hover:underline"
                            href={`/app/pengiriman/${row.shipmentId}`}
                          >
                            {row.awb ? row.awb : row.shipmentId.slice(0, 8).toUpperCase()}
                          </Link>
                          {row.awb ? (
                            <div className="text-[10px] text-muted-foreground">
                              ID: {row.shipmentId.slice(0, 8).toUpperCase()}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-xs sm:text-sm">
                            {row.recipientName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.recipientPhone}
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
