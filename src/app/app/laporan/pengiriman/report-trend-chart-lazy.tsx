"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * T-273 (optimize): Recharts loads after the page, not with it. The skeleton has the chart's own
 * box (`h-56`, full width), so nothing moves when the line draws; the trend's numbers stay in the
 * server HTML (legend totals and "Lihat tabel data tren"), so no figure waits for this chunk.
 */
export const LazyReportTrendChart = dynamic(
  () => import("@/app/app/laporan/pengiriman/report-trend-chart").then((module) => module.ReportTrendChart),
  { loading: () => <Skeleton aria-hidden="true" className="h-56 w-full" data-slot="chart-skeleton" />, ssr: false },
);
