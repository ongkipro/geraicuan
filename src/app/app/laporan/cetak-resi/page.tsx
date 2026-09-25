import { CircleAlert, Printer } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PrintHistoryFilters } from "@/app/app/laporan/cetak-resi/print-history-filters";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { StackedDateTime } from "@/components/cms/shipment-table-cells";
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
import { loadAnalyticsFilterOptions } from "@/db/analytics-repository";
import { db } from "@/db/client";
import { loadPrintHistoryPage } from "@/db/label-print-repository";
import { withTenantContext } from "@/db/tenant-context";
import { analyticsIssueMessage, formatRangeLabel, parseAnalyticsRange } from "@/lib/analytics-range";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import {
  PRINT_ACTOR_ROLE_PRESENTATION,
  PRINT_OUTCOME_PRESENTATION,
  printReasonLabel,
} from "@/lib/print-history";
import { shipmentLabelHref } from "@/lib/shipment-number";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

type PrintHistoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PrintHistoryReportPage({ searchParams }: PrintHistoryPageProps) {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  // PR-55: the print record is an audit surface for the Tenant Admin. The
  // repository refuses any other role too, so this is not the only control.
  if (principal.role !== "TENANT_ADMIN") redirect("/app");

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/laporan/cetak-resi")
    : null;
  if (auditScenario === "print-history-error") {
    throw new Error("Intentional development-only print history failure.");
  }

  const now = new Date();
  const params = await searchParams;
  const range = parseAnalyticsRange(params, now);
  const options = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    loadAnalyticsFilterOptions,
  );
  const requestedOutlet = first(params.outlet);
  const knownOutlet = options.outlets.some((outlet) => outlet.id === requestedOutlet);
  // An outlet the tenant does not own is rejected, never silently applied.
  const outletId = requestedOutlet && knownOutlet ? requestedOutlet : null;
  const issues = [
    ...range.issues.map(analyticsIssueMessage),
    ...(requestedOutlet && !knownOutlet
      ? ["Outlet tidak tersedia pada tenant ini. Filter outlet diabaikan."]
      : []),
  ];

  const emptyPage = { generatedAt: now, rows: [], totalCount: 0 };
  const loaded = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => loadPrintHistoryPage(tx, context, { outletId, range }),
  );
  const data = auditScenario === "print-history-empty" ? emptyPage : loaded;
  const { periodLabel, presetLabel, timezoneLabel } = formatRangeLabel(range);
  const todayLocalDate = parseAnalyticsRange({ rentang: "hari-ini", tz: range.timezone }, now).startDate;
  const activeCount = Number(Boolean(outletId)) + Number(range.presetId !== "30-hari");
  const reprintedShipments = new Set(
    data.rows.filter((row) => row.reprintCount > 0).map((row) => row.shipmentId),
  ).size;

  return (
    <PageContainer>
      <PageHeader
        description="Siapa meminta cetak resi, kapan, dengan hasil apa, dan berapa kali resi yang sama dicetak ulang."
        eyebrow="Laporan"
        focusTargetId="print-history-heading"
        title="Riwayat cetak resi"
      />

      <PrintHistoryFilters
        activeCount={activeCount}
        outlets={options.outlets}
        rangeLabel={periodLabel}
        timezoneLabel={timezoneLabel}
        todayLocalDate={todayLocalDate}
        values={{
          endDate: range.lastIncludedDate,
          outletId,
          presetId: range.presetId,
          startDate: range.startDate,
        }}
      />

      <p className="max-w-2xl text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
        {periodLabel} · {timezoneLabel} · {presetLabel}
      </p>

      {issues.length > 0 ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Filter disesuaikan</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {issues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="print-history-rows-title" className="grid min-w-0 gap-3">
        <h2 className="text-sm font-medium text-foreground" id="print-history-rows-title">
          Permintaan cetak pada periode ini
        </h2>
        <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
          <span className="tabular-nums">{data.totalCount}</span> permintaan tercatat
          {data.totalCount > data.rows.length ? ` (menampilkan ${data.rows.length} terbaru)` : ""}
          {" · "}
          <span className="tabular-nums">{reprintedShipments}</span> kiriman pernah dicetak ulang.
          Cetak ulang dihitung dari urutan cetak berhasil kiriman itu sendiri, jadi cetak pertama bukan cetak ulang.
        </p>

        {data.rows.length === 0 ? (
          <EmptyState
            action={
              <Button asChild><Link href="/app/label">Buka Cetak resi</Link></Button>
            }
            description={activeCount > 0
              ? "Longgarkan periode atau outlet untuk melihat permintaan cetak lainnya."
              : "Permintaan cetak tercatat otomatis begitu resi pertama dicetak."}
            icon={Printer}
            title="Belum ada permintaan cetak pada periode ini."
          />
        ) : (
          <Table
            className="min-w-[60rem]"
            containerClassName="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            containerProps={{
              "aria-label": "Riwayat cetak resi; geser horizontal untuk melihat seluruh kolom",
              role: "region",
              tabIndex: 0,
            }}
          >
            <TableCaption className="sr-only">
              Permintaan cetak diurutkan dari yang terbaru.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-inherit px-3 text-xs font-semibold whitespace-nowrap">Nomor kiriman</TableHead>
                <TableHead className="px-3 text-xs font-semibold whitespace-nowrap">Waktu cetak</TableHead>
                <TableHead className="px-3 text-xs font-semibold whitespace-nowrap">Peran pelaku</TableHead>
                <TableHead className="px-3 text-xs font-semibold whitespace-nowrap">Hasil</TableHead>
                <TableHead className="px-3 text-xs font-semibold whitespace-nowrap">Alasan</TableHead>
                <TableHead className="px-3 text-right text-xs font-semibold whitespace-nowrap">Urutan cetak</TableHead>
                <TableHead className="px-3 text-right text-xs font-semibold whitespace-nowrap">Cetak ulang</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => {
                const outcome = PRINT_OUTCOME_PRESENTATION[row.outcome];
                return (
                  <TableRow className="group transition-colors hover:bg-muted/30" key={row.printEventId}>
                    <TableCell className="sticky left-0 z-10 bg-inherit px-3 font-medium group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]">
                      <Link
                        className="inline-flex min-h-11 items-center whitespace-nowrap font-mono font-semibold text-primary underline-offset-4 hover:underline md:min-h-8"
                        href={shipmentLabelHref(row.publicReference)}
                      >
                        {row.publicReference}
                      </Link>
                      <span className="mt-0.5 block text-xs text-muted-foreground whitespace-nowrap">{row.outletName}</span>
                    </TableCell>
                    <TableCell className="px-3 whitespace-nowrap text-xs"><StackedDateTime value={row.printedAt} /></TableCell>
                    <TableCell className="px-3 whitespace-nowrap text-xs font-medium">{PRINT_ACTOR_ROLE_PRESENTATION[row.actorRole]}</TableCell>
                    <TableCell className="px-3 whitespace-nowrap">
                      <ShipmentStatusBadge label={outcome.label} tone={outcome.tone} />
                    </TableCell>
                    <TableCell className="min-w-[12rem] max-w-[18rem] px-3 text-xs leading-relaxed whitespace-normal break-words">
                      {printReasonLabel(row.reasonCode)}
                    </TableCell>
                    <TableCell className="px-3 text-right text-xs tabular-nums font-medium">
                      {row.sequence === null ? "—" : `#${row.sequence}`}
                    </TableCell>
                    <TableCell className="px-3 text-right text-xs tabular-nums font-medium">{row.reprintCount}×</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </PageContainer>
  );
}
