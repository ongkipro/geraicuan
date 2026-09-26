"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export type RegionBarPoint = { count: number; name: string };

const chartConfig = {
  count: { color: "var(--chart-1)", label: "Kiriman" },
} satisfies ChartConfig;

const ROW_REM = 2.25;
const number = new Intl.NumberFormat("id-ID");
const MAX_NAME = 22;
const shortName = (name: string) => name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1).trimEnd()}…` : name;

/** T-235 "Wilayah tujuan": top wilayah by shipments, count written beside each bar, bars from zero. */
export function RegionBarChart({ data }: { data: RegionBarPoint[] }) {
  // lazy: ~7.5px per 13px glyph; names past 22 characters are cut (the full name is in the table
  // and the tooltip), so a long kabupaten name cannot squeeze the bars on a phone.
  const nameWidth = Math.max(0, ...data.map((point) => shortName(point.name).length)) * 7.5 + 12;
  return (
    <ChartContainer className="aspect-auto w-full min-w-0" config={chartConfig} style={{ height: `${Math.max(2, data.length) * ROW_REM + 2}rem` }}>
      <BarChart accessibilityLayer data={data} layout="vertical" margin={{ bottom: 4, left: 0, right: 40, top: 4 }}>
        <CartesianGrid horizontal={false} />
        <XAxis allowDecimals={false} axisLine={false} domain={[0, "auto"]} hide tickLine={false} type="number" />
        <YAxis axisLine={false} dataKey="name" interval={0} tickFormatter={shortName} tickLine={false} type="category" width={nameWidth} />
        <ChartTooltip content={<ChartTooltipContent hideIndicator />} cursor={false} />
        <Bar barSize={18} dataKey="count" fill="var(--color-count)" isAnimationActive={false} radius={4}>
          <LabelList className="fill-foreground" dataKey="count" fontSize={13} formatter={(value) => number.format(Number(value))} position="right" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
