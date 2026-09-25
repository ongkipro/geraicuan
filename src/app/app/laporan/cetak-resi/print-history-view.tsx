import { CircleAlert, Printer, SearchX } from "lucide-react";
import Link from "next/link";

import {
  PRINT_HISTORY_PAGE_SIZE,
  PRINT_HISTORY_PATH,
  printHistoryHref,
  printOutcomeBadge,
  printSequenceLabel,
} from "@/app/app/laporan/cetak-resi/print-history-logic";
import { FilterSelect } from "@/app/app/laporan/_components/filter-select";
import { ReportPagination } from "@/app/app/laporan/_components/report-pagination";
import { DataCard } from "@/components/app/data-card";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PrintHistoryRow } from "@/db/label-print-repository";
import type { AnalyticsPresetId } from "@/lib/analytics-range";
import { formatWibDateTimeParts } from "@/lib/label-format";
import { PRINT_ACTOR_ROLE_PRESENTATION, printReasonLabel } from "@/lib/print-history";
import { shipmentDetailHref, shipmentLabelHref } from "@/lib/shipment-number";

export type PrintHistoryViewProps = {
  activeCount: number;
  carry: Record<string, string>;
  issues: string[];
  /** Rows loaded (the repository's newest-first ceiling), not only this page. */
  loadedCount: number;
  outletId: string | null;
  outlets: { label: string; value: string }[];
  page: number;
  range: { endDate: string; periodLabel: string; presetId: AnalyticsPresetId; startDate: string };
  rows: PrintHistoryRow[];
  /** Print events the filters match. */
  totalCount: number;
  totalPages: number;
};

const monoLink = "font-mono text-sm font-semibold text-primary hover:underline";

function PrintAction({ row }: { row: PrintHistoryRow }) {
  return (
    <Link
      className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary hover:underline max-md:min-h-11"
      href={shipmentLabelHref(row.publicReference)}
    >
      <Printer aria-hidden="true" className="size-4" />
      {row.outcome === "BLOCKED" ? "Coba lagi" : "Cetak ulang"}
      <span className="sr-only"> {row.publicReference}</span>
    </Link>
  );
}

/** Spec 17 §UX-v3.6 Riwayat cetak resi (ref `riwayat-cetak-resi.html`). */
export function PrintHistoryView({
  activeCount,
  carry,
  issues,
  loadedCount,
  outletId,
  outlets,
  page,
  range,
  rows,
  totalCount,
  totalPages,
}: PrintHistoryViewProps) {
  return (
    <>
      <PageHeader
        eyebrow="Laporan"
        title="Riwayat cetak resi"
      />

      <FilterBar action={PRINT_HISTORY_PATH} clearHref={activeCount > 0 ? PRINT_HISTORY_PATH : undefined} label="Filter riwayat cetak">
        <DateRangePicker
          endDate={range.endDate}
          label={range.periodLabel}
          presetId={range.presetId}
          startDate={range.startDate}
        />
        <FilterSelect allLabel="Semua outlet" label="Outlet" name="outlet" options={outlets} value={outletId} />
      </FilterBar>

      {issues.length > 0 ? (
        <Alert role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Filter disesuaikan</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {totalCount === 0 ? (
        <DataCard>
          {activeCount > 0 ? (
            // "Hapus filter" sits in the filter row right above; no second copy here.
            <EmptyState
              icon={SearchX}
              title="Tidak ada cetak resi yang cocok dengan filter ini"
            />
          ) : (
            <EmptyState
              action={<Button asChild variant="outline"><Link href="/app/label">Buka Cetak resi</Link></Button>}
              description="Setiap cetak resi tercatat di sini, termasuk yang ditolak sistem."
              icon={Printer}
              title="Belum ada cetak resi pada periode ini"
            />
          )}
        </DataCard>
      ) : (
        <DataCard
          count={totalCount}
          flush
          footer={(
            <ReportPagination
              hrefForPage={(target) => printHistoryHref(target, carry)}
              label="Halaman riwayat cetak"
              noun={loadedCount < totalCount ? `catatan terbaru (total ${totalCount.toLocaleString("id-ID")})` : "catatan"}
              page={page}
              pageSize={PRINT_HISTORY_PAGE_SIZE}
              total={loadedCount}
              totalPages={totalPages}
            />
          )}
          title="Daftar aktivitas cetak"
        >
          <div className="xl:hidden">
            <RecordList label="Daftar aktivitas cetak">
              {rows.map((row) => {
                const badge = printOutcomeBadge(row.outcome);
                const printed = formatWibDateTimeParts(row.printedAt);
                return (
                  <RecordItem
                    detail={(
                      <div className="flex items-center justify-between gap-3">
                        <time className="text-xs text-muted-foreground" dateTime={row.printedAt.toISOString()}>
                          {printed.date}, {printed.time}
                        </time>
                        <PrintAction row={row} />
                      </div>
                    )}
                    href={shipmentDetailHref(row.publicReference)}
                    key={row.printEventId}
                    meta={[
                      row.outletName,
                      printSequenceLabel(row.sequence),
                      row.outcome === "BLOCKED" ? printReasonLabel(row.reasonCode) : null,
                    ].filter(Boolean).join(" · ")}
                    status={<StatusBadge label={badge.label} tone={badge.tone} />}
                    subtitle={PRINT_ACTOR_ROLE_PRESENTATION[row.actorRole]}
                    title={<span className="font-mono">{row.publicReference}</span>}
                  />
                );
              })}
            </RecordList>
          </div>
          <div className="max-xl:hidden">
          <Table aria-label="Daftar aktivitas cetak">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Nomor</TableHead>
                <TableHead>Waktu</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Hasil</TableHead>
                <TableHead>Urutan</TableHead>
                <TableHead className="pr-6 text-right">Tindakan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const badge = printOutcomeBadge(row.outcome);
                const printed = formatWibDateTimeParts(row.printedAt);
                return (
                  <TableRow key={row.printEventId}>
                    <TableCell className="pl-6">
                      <Link className={monoLink} href={shipmentDetailHref(row.publicReference)}>{row.publicReference}</Link>
                      <span className="block text-xs text-muted-foreground">{row.outletName}</span>
                    </TableCell>
                    <TableCell>
                      <time dateTime={row.printedAt.toISOString()}>
                        <span className="block">{printed.date}</span>
                        <span className="block text-xs text-muted-foreground">{printed.time}</span>
                      </time>
                    </TableCell>
                    <TableCell><Badge variant="outline">{PRINT_ACTOR_ROLE_PRESENTATION[row.actorRole]}</Badge></TableCell>
                    <TableCell>
                      <StatusBadge label={badge.label} tone={badge.tone} />
                      {row.outcome === "BLOCKED" ? (
                        <span className="mt-1 block text-xs text-muted-foreground">{printReasonLabel(row.reasonCode)}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{printSequenceLabel(row.sequence)}</TableCell>
                    <TableCell className="pr-6 text-right"><PrintAction row={row} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </DataCard>
      )}
    </>
  );
}
