"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export type TrendPoint = { current: number; label: string; previous: number | null; previousLabel: string };

/**
 * "Grafik kiriman": this period as a solid primary line, the previous one dashed in the input grey
 * (reference `dasbor.html`). The legend sits in the card header, so the chart draws none.
 */
export function TrendChart({ compare, data }: { compare: boolean; data: TrendPoint[] }) {
  const config = {
    current: { color: "var(--primary)", label: "Periode ini" },
    previous: { color: "var(--input)", label: "Periode lalu" },
  } satisfies ChartConfig;
  return (
    <ChartContainer className="aspect-auto h-48 w-full min-w-0" config={config}>
      <LineChart accessibilityLayer data={data} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="4 4" vertical={false} />
        <XAxis axisLine={false} dataKey="label" interval="preserveStartEnd" minTickGap={12} tickFormatter={(label: string) => label.replace(/ \d{4}$/, "")} tickLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} domain={[0, "auto"]} hide />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(label, payload) => compare ? `${label} · lalu ${payload[0]?.payload.previousLabel ?? "—"}` : label} />} />
        {compare ? <Line dataKey="previous" dot={false} isAnimationActive={false} stroke="var(--color-previous)" strokeDasharray="3 3" strokeWidth={1.5} type="linear" /> : null}
        <Line activeDot={{ r: 4 }} dataKey="current" dot={false} isAnimationActive={false} stroke="var(--color-current)" strokeWidth={2} type="linear" />
      </LineChart>
    </ChartContainer>
  );
}
