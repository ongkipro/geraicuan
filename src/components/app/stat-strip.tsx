import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Spec 10 §4.6b cell anatomy, shared by the Laporan Ringkasan (T-251) and the platform strips
 * (T-257): label 13/500 muted, value 20/600 tabular, an optional 13px muted note.
 */
export const STAT_CELL = "flex min-w-0 flex-col gap-1 bg-card px-3 py-2.5 @xl:px-4 @xl:py-3";
export const STAT_LABEL = "flex items-center gap-1.5 text-xs font-medium text-muted-foreground";
export const STAT_VALUE = "text-xl leading-none font-semibold tabular-nums text-foreground";
export const STAT_NOTE = "text-xs tabular-nums text-muted-foreground";

export type StatItem = {
  /** Beside the value, e.g. a severity badge; only where it changes a decision. */
  badge?: ReactNode;
  key: string;
  label: ReactNode;
  /** Spec 19 metric ID of the value, emitted as `data-metric-id`. */
  metric: string;
  note?: ReactNode;
  value: ReactNode;
};

/**
 * T-257: a §4.6 stat strip of figures that are not filters (no link, hover or selected state):
 * one white card whose cells are split by 1px `--border` dividers. Two columns in a narrow strip
 * (an odd last cell spans both, so no divider frames a hole), one content-sized row from a 56rem
 * strip. Every figure is a `<dd>` after its `<dt>` label.
 */
export function StatStrip({ items, label }: { items: StatItem[]; label: string }) {
  return (
    <div aria-label={label} className="@container overflow-hidden rounded-2xl bg-card shadow-card" role="group">
      <dl className="grid grid-cols-2 gap-px bg-border @4xl:flex">
        {items.map((item, index) => (
          <div
            className={cn(STAT_CELL, "@4xl:flex-auto", items.length % 2 === 1 && index === items.length - 1 && "col-span-2")}
            data-metric-id={item.metric}
            key={item.key}
          >
            <dt className={STAT_LABEL}>{item.label}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className={STAT_VALUE}>{item.value}</span>
              {item.badge}
            </dd>
            {item.note ? <dd className={STAT_NOTE}>{item.note}</dd> : null}
          </div>
        ))}
      </dl>
    </div>
  );
}
