"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * T-273 (optimize): the Dasbor's Recharts line loads after the page. The skeleton is the chart's
 * own box (`h-48`, full width), so the card does not move when it draws; "Lihat tabel data tren"
 * keeps every number in the server HTML.
 */
export const LazyTrendChart = dynamic(
  () => import("./trend-chart").then((module) => module.TrendChart),
  { loading: () => <Skeleton aria-hidden="true" className="h-48 w-full" data-slot="chart-skeleton" />, ssr: false },
);
