import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiDelta = {
  /** Signed change against the comparison period. */
  change: number;
  /** Percentage change, `null` when the previous period was zero (M-0: no percentage, neutral). */
  percent: number | null;
};

const number = new Intl.NumberFormat("id-ID");

/**
 * Spec 19 M-0 (T-273): a change is coloured by what the metric wants, never by its sign. "up" =
 * more is better (volume, issuance), "down" = more is worse (returns, failures). A metric without
 * an entry keeps the neutral pill. The arrow and "Naik"/"Turun" carry the direction without
 * colour; the screen-reader text names the judgement the colour shows.
 */
export const KPI_BETTER_WHEN: Readonly<Record<string, "up" | "down">> = {
  "SHP-COD": "up",
  "SHP-CREATED": "up",
  "SHP-ISSUED": "up",
  "SHP-NONCOD": "up",
  "SHP-OUTCOME-FAILED": "down",
  "SHP-OUTCOME-RETURNED": "down",
};

/** The delta's tone for a metric: favourable (ok), unfavourable (danger) or neutral. */
export function deltaTone(metricId: string | undefined, change: number): "ok" | "danger" | "neutral" {
  const better = metricId ? KPI_BETTER_WHEN[metricId] : undefined;
  if (!better || change === 0) return "neutral";
  return (change > 0) === (better === "up") ? "ok" : "danger";
}

const DELTA_TONE = {
  danger: { className: "bg-danger-surface text-danger", sr: " (memburuk)" },
  neutral: { className: "bg-muted text-foreground", sr: "" },
  ok: { className: "bg-ok-surface text-ok", sr: " (membaik)" },
} as const;

/**
 * Spec 19 M-0 comparison wording: equal → "→ Tidak berubah"; previous 0 and current not 0 →
 * "• Belum ada pada periode sebelumnya" — no arrow and no favourable/unfavourable tone, because
 * a change from nothing has no size to judge; otherwise the count and its relative percentage.
 */
function deltaWords({ change, percent }: KpiDelta) {
  if (change === 0) return { icon: ArrowRight, neutral: true, text: "Tidak berubah" };
  if (percent === null) return { icon: null, neutral: true, text: "• Belum ada pada periode sebelumnya" };
  const size = `${number.format(Math.abs(change))} (${number.format(Math.round(Math.abs(percent)))}%)`;
  return change > 0
    ? { icon: ArrowUpRight, neutral: false, text: `Naik ${size}` }
    : { icon: ArrowDownRight, neutral: false, text: `Turun ${size}` };
}

/**
 * Spec 10 v3.2 §4.7: a borderless white card — label (15px muted) with the icon in a 40px pastel
 * chip at the right → value (30/700 navy) → a delta pill ("Naik n (x%)") toned by the metric's
 * desired direction (T-273, `deltaTone`) and the comparison period (13px).
 */
export function KpiCard({
  comparison = "vs periode sebelumnya",
  delta,
  icon: Icon,
  label,
  metricId,
  note,
  value,
}: {
  comparison?: string;
  delta?: KpiDelta;
  icon?: LucideIcon;
  label: string;
  /** Spec 19 metric ID of the value (`data-metric-id`). */
  metricId?: string;
  /** One 13px line under the value that says what it counts (a rate and its denominator). */
  note?: ReactNode;
  value: string | number;
}) {
  const words = delta ? deltaWords(delta) : null;
  const toneKey = delta && words && !words.neutral ? deltaTone(metricId, delta.change) : "neutral";
  const tone = DELTA_TONE[toneKey];
  return (
    <Card className="gap-3 [--card-spacing:--spacing(5)] max-md:[--card-spacing:--spacing(4)]" data-metric-id={metricId}>
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
      {note ? <p className="px-(--card-spacing) text-xs text-muted-foreground">{note}</p> : null}
      {words ? (
        <div className="flex flex-wrap items-center gap-2 px-(--card-spacing)">
          <span className={cn("inline-flex min-h-6 max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-xs leading-snug font-medium", tone.className)} data-delta-tone={toneKey}>
            {words.icon ? <words.icon aria-hidden="true" className="size-3.5" /> : null}
            {words.text}
            {tone.sr ? <span className="sr-only">{tone.sr}</span> : null}
          </span>
          {/* M-0: "Belum ada pada periode sebelumnya" already names the comparison. */}
          {delta && delta.percent === null && delta.change !== 0 ? null : <span className="text-xs text-muted-foreground">{comparison}</span>}
        </div>
      ) : null}
    </Card>
  );
}
