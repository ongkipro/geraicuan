import { CircleAlert, Download, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ShipmentReportFilters } from "@/app/app/laporan/pengiriman/report-filters";
import { DataTablePagination } from "@/components/cms/data-table-pagination";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { StackedDateTime } from "@/components/cms/shipment-table-cells";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { loadAnalyticsFilterOptions } from "@/db/analytics-repository";
import { loadShipmentReportPage } from "@/db/shipment-report-repository";
import { withTenantContext } from "@/db/tenant-context";
import { parseTenantAnalyticsQuery, type TenantAnalyticsIssue } from "@/lib/analytics-filters";
import { analyticsIssueMessage, formatRangeLabel, parseAnalyticsRange } from "@/lib/analytics-range";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { formatIdr } from "@/lib/label-format";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import {
  SHIPMENT_REPORT_COLUMNS,
  SHIPMENT_REPORT_PAGE_SIZE,
  shipmentReportHref,
} from "@/lib/shipment-report";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

type ShipmentReportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function reportIssueMessage(issue: TenantAnalyticsIssue) {
  switch (issue) {
    case "outlet_tidak_dikenal": return "Outlet tidak tersedia pada tenant ini. Filter ditolak.";
    case "kurir_tidak_dikenal": return "Kurir tidak tersedia pada tenant ini. Filter ditolak.";
    case "status_tidak_dikenal": return "Lifecycle tidak dikenali. Filter ditolak.";
    case "basis_tidak_dikenal": return "Basis laporan tidak dikenali. Filter ditolak.";
    default: return analyticsIssueMessage(issue);
  }
}

