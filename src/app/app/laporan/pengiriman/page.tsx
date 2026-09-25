import { CircleAlert, Download, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CourierPerformanceSection } from "@/app/app/laporan/pengiriman/courier-performance";
import { ShipmentReportFilters } from "@/app/app/laporan/pengiriman/report-filters";
import { HelpHint } from "@/components/cms/help-hint";
import { DataTablePagination } from "@/components/cms/data-table-pagination";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { desktopTableClassName, RecordItem, RecordList } from "@/components/cms/record-list";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { dataTableSurfaceClassName } from "@/components/cms/data-table-shell";
import { shipmentIdLinkClassName, StackedDateTime } from "@/components/cms/shipment-table-cells";
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
import { loadAnalyticsFilterOptions, loadCourierPerformance, type CourierPerformanceRow } from "@/db/analytics-repository";
import { loadShipmentReportPage } from "@/db/shipment-report-repository";
import { withTenantContext } from "@/db/tenant-context";
import { parseTenantAnalyticsQuery, type TenantAnalyticsIssue } from "@/lib/analytics-filters";
import { analyticsIssueMessage, formatRangeLabel, parseAnalyticsRange } from "@/lib/analytics-range";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { serviceDisplayName } from "@/lib/labels/courier";
import { areaDisplayCase, formatDistrictCity, formatIdr, formatWibDateTimeParts } from "@/lib/label-format";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import { shipmentDetailHref } from "@/lib/shipment-number";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-method";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import {
  SHIPMENT_REPORT_COLUMNS,
  SHIPMENT_REPORT_PAGE_SIZE,
  shipmentReportHref,
} from "@/lib/shipment-report";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Laporan pengiriman · GeraiCUAN", robots: { index: false } };

/** Spec 10 §1.6: a table inside a card has no outer frame, only the focus ring of its scroll region. */
const inCardTableClassName = "min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

type ShipmentReportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function reportIssueMessage(issue: TenantAnalyticsIssue) {
  switch (issue) {
    case "outlet_tidak_dikenal": return "Outlet tidak tersedia pada tenant ini. Filter ditolak.";
    case "kurir_tidak_dikenal": return "Kurir tidak tersedia pada tenant ini. Filter ditolak.";
    case "status_tidak_dikenal": return "Status kiriman tidak dikenali. Filter ditolak.";
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
  // T-204: Analitik's courier performance, on this page's filters. Its own
  // transaction, so a failed read degrades only that section.
  let courierPerformance: CourierPerformanceRow[] | null = [];
  if (!parsed.filterRejected && auditScenario !== "shipment-report-empty") {
    try {
      courierPerformance = await withTenantContext(
        db,
        principal.userId,
        principal.tenantId,
        (tx, context) => loadCourierPerformance(tx, context, range, filters),
      );
    } catch {
      courierPerformance = null;
    }
  }
  const todayLocalDate = parseAnalyticsRange({ rentang: "hari-ini", tz: range.timezone }, now).startDate;

  return (
    <PageContainer>
      <PageHeader
        actions={parsed.filterRejected || data.totals.shipmentCount === 0 ? null : (
          <Button asChild variant="outline">
            <Link href={exportHref}><Download aria-hidden="true" />Ekspor CSV</Link>
          </Button>
        )}
        description="Rincian kiriman, biaya Mengantar, dan estimasi pencairan COD."
        eyebrow="Laporan"
        focusTargetId="shipment-report-heading"
        title="Laporan pengiriman"
      />

      <div className="grid min-w-0 gap-2">
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

      {/* Spec 10 §3 filter row: the active range sits under the row in text-xs muted. */}
      <div className="flex min-w-0 items-center gap-1">
        <p className="min-w-0 text-xs text-muted-foreground wrap-anywhere">
          {periodLabel} · {timezoneLabel} · {presetLabel}
        </p>
        <HelpHint label="Penjelasan periode laporan">
          <p>Periode memakai waktu kiriman dibuat.</p>
          <p>Menerapkan filter selalu kembali ke halaman pertama, dan ekspor CSV mengikuti filter yang sama.</p>
        </HelpHint>
      </div>
      </div>

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
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground" id="shipment-report-totals-title">
            Ringkasan periode
          </h2>
          <Badge variant="secondary">
            <span className="tabular-nums">{data.totals.shipmentCount}</span> kiriman
          </Badge>
          <HelpHint label="Penjelasan ringkasan periode">
            <p>Total dihitung atas seluruh baris yang cocok dengan filter, bukan hanya halaman ini.</p>
            <p>Estimasi dana dicairkan Mengantar = nilai COD dikurangi biaya kirim dan biaya COD.</p>
          </HelpHint>
        </div>
        {/* T-206 reference: the two totals side by side, each one bordered card with its table unframed inside. */}
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle id="shipment-report-courier-title">Total per kurir</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0">
              {data.totals.byCourier.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada kiriman pada periode ini.</p>
              ) : (
                <Table
                  containerClassName={inCardTableClassName}
                  containerProps={{ "aria-labelledby": "shipment-report-courier-title", role: "region", tabIndex: 0 }}
                >
                  <TableCaption className="sr-only">Total kiriman, biaya kirim Mengantar, biaya COD, dan estimasi dana dicairkan Mengantar per kurir.</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-3 whitespace-nowrap">Kurir</TableHead>
                      <TableHead className="px-3 text-right whitespace-nowrap">Kiriman</TableHead>
                      <TableHead className="px-3 text-right whitespace-nowrap">Biaya kirim Mengantar</TableHead>
                      <TableHead className="px-3 text-right whitespace-nowrap">Biaya COD</TableHead>
                      <TableHead className="px-3 text-right whitespace-nowrap">Estimasi dana dicairkan Mengantar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.totals.byCourier.map((total) => (
                      <TableRow key={total.courier ?? "tanpa-kurir"}>
                        <TableCell className="px-3 font-medium whitespace-nowrap">{total.courier ? courierDisplayName(total.courier) : "Belum ada kurir"}</TableCell>
                        <TableCell className="px-3 text-right tabular-nums whitespace-nowrap">{total.shipmentCount}</TableCell>
                        <TableCell className="px-3 text-right tabular-nums whitespace-nowrap">{formatIdr(total.shippingCostIdr)}</TableCell>
                        <TableCell className="px-3 text-right tabular-nums whitespace-nowrap">{formatIdr(total.codFeeIdr)}</TableCell>
                        {/* The reference highlights the payout column: weight, not colour (spec 10 §1.9). */}
                        <TableCell className="px-3 text-right font-semibold tabular-nums whitespace-nowrap">{formatIdr(total.codDisbursementEstimateIdr)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle id="shipment-report-lifecycle-title">Total per status</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0">
              {data.totals.byLifecycle.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada kiriman pada periode ini.</p>
              ) : (
                <Table
                  containerClassName={inCardTableClassName}
                  containerProps={{ "aria-labelledby": "shipment-report-lifecycle-title", role: "region", tabIndex: 0 }}
                >
                  <TableCaption className="sr-only">Total kiriman per status.</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-3 whitespace-nowrap">Status</TableHead>
                      <TableHead className="px-3 text-right whitespace-nowrap">Kiriman</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.totals.byLifecycle.map((total) => (
                      <TableRow key={total.status}>
                        <TableCell className="px-3 whitespace-nowrap">
                          <ShipmentStatusBadge
                            label={SHIPMENT_STATUS_PRESENTATION[total.status].label}
                            tone={SHIPMENT_STATUS_PRESENTATION[total.status].tone}
                          />
                        </TableCell>
                        <TableCell className="px-3 text-right font-semibold tabular-nums whitespace-nowrap">{total.shipmentCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <CourierPerformanceSection periodLabel={periodLabel} rows={courierPerformance} timezoneLabel={timezoneLabel} />

      <section aria-labelledby="shipment-report-rows-title" className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground" id="shipment-report-rows-title">Daftar kiriman</h2>
          {data.totals.shipmentCount > 0 ? <Badge variant="secondary"><span className="tabular-nums">{data.totals.shipmentCount}</span> baris</Badge> : null}
        </div>
        {data.rows.length === 0 ? (
          <EmptyState
            action={activeCount > 0 ? (
              <Button asChild><Link href="/app/laporan/pengiriman">Kembali ke filter aman</Link></Button>
            ) : (
              <Button asChild><Link href="/app/pengiriman/baru">Buat kiriman pertama</Link></Button>
            )}
            description={activeCount > 0
              ? "Longgarkan periode, outlet, kurir, atau status untuk melihat baris lain."
              : "Laporan terisi setelah kiriman pertama dibuat pada periode ini."}
            icon={FileSpreadsheet}
            title={activeCount > 0
              ? "Tidak ada kiriman yang cocok dengan filter ini."
              : "Belum ada kiriman pada periode ini."}
          />
        ) : (
          <>
          {/* Spec 10 §6/§9 (T-203): below md the rows are cards; the wide table keeps md and up. */}
          <RecordList initial={10} label="Baris laporan pengiriman">
            {data.rows.map((row) => {
              const created = formatWibDateTimeParts(row.createdAt);
              const carrier = row.providerService
                ? serviceDisplayName(row.providerService)
                : row.courier ? courierDisplayName(row.courier) : "Belum ada kurir";
              return (
                <RecordItem
                  key={row.shipmentId}
                  meta={<time dateTime={row.createdAt.toISOString()}>{created.date}</time>}
                  primary={areaDisplayCase(formatDistrictCity(row.destinationAreaLabel))}
                  secondary={`${carrier} · ${PAYMENT_METHOD_LABELS[row.paymentMethod]} · ${row.outletName}`}
                  status={(
                    <ShipmentStatusBadge
                      label={SHIPMENT_STATUS_PRESENTATION[row.status].label}
                      tone={SHIPMENT_STATUS_PRESENTATION[row.status].tone}
                    />
                  )}
                  title={(
                    <Link className={`inline-flex min-h-11 items-center whitespace-nowrap ${shipmentIdLinkClassName}`} href={shipmentDetailHref(row.publicReference)}>
                      {row.publicReference}
                    </Link>
                  )}
                  value={row.shippingCostIdr === null ? "Biaya kirim belum ada" : `Biaya kirim ${formatIdr(row.shippingCostIdr)}`}
                />
              );
            })}
          </RecordList>
          <Table
            className="min-w-[72rem]"
            containerClassName={cn(dataTableSurfaceClassName, desktopTableClassName)}
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
                {SHIPMENT_REPORT_COLUMNS.map((column, index) => {
                  const isFinancial = [8, 9, 10].includes(index);
                  return (
                    <TableHead
                      className={cn(
                        "px-3 whitespace-nowrap",
                        index === 0 && "sticky left-0 z-10 bg-inherit",
                        isFinancial && "text-right",
                      )}
                      key={column.metricId}
                    >
                      {column.label}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.shipmentId}>
                  <TableCell className="sticky left-0 z-10 bg-inherit px-3">
                    <Link className={`whitespace-nowrap ${shipmentIdLinkClassName}`} href={shipmentDetailHref(row.publicReference)}>{row.publicReference}</Link>
                    <span className="mt-0.5 block text-xs text-muted-foreground whitespace-nowrap">{row.outletName}</span>
                  </TableCell>
                  <TableCell className="px-3 whitespace-nowrap"><StackedDateTime value={row.createdAt} /></TableCell>
                  <TableCell className="px-3 whitespace-nowrap"><StackedDateTime value={row.issuedAt} /></TableCell>
                  <TableCell className="min-w-56 max-w-80 px-3 whitespace-normal break-words">{areaDisplayCase(row.destinationAreaLabel)}</TableCell>
                  <TableCell className="px-3 whitespace-nowrap font-medium">{row.courier ? courierDisplayName(row.courier) : "—"}</TableCell>
                  <TableCell className="px-3 whitespace-nowrap text-muted-foreground">{serviceDisplayName(row.providerService)}</TableCell>
                  <TableCell className="px-3 whitespace-nowrap">
                    <ShipmentStatusBadge
                      label={SHIPMENT_STATUS_PRESENTATION[row.status].label}
                      tone={SHIPMENT_STATUS_PRESENTATION[row.status].tone}
                    />
                  </TableCell>
                  <TableCell className="px-3 whitespace-nowrap font-medium">{PAYMENT_METHOD_LABELS[row.paymentMethod]}</TableCell>
                  {[row.shippingCostIdr, row.codFeeIdr, row.codDisbursementEstimateIdr].map((amount, index) => (
                    <TableCell className="px-3 text-right tabular-nums whitespace-nowrap font-medium" key={index}>
                      {amount === null ? "—" : formatIdr(amount)}
                    </TableCell>
                  ))}
                  <TableCell className="px-3 whitespace-nowrap text-muted-foreground">
                    {row.printCount > 0 ? `Sudah dicetak (${row.printCount}×)` : "Belum dicetak"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </>
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
