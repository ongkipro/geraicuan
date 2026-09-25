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

type DashboardPeriodChartPoint = {
  currentCount: number;
  label: string;
  previousCount: number | null;
  previousLabel: string;
};

export function DashboardPeriodChart({ data, sevenDays, compare }: { data: DashboardPeriodChartPoint[]; sevenDays: boolean; compare: boolean }) {
  const chartConfig = {
    currentCount: { color: "var(--primary)", label: sevenDays ? "7 hari terakhir" : "Periode dipilih" },
    previousCount: { color: "var(--muted-foreground)", label: sevenDays ? "7 hari sebelumnya" : "Periode sebelumnya" },
  } satisfies ChartConfig;

  return (
    <figure className="flex min-w-0 flex-col gap-3 lg:flex-1">
      {/* The wrapper owns the size: fixed below lg, growing into the stretched card row from lg. The absolutely positioned plot never feeds its own rendered size back into that height, and aspect-auto + min-w-0 keep it shrinking with its card (clipped ticks at 390/768px). */}
      <div className="relative h-60 min-w-0 sm:h-72 lg:h-auto lg:min-h-72 lg:flex-1">
        <ChartContainer className="absolute inset-0 aspect-auto h-full w-full min-w-0" config={chartConfig}>
          <LineChart accessibilityLayer data={data} margin={{ left: 0, right: 16, top: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis axisLine={false} dataKey="label" interval="preserveStartEnd" minTickGap={8} padding={{ left: 12, right: 12 }} tickFormatter={(label: string) => compare && data.length <= 7 ? label.replace(/ \d{4}$/, "") : label} tickLine={false} tickMargin={8} />
            <YAxis allowDecimals={false} axisLine={false} domain={[0, "auto"]} tickLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(label, payload) => compare ? `${label} · pembanding ${payload[0]?.payload.previousLabel ?? "—"}` : label} />} />
            <ChartLegend align="left" verticalAlign="top" content={<ChartLegendContent className="justify-start" />} />
            <Line dataKey="currentCount" dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} stroke="var(--color-currentCount)" strokeWidth={2.5} type="monotone" />
            {compare ? <Line dataKey="previousCount" dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} stroke="var(--color-previousCount)" strokeDasharray="5 4" strokeWidth={2} type="monotone" /> : null}
          </LineChart>
        </ChartContainer>
      </div>
      <figcaption className="max-w-2xl text-xs leading-5 text-muted-foreground">{compare ? "Total kiriman dibuat (COD + non-COD), disejajarkan menurut urutan hari. Garis putus-putus menunjukkan periode sebelumnya." : "Total kiriman dibuat (COD + non-COD) per bulan. Pilih rentang maksimal 31 hari untuk membandingkan dua periode."}{sevenDays ? " Data hari ini masih berjalan." : null}</figcaption>
    </figure>
  );
}
