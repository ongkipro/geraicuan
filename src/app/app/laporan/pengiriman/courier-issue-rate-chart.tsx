"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type CourierIssueRatePoint = {
  courier: string;
  /** Direct label: "80% · 8/10", or "60% · Volume rendah (n = 5)" for low-volume rows (n is the denominator). */
  label: string;
  lowVolume: boolean;
  rate: number;
};

const chartConfig = {
  rate: { color: "var(--chart-4)", label: "Tingkat penerbitan (%)" },
} satisfies ChartConfig;

/**
 * M-3 "Which courier issues reliably?": horizontal bars from zero, denominator
 * in the label. `data` arrives in ranking order (orderCouriersForRanking):
 * low-volume rows are marked in their label and follow the higher-volume rows.
 */
export function CourierIssueRateChart({ data }: { data: CourierIssueRatePoint[] }) {
  // lazy: ~7px per 13px glyph estimate; measure text if labels get localized longer.
  const longestLabel = Math.max(0, ...data.map((point) => point.label.length));
  const labelMargin = Math.max(96, Math.ceil(longestLabel * 7) + 12);
  const hasLowVolume = data.some((point) => point.lowVolume);

  return (
    <figure className="space-y-3">
      <ChartContainer className="w-full" config={chartConfig} style={{ height: `${Math.max(2, data.length) * 44 + 48}px` }}>
        <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 0, right: labelMargin, top: 4, bottom: 16 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis axisLine={false} domain={[0, 100]} label={{ value: "Tingkat penerbitan (%)", position: "insideBottom", offset: -8 }} tickLine={false} type="number" unit="%" />
          <YAxis axisLine={false} dataKey="courier" tickLine={false} type="category" width={112} />
          <ChartTooltip content={<ChartTooltipContent hideIndicator />} cursor={false} />
          <Bar dataKey="rate" fill="var(--color-rate)" isAnimationActive={false} radius={4}>
            <LabelList className="fill-foreground" dataKey="label" fontSize={13} position="right" />
          </Bar>
        </BarChart>
      </ChartContainer>
      <figcaption className="max-w-2xl text-xs leading-5 text-muted-foreground">
        Diurutkan dari tingkat penerbitan tertinggi.{hasLowVolume ? " Volume rendah: kurang dari 10 pengajuan dijawab, diurutkan terakhir." : ""} Nilai lengkap ada di tabel.
      </figcaption>
    </figure>
  );
}
