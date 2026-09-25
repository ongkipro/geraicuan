"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export type CourierPerformancePoint = {
  courier: string;
  /** Direct label beside the bar: "80% · 8/10". */
  label: string;
  /** Fewer answered submissions than the low-volume threshold. */
  lowVolume: boolean;
  rate: number;
};

const chartConfig = {
  rate: { color: "var(--chart-1)", label: "Tingkat penerbitan (%)" },
} satisfies ChartConfig;

/** Rows of the chart in rem, so its height follows the number of couriers. */
const ROW_REM = 2.75;

/**
 * "Performa kurir": horizontal bars from 0 to 100% in ranking order (`orderCouriersForRanking`),
 * the denominator written beside every bar so a rate never reads without its volume.
 */
export function CourierPerformanceChart({ data }: { data: CourierPerformancePoint[] }) {
  // lazy: ~7.5px per 13px glyph; measure the text if names or labels get longer.
  const longestLabel = Math.max(0, ...data.map((point) => point.label.length));
  const longestName = Math.max(0, ...data.map((point) => point.courier.length));
  return (
    <ChartContainer
      className="aspect-auto w-full"
      config={chartConfig}
      style={{ height: `${Math.max(2, data.length) * ROW_REM + 3}rem` }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ bottom: 8, left: 0, right: longestLabel * 7.5 + 12, top: 4 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis axisLine={false} domain={[0, 100]} tickLine={false} type="number" unit="%" />
        <YAxis axisLine={false} dataKey="courier" tickLine={false} type="category" width={Math.min(128, longestName * 7.5 + 8)} />
        <ChartTooltip content={<ChartTooltipContent hideIndicator />} cursor={false} />
        <Bar barSize={24} dataKey="rate" fill="var(--color-rate)" isAnimationActive={false} radius={4}>
          <LabelList className="fill-foreground" dataKey="label" fontSize={13} position="right" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
