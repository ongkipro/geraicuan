"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type ShipmentTrendPoint = {
  createdCount: number;
  issuedCount: number;
  label: string;
};

const chartConfig = {
  createdCount: { color: "var(--chart-4)", label: "Kiriman dibuat" },
  issuedCount: { color: "var(--chart-2)", label: "Resi terbit" },
} satisfies ChartConfig;

export function ShipmentTrendChart({
  data,
  granularity,
}: {
  data: ShipmentTrendPoint[];
  granularity: "harian" | "bulanan";
}) {
  return (
    <figure className="space-y-3">
      <ChartContainer className="h-72 w-full" config={chartConfig}>
        <LineChart
          accessibilityLayer
          data={data}
          margin={{ left: 0, right: 12, top: 12 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="label"
            minTickGap={28}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={32} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            activeDot={{ r: 5 }}
            dataKey="createdCount"
            dot={false}
            isAnimationActive={false}
            stroke="var(--color-createdCount)"
            strokeWidth={2}
            type="monotone"
          />
          <Line
            activeDot={{ r: 5 }}
            dataKey="issuedCount"
            dot={false}
            isAnimationActive={false}
            stroke="var(--color-issuedCount)"
            strokeDasharray="5 4"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ChartContainer>
      <figcaption className="max-w-2xl text-xs leading-5 text-muted-foreground">
        Perbandingan kiriman dibuat dan resi terbit per {granularity === "harian" ? "hari" : "bulan"}. Garis putus-putus menandai resi terbit.
      </figcaption>
    </figure>
  );
}
