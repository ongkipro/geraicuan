"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type DashboardPeriodChartPoint = {
  codCount: number;
  label: string;
  nonCodCount: number;
};

const chartConfig = {
  codCount: { color: "var(--chart-1)", label: "COD" },
  nonCodCount: { color: "var(--chart-2)", label: "Non-COD" },
} satisfies ChartConfig;

export function DashboardPeriodChart({ data }: { data: DashboardPeriodChartPoint[] }) {
  return (
    <figure className="space-y-3">
      <ChartContainer className="min-h-64 w-full" config={chartConfig}>
        <BarChart accessibilityLayer data={data} margin={{ left: 0, right: 12, top: 12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis axisLine={false} dataKey="label" minTickGap={24} tickLine={false} tickMargin={8} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={32} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="codCount" fill="var(--color-codCount)" radius={[3, 3, 0, 0]} stackId="input" />
          <Bar dataKey="nonCodCount" fill="var(--color-nonCodCount)" radius={[3, 3, 0, 0]} stackId="input" stroke="var(--foreground)" strokeDasharray="3 2" strokeWidth={1} />
        </BarChart>
      </ChartContainer>
      <figcaption className="text-xs leading-5 text-muted-foreground">Jumlah input per hari/bulan. Non-COD memakai outline putus-putus; seluruh angka tersedia pada tabel data.</figcaption>
    </figure>
  );
}
