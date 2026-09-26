"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export type ReportTrendPoint = { cod: number; codValue: number; label: string; nonCod: number };

const count = new Intl.NumberFormat("id-ID");
const compactIdr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1, notation: "compact" });
const idr = new Intl.NumberFormat("id-ID", { currency: "IDR", maximumFractionDigits: 0, style: "currency" });

const countConfig = {
  cod: { color: "var(--chart-1)", label: "COD" },
  nonCod: { color: "var(--chart-2)", label: "Non-COD" },
} satisfies ChartConfig;
const valueConfig = {
  codValue: { color: "var(--chart-1)", label: "Nilai COD" },
} satisfies ChartConfig;

const shortLabel = (label: string) => label.replace(/ \d{4}$/, "");

/**
 * T-235 "Tren harian": shipments created per WIB bucket, COD solid and Non-COD dashed (spec 19 M-3:
 * a series never depends on colour alone), or the COD value per bucket. Axes start at zero; ticks and
 * tooltip values are id-ID (T-254: the count tooltip no longer follows the browser locale).
 */
export function ReportTrendChart({ data, mode }: { data: ReportTrendPoint[]; mode: "count" | "value" }) {
  const common = (
    <>
      <CartesianGrid strokeDasharray="4 4" vertical={false} />
      <XAxis axisLine={false} dataKey="label" interval="preserveStartEnd" minTickGap={16} tickFormatter={shortLabel} tickLine={false} tickMargin={8} />
    </>
  );
  if (mode === "value") {
    return (
      <ChartContainer className="aspect-auto h-56 w-full min-w-0" config={valueConfig}>
        <LineChart accessibilityLayer data={data} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
          {common}
          <YAxis axisLine={false} domain={[0, "auto"]} tickFormatter={(value: number) => compactIdr.format(value)} tickLine={false} width={48} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => <span className="font-medium tabular-nums">{idr.format(Number(value))}</span>} />} />
          <Line activeDot={{ r: 4 }} dataKey="codValue" dot={false} isAnimationActive={false} stroke="var(--color-codValue)" strokeWidth={2} type="linear" />
        </LineChart>
      </ChartContainer>
    );
  }
  return (
    <ChartContainer className="aspect-auto h-56 w-full min-w-0" config={countConfig}>
      <LineChart accessibilityLayer data={data} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
        {common}
        <YAxis allowDecimals={false} axisLine={false} domain={[0, "auto"]} tickFormatter={(value: number) => count.format(value)} tickLine={false} width={32} />
        <ChartTooltip
          content={(
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <>
                  <span aria-hidden="true" className="size-2.5 shrink-0 self-center rounded-xs" style={{ background: item.color }} />
                  <span className="flex flex-1 items-center justify-between gap-4">
                    <span className="text-muted-foreground">{countConfig[name as keyof typeof countConfig]?.label ?? name}</span>
                    <span className="font-medium tabular-nums">{count.format(Number(value))}</span>
                  </span>
                </>
              )}
            />
          )}
        />
        <Line activeDot={{ r: 4 }} dataKey="cod" dot={false} isAnimationActive={false} stroke="var(--color-cod)" strokeWidth={2} type="linear" />
        <Line activeDot={{ r: 4 }} dataKey="nonCod" dot={false} isAnimationActive={false} stroke="var(--color-nonCod)" strokeDasharray="5 4" strokeWidth={2} type="linear" />
      </LineChart>
    </ChartContainer>
  );
}
