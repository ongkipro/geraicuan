import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";

export type KpiDelta = {
  /** Signed change against the comparison period. */
  change: number;
  /** Percentage change, `null` when the previous period was zero. */
  percent: number | null;
};

const number = new Intl.NumberFormat("id-ID");

function deltaWords({ change, percent }: KpiDelta) {
  if (change === 0) return { icon: ArrowRight, text: "Tetap" };
  const size = `${number.format(Math.abs(change))}${percent === null ? "" : ` (${number.format(Math.round(Math.abs(percent)))}%)`}`;
  return change > 0
    ? { icon: ArrowUpRight, text: `Naik ${size}` }
    : { icon: ArrowDownRight, text: `Turun ${size}` };
}

/**
 * Spec 10 v3.2 §4.7: a borderless white card — label (15px muted) with the icon in a 40px pastel
 * chip at the right → value (30/700 navy) → a neutral delta pill ("Naik n (x%)") and the
 * comparison period (13px).
 */
export function KpiCard({
  comparison = "vs periode sebelumnya",
  delta,
  icon: Icon,
  label,
  value,
}: {
  comparison?: string;
  delta?: KpiDelta;
  icon?: LucideIcon;
  label: string;
  value: string | number;
}) {
  const words = delta ? deltaWords(delta) : null;
  return (
    <Card className="gap-3 [--card-spacing:--spacing(5)] max-md:[--card-spacing:--spacing(4)]">
      <div className="flex items-center justify-between gap-2 px-(--card-spacing)">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
            <Icon className="size-5" />
          </span>
        ) : null}
      </div>
      <p className="px-(--card-spacing) text-3xl font-bold tabular-nums text-foreground">
        {typeof value === "number" ? number.format(value) : value}
      </p>
      {words ? (
        <div className="flex flex-wrap items-center gap-2 px-(--card-spacing)">
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs font-medium text-foreground">
            <words.icon aria-hidden="true" className="size-3.5" />
            {words.text}
          </span>
          <span className="text-xs text-muted-foreground">{comparison}</span>
        </div>
      ) : null}
    </Card>
  );
}
