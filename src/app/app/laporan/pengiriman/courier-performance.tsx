import { ChevronDown } from "lucide-react";

import { CourierIssueRateChart } from "@/app/app/laporan/pengiriman/courier-issue-rate-chart";
import { courierIssueRate, isLowVolumeCourier, lowVolumeLabel, orderCouriersForRanking } from "@/app/app/laporan/pengiriman/courier-volume";
import { HelpHint } from "@/components/cms/help-hint";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CourierPerformanceRow } from "@/db/analytics-repository";
import { serviceDisplayName } from "@/lib/labels/courier";

const countFormatter = new Intl.NumberFormat("id-ID");

/**
 * T-204: spec 19 M-3 "Performa kurir", moved from the retired Analitik page.
 * Same repository read (`loadCourierPerformance`, resolved-outcome basis) and
 * the same presentation-only ranking: a low-volume courier never outranks a
 * higher-volume one by rate alone.
 */
export function CourierPerformanceSection({ periodLabel, rows, timezoneLabel }: {
  periodLabel: string;
  /** `null` when the read failed; the rest of the report stays available. */
  rows: readonly CourierPerformanceRow[] | null;
  timezoneLabel: string;
}) {
  const couriers = rows ? orderCouriersForRanking(rows).map((row) => ({
    ...row,
    lowVolume: row.resolvedSubmissionCount > 0 && isLowVolumeCourier(row),
    rate: courierIssueRate(row),
  })) : [];
  const chartData = couriers
    .filter((row) => row.resolvedSubmissionCount > 0)
    .map((row) => ({
      courier: serviceDisplayName(row.courier),
      label: row.lowVolume
        ? `${countFormatter.format(row.rate)}% · ${lowVolumeLabel(row)}`
        : `${countFormatter.format(row.rate)}% · ${countFormatter.format(row.issuedCount)}/${countFormatter.format(row.resolvedSubmissionCount)}`,
      lowVolume: row.lowVolume,
      rate: row.rate,
    }));

  return (
    <section aria-labelledby="shipment-report-courier-performance-title" className="min-w-0">
      <Card className="min-w-0">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-1">
          <CardTitle id="shipment-report-courier-performance-title">Performa kurir</CardTitle>
          <HelpHint label="Penjelasan performa kurir">
            <p>Resi terbit dibagi pengajuan yang sudah dijawab Mengantar.</p>
            <p>Dihitung pada waktu jawaban Mengantar, bukan waktu kiriman dibuat.</p>
          </HelpHint>
        </div>
        <CardDescription>{periodLabel} · {timezoneLabel}</CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
      {rows === null ? (
        <Alert role="alert" variant="destructive">
          <AlertTitle>Performa kurir tidak dapat dimuat</AlertTitle>
          <AlertDescription>Ringkasan dan baris laporan tetap tersedia. Muat ulang halaman untuk mencoba lagi.</AlertDescription>
        </Alert>
      ) : couriers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada pengajuan yang dijawab Mengantar pada filter ini.</p>
      ) : (
        <>
          {chartData.length > 0 ? <CourierIssueRateChart data={chartData} /> : null}
          <details className="group border-t pt-2" data-report-detail="couriers">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 [&::-webkit-details-marker]:hidden">
              <span>Lihat detail performa kurir <span className="font-normal text-muted-foreground">({countFormatter.format(couriers.length)})</span></span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="pt-3">
              <Table className="min-w-sm" containerClassName="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" containerProps={{ "aria-label": "Tabel performa kurir", role: "region", tabIndex: 0 }}>
                <TableCaption className="sr-only">Perbandingan kurir berdasarkan waktu jawaban Mengantar / {periodLabel} / {timezoneLabel}.</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3">Kurir</TableHead>
                    <TableHead className="px-3 text-right">Resi terbit</TableHead>
                    <TableHead className="px-3 text-right">Pengajuan dijawab</TableHead>
                    <TableHead className="px-3 text-right">Tingkat penerbitan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {couriers.map((row) => (
                    <TableRow key={row.courier}>
                      <TableCell className="px-3 font-medium" scope="row">{serviceDisplayName(row.courier)}</TableCell>
                      <TableCell className="px-3 text-right tabular-nums">{countFormatter.format(row.issuedCount)}</TableCell>
                      <TableCell className="px-3 text-right tabular-nums">{countFormatter.format(row.resolvedSubmissionCount)}</TableCell>
                      <TableCell className="px-3 text-right tabular-nums">
                        {countFormatter.format(row.rate)}%
                        {row.lowVolume ? <span className="block text-xs text-muted-foreground">{lowVolumeLabel(row)}</span> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        </>
      )}
      </CardContent>
      </Card>
    </section>
  );
}
