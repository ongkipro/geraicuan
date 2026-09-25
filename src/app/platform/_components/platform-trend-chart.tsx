"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export type PlatformTrendPoint = { created: number; issued: number; label: string };

const config = {
  created: { color: "var(--chart-1)", label: "Kiriman dibuat" },
  issued: { color: "var(--chart-2)", label: "Resi terbit" },
} satisfies ChartConfig;

/**
 * "Tren kiriman seluruh tenant" (reference `platform-ringkasan.html`): kiriman dibuat as the
 * filled series, resi terbit as a line; the legend sits in the card header.
 */
export function PlatformTrendChart({ data }: { data: PlatformTrendPoint[] }) {
  return (
    <ChartContainer className="aspect-auto h-52 w-full min-w-0" config={config}>
      <AreaChart accessibilityLayer data={data} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="4 4" vertical={false} />
        <XAxis axisLine={false} dataKey="label" interval="preserveStartEnd" minTickGap={16} tickFormatter={(label: string) => label.replace(/ \d{4}$/, "")} tickLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} axisLine={false} domain={[0, "auto"]} tickLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area dataKey="created" dot={false} fill="var(--color-created)" fillOpacity={0.12} isAnimationActive={false} stroke="var(--color-created)" strokeWidth={2} type="linear" />
        <Area dataKey="issued" dot={false} fill="transparent" isAnimationActive={false} stroke="var(--color-issued)" strokeDasharray="4 3" strokeWidth={2} type="linear" />
      </AreaChart>
    </ChartContainer>
  );
}
