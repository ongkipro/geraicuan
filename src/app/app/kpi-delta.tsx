import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { toneClass } from "@/components/cms/shipment-status-badge";
import { formatAnalyticsComparison } from "@/lib/analytics-decision-context";
import { cn } from "@/lib/utils";

const countFormatter = new Intl.NumberFormat("id-ID");

/**
 * Spec 10 §6 / V-19: the one KPI change cue for Ringkasan (Analitik used it until T-204). The absolute
 * change leads so small bases do not read as dramatic ("Naik 13 (217%)" instead of "217%
 * lebih tinggi"); the percentage and the spoken sentence come from the shared analytics
 * comparison. The pill never wraps (V-18); the comparison basis follows it as plain muted
 * text, so the cue takes at most two lines in a 2-column card at 390px.
 *
 * Spec 10 §1.9 (T-203): the pill is neutral. Direction reads from the arrow and the word
 * ("Naik"/"Turun"); colour appears only when the caller names the change that needs a
 * decision (`attention`), e.g. a falling issuance rate.
 */
export function KpiDelta({
  attention,
  current,
  formatChange = (value) => countFormatter.format(value),
  previous,
  previousLabel,
  relative = true,
  unit = "",
}: {
  /** The change that calls for action; only a change in that direction gets the warn tone. */
  attention?: "rise" | "fall";
  current: number;
  /** Formats the absolute change and both values in the spoken sentence (count, rupiah, percentage points). */
  formatChange?: (value: number) => string;
  previous: number;
  previousLabel: string;
  /** Adds the relative change in parentheses; off for figures that are already a rate. */
  relative?: boolean;
  /** Spoken unit after the change, e.g. " kiriman". */
  unit?: string;
}) {
  const comparison = formatAnalyticsComparison(current, previous);
  const delta = current - previous;
  const percentage = comparison.text.match(/^(\d+)%/)?.[1];
  const magnitude = formatChange(Math.abs(delta));
  const change = delta === 0
    ? "Tidak berubah"
    : `${delta > 0 ? "Naik" : "Turun"} ${magnitude}${relative ? ` (${percentage ? `${percentage}%` : "dari 0"})` : ""}`;
  const Trend = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const needsAttention = delta !== 0 && attention === (delta > 0 ? "rise" : "fall");
  return (
    <span className="text-xs text-muted-foreground">
      <span aria-hidden="true">
        <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium tabular-nums", toneClass[needsAttention ? "warn" : "neutral"])} data-attention={needsAttention ? "true" : undefined} data-slot="kpi-delta">
          <Trend className="size-3.5 shrink-0" />
          {change}
        </span>
        {` vs ${previousLabel}`}
      </span>
      <span className="sr-only">{delta === 0 ? "" : `${delta > 0 ? "Naik" : "Turun"} ${magnitude}${unit}, dari ${formatChange(previous)} menjadi ${formatChange(current)}. `}{comparison.text}</span>
    </span>
  );
}