export default async function ShipmentReportPage({ searchParams }: ShipmentReportPageProps) {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  // PR-55 makes both report pages a Tenant Admin record; the repository refuses
  // any other role as well, so the export cannot widen what an operator sees.
  if (principal.role !== "TENANT_ADMIN") redirect("/app");

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/laporan/pengiriman")
    : null;
  if (auditScenario === "shipment-report-error") {
    throw new Error("Intentional development-only shipment report failure.");
  }

  const now = new Date();
  const params = await searchParams;
  const options = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    loadAnalyticsFilterOptions,
  );
  const parsed = parseTenantAnalyticsQuery(params, {
    knownCouriers: options.couriers,
    knownOutletIds: options.outlets.map((outlet) => outlet.id),
    now,
  });
  const { filters, page: requestedPage, range } = parsed.query;
  const { periodLabel, presetLabel, timezoneLabel } = formatRangeLabel(range);
  const canonicalQuery = new URLSearchParams(parsed.canonicalQuery);
  canonicalQuery.delete("halaman");
  canonicalQuery.delete("basis");
  const carry = Object.fromEntries(canonicalQuery);
  const exportHref = `/app/laporan/pengiriman/export.csv?${canonicalQuery.toString()}`;
  const activeCount = Number(Boolean(filters.outletId))
    + Number(Boolean(filters.courier))
    + Number(Boolean(filters.lifecycleStatus))
    + Number(range.presetId !== "30-hari");

  const emptyPage = {
    generatedAt: now,
    page: 1,
    pageSize: SHIPMENT_REPORT_PAGE_SIZE,
    rows: [],
    totals: { byCourier: [], byLifecycle: [], shipmentCount: 0 },
    totalPages: 1,
  };
  const loaded = parsed.filterRejected
    ? emptyPage
    : await withTenantContext(
        db,
        principal.userId,
        principal.tenantId,
        (tx, context) => loadShipmentReportPage(tx, context, {
          filters,
          page: requestedPage,
          pageSize: SHIPMENT_REPORT_PAGE_SIZE,
          range,
        }),
      );
  const data = auditScenario === "shipment-report-empty" ? emptyPage : loaded;
  const todayLocalDate = parseAnalyticsRange({ rentang: "hari-ini", tz: range.timezone }, now).startDate;

  return (
    <PageContainer>
      <PageHeader
        actions={parsed.filterRejected || data.totals.shipmentCount === 0 ? null : (
          <Button asChild variant="outline">
            <Link href={exportHref}><Download aria-hidden="true" />Ekspor CSV</Link>
          </Button>
        )}
        description="Catatan kiriman per periode, outlet, kurir, dan lifecycle, dengan ekspor CSV yang mengikuti filter yang sama."
        eyebrow="Laporan"
        focusTargetId="shipment-report-heading"
        title="Laporan pengiriman"
      />

      <ShipmentReportFilters
        activeCount={activeCount}
        options={options}
        rangeLabel={periodLabel}
        timezoneLabel={timezoneLabel}
        todayLocalDate={todayLocalDate}
        values={{
          courier: filters.courier,
          endDate: range.lastIncludedDate,
          lifecycleStatus: filters.lifecycleStatus,
          outletId: filters.outletId,
          presetId: range.presetId,
          startDate: range.startDate,
        }}
      />

      <p className="max-w-2xl text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
        {periodLabel} · {timezoneLabel} · {presetLabel}
      </p>

      {parsed.issues.length > 0 ? (
        <Alert variant={parsed.filterRejected ? "destructive" : "default"}>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{parsed.filterRejected ? "Filter ditolak" : "Filter disesuaikan"}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {parsed.issues.map((issue, index) => <li key={`${issue}-${index}`}>{reportIssueMessage(issue)}</li>)}
            </ul>
            {parsed.filterRejected ? (
              <div className="mt-3">
                <Button asChild variant="outline"><Link href="/app/laporan/pengiriman">Kembali ke filter aman</Link></Button>
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="shipment-report-totals-title" className="grid min-w-0 gap-3">
        <h2 className="text-sm font-medium text-foreground" id="shipment-report-totals-title">
          Ringkasan periode
        </h2>
        {/* Reading measure: the screening audit caps prose at 672px, and this
            line runs the full container width at 1920 without it. */}
        <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
          <Badge variant="secondary">
            <span className="tabular-nums">{data.totals.shipmentCount}</span> kiriman
          </Badge>
          {" "}Total berikut dihitung atas seluruh baris yang cocok dengan filter, bukan hanya halaman ini. Dana dicairkan Mengantar di sini masih estimasi: nilai COD dikurangi biaya kirim dan biaya COD.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <h3 className="text-xs font-medium text-muted-foreground" id="shipment-report-courier-title">Total per kurir</h3>
            {data.totals.byCourier.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada kiriman pada periode ini.</p>
            ) : (
              <Table
                containerClassName="rounded-md border bg-card"
                containerProps={{ "aria-labelledby": "shipment-report-courier-title", role: "region", tabIndex: 0 }}
              >
                <TableCaption className="sr-only">Total kiriman, biaya kirim Mengantar, biaya COD, dan estimasi dana dicairkan Mengantar per kurir.</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3">Kurir</TableHead>
                    <TableHead className="px-3 text-right">Kiriman</TableHead>
                    <TableHead className="px-3 text-right">Biaya kirim Mengantar</TableHead>
                    <TableHead className="px-3 text-right">Biaya COD</TableHead>
                    <TableHead className="px-3 text-right">Estimasi dana dicairkan Mengantar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.totals.byCourier.map((total) => (
                    <TableRow key={total.courier ?? "tanpa-kurir"}>
                      <TableCell className="px-3">{total.courier ?? "Belum ada kurir"}</TableCell>
                      <TableCell className="px-3 text-right tabular-nums">{total.shipmentCount}</TableCell>
                      <TableCell className="px-3 text-right tabular-nums">{formatIdr(total.shippingCostIdr)}</TableCell>
                      <TableCell className="px-3 text-right tabular-nums">{formatIdr(total.codFeeIdr)}</TableCell>
                      <TableCell className="px-3 text-right tabular-nums">{formatIdr(total.codDisbursementEstimateIdr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div className="grid gap-2">
            <h3 className="text-xs font-medium text-muted-foreground" id="shipment-report-lifecycle-title">Total per lifecycle</h3>
            {data.totals.byLifecycle.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada kiriman pada periode ini.</p>
            ) : (
              <Table
                containerClassName="rounded-md border bg-card"
                containerProps={{ "aria-labelledby": "shipment-report-lifecycle-title", role: "region", tabIndex: 0 }}
              >
                <TableCaption className="sr-only">Total kiriman per lifecycle.</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3">Lifecycle</TableHead>
                    <TableHead className="px-3 text-right">Kiriman</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.totals.byLifecycle.map((total) => (
                    <TableRow key={total.status}>
                      <TableCell className="px-3">
                        <ShipmentStatusBadge
                          label={SHIPMENT_STATUS_PRESENTATION[total.status].label}
                          tone={SHIPMENT_STATUS_PRESENTATION[total.status].tone}
                        />
                      </TableCell>
                      <TableCell className="px-3 text-right tabular-nums">{total.shipmentCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="shipment-report-rows-title" className="grid min-w-0 gap-3">
        <h2 className="sr-only" id="shipment-report-rows-title">Baris laporan</h2>
        {data.rows.length === 0 ? (
          <EmptyState
            action={activeCount > 0 ? (
              <Button asChild><Link href="/app/laporan/pengiriman">Kembali ke filter aman</Link></Button>
            ) : (
              <Button asChild><Link href="/app/pengiriman/baru">Buat kiriman pertama</Link></Button>
            )}
            description={activeCount > 0
              ? "Longgarkan periode, outlet, kurir, atau lifecycle untuk melihat baris lain."
              : "Laporan terisi setelah kiriman pertama dibuat pada periode ini."}
            icon={FileSpreadsheet}
            title={activeCount > 0
              ? "Tidak ada kiriman yang cocok dengan filter ini."
              : "Belum ada kiriman pada periode ini."}
          />
        ) : (
          <Table
            className="min-w-[72rem]"
            containerClassName="rounded-md border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            containerProps={{
              "aria-label": "Baris laporan pengiriman; geser horizontal untuk melihat seluruh kolom",
              role: "region",
              tabIndex: 0,
            }}
          >
            <TableCaption className="sr-only">
              Kiriman diurutkan dari yang terbaru dibuat.
            </TableCaption>
            <TableHeader>
              <TableRow>
                {SHIPMENT_REPORT_COLUMNS.map((column, index) => (
                  <TableHead
                    className={index === 0 ? "sticky left-0 z-10 bg-inherit px-3" : "px-3"}
                    key={column.metricId}
                  >
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow className="group" key={row.shipmentId}>
                  <TableCell className="sticky left-0 z-10 bg-inherit px-3 font-medium group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]">
                    <span className="whitespace-nowrap">{row.publicReference}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{row.outletName}</span>
                  </TableCell>
                  <TableCell className="px-3"><StackedDateTime value={row.createdAt} /></TableCell>
                  <TableCell className="px-3"><StackedDateTime value={row.issuedAt} /></TableCell>
                  <TableCell className="max-w-56 whitespace-normal px-3 wrap-anywhere">{row.destinationAreaLabel}</TableCell>
                  <TableCell className="px-3">{row.courier ?? "—"}</TableCell>
                  <TableCell className="px-3">{row.providerService ?? "—"}</TableCell>
                  <TableCell className="px-3">
                    <ShipmentStatusBadge
                      label={SHIPMENT_STATUS_PRESENTATION[row.status].label}
                      tone={SHIPMENT_STATUS_PRESENTATION[row.status].tone}
                    />
                  </TableCell>
                  <TableCell className="px-3">{row.isCod ? "COD" : "Non-COD"}</TableCell>
                  {[row.shippingCostIdr, row.codFeeIdr, row.codDisbursementEstimateIdr].map((amount, index) => (
                    <TableCell className="px-3 text-right tabular-nums" key={index}>
                      {amount === null ? "—" : formatIdr(amount)}
                    </TableCell>
                  ))}
                  <TableCell className="px-3">
                    {row.printCount > 0 ? `Sudah dicetak (${row.printCount}×)` : "Belum dicetak"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data.totals.shipmentCount > 0 ? (
          <DataTablePagination
            hrefForPage={(page) => shipmentReportHref(page, carry)}
            label="Paginasi laporan pengiriman"
            page={data.page}
            summary={<span className="tabular-nums">{data.totals.shipmentCount} kiriman</span>}
            totalCount={data.totals.shipmentCount}
            totalPages={data.totalPages}
          />
        ) : null}
      </section>
    </PageContainer>
  );
}
