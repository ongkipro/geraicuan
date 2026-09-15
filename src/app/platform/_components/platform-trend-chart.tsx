"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/** Plain serializable trend bucket; the server view maps repository rows into this. */
export type PlatformTrendPoint = {
  key: string;
  label: string;
  created: number;
  issued: number;
  failed: number;
};

// Okabe-Ito tokens only (spec 19 M-3). Each series also has its own dash
// pattern, repeated in the legend, so the three lines never rely on colour.
const series = [
  { key: "created", label: "Kiriman dibuat", color: "var(--chart-1)", dash: undefined, dashLabel: "garis penuh" },
  { key: "issued", label: "Resi terbit", color: "var(--chart-2)", dash: "6 4", dashLabel: "garis putus-putus" },
  { key: "failed", label: "Batch gagal", color: "var(--chart-5)", dash: "2 3", dashLabel: "garis titik-titik" },
] as const;

const chartConfig = Object.fromEntries(
  series.map(({ key, label, color }) => [key, { label, color }]),
) satisfies ChartConfig;

const countFormatter = new Intl.NumberFormat("id-ID");

export function PlatformTrendChart({
  data,
  granularity,
  periodLabel,
}: {
  data: PlatformTrendPoint[];
  granularity: "harian" | "bulanan";
  periodLabel: string;
}) {
  const unit = granularity === "harian" ? "hari" : "bulan";
  const latest = data.at(-1);

  return (
    <figure className="grid min-w-0 gap-3">
      <ul aria-label="Keterangan grafik" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {series.map(({ key, label, color, dash, dashLabel }) => (
          <li className="flex items-center gap-2" key={key}>
            <svg aria-hidden="true" className="shrink-0" height="8" width="24">
              <line stroke={color} strokeDasharray={dash} strokeLinecap="round" strokeWidth="2.5" x1="1" x2="23" y1="4" y2="4" />
            </svg>
            <span className="font-medium text-foreground">
              {label}
              <span className="sr-only"> ({dashLabel})</span>
            </span>
          </li>
        ))}
      </ul>
      <ChartContainer
        className="aspect-auto h-64 w-full rounded-md md:h-72"
        config={chartConfig}
      >
        <LineChart accessibilityLayer data={data} margin={{ bottom: 16, left: 8, right: 12, top: 12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="label"
            label={{ position: "insideBottom", offset: -12, value: granularity === "harian" ? "Tanggal" : "Bulan" }}
            minTickGap={28}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            domain={[0, "auto"]}
            label={{ angle: -90, position: "insideLeft", value: "Jumlah", style: { textAnchor: "middle" } }}
            tickLine={false}
            width={44}
          />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          {series.map(({ key, dash }) => (
            <Line
              activeDot={{ r: 5 }}
              dataKey={key}
              dot={false}
              isAnimationActive={false}
              key={key}
              stroke={`var(--color-${key})`}
              strokeDasharray={dash}
              strokeWidth={key === "failed" ? 2.5 : 2}
              type="linear"
            />
          ))}
        </LineChart>
      </ChartContainer>
      <figcaption className="max-w-2xl text-xs leading-5 text-muted-foreground">
        Jumlah kiriman dibuat, resi terbit, dan batch provider gagal per {unit} · {periodLabel}.{" "}
        {latest ? <>Nilai terakhir ({latest.label}): {series.map(({ key, label }) => `${label.toLocaleLowerCase("id-ID")} ${countFormatter.format(latest[key])}`).join(", ")}.{" "}</> : null}
        Garis putus-putus menandai resi terbit; garis titik-titik menandai batch gagal. Tabel lengkap tersedia di bawah grafik.
      </figcaption>
    </figure>
  );
}
