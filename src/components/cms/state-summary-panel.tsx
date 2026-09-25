import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * PR-52 state summary panel — one component for every operational list page.
 *
 * Each entry is a filter, not decoration: it is a real submit button carrying
 * the page's own URL parameter, so choosing one writes the page's existing URL
 * state and the result stays a shareable link. A native `<button>` is what
 * makes `aria-pressed` legal ARIA and gives keyboard operation (Enter and
 * Space) without a key handler of our own; a link cannot carry `aria-pressed`.
 * The whole panel is a GET form, so it needs no JavaScript.
 *
 * The active entry is marked three ways, none of them colour alone:
 * `aria-pressed="true"` for assistive technology, a check glyph, and a solid
 * rather than dashed border.
 */

export type StateSummaryEntry = {
  count: number;
  /** One line of meaning under the count. */
  description: string;
  label: string;
  /** Metric ID in `docs/spec/19-METRICS-ANALYTICS-CONTRACT.md`. */
  metricId: string;
  /** Value written to the panel's URL parameter. */
  value: string;
};

export type StateSummaryPanelProps = {
  /** GET target, e.g. "/app/pengiriman". */
  action: string;
  entries: readonly StateSummaryEntry[];
  /** Accessible name for the entry list, e.g. "Ringkasan status kiriman". */
  label: string;
  /** URL parameter each entry writes, e.g. "status". */
  param: string;
  /**
   * Other URL state to keep across the filter. Omit `page`: applying a filter
   * always starts on page one, exactly as the existing facet links do.
   */
  preserved?: Readonly<Record<string, string | undefined>>;
  selected: string;
  /**
   * What the page's active filter is called, when it is not one of the entries.
   * `/app/pengiriman` keeps a fuller status control beside this panel, so a
   * value like "Perlu tindakan" leaves every entry unpressed — and a panel that
   * shows nothing selected while the list underneath is filtered reads as a
   * panel that is simply not in use. Naming the active filter says otherwise.
   */
  selectedElsewhereLabel?: string;
  /**
   * T-188: "segmented" is the compact form the contact lists use — one row of
   * label + count toggles that sits in a toolbar beside search. The entry's
   * description stays available to assistive technology, not on screen.
   */
  variant?: "cards" | "segmented";
};

const countFormatter = new Intl.NumberFormat("id-ID");

export function StateSummaryPanel({
  action,
  entries,
  label,
  param,
  preserved,
  selected,
  selectedElsewhereLabel,
  variant = "cards",
}: StateSummaryPanelProps) {
  const selectedHere = entries.some((entry) => entry.value === selected);
  if (variant === "segmented") {
    return (
      <form action={action} className="min-w-0" data-slot="state-summary-panel" method="get">
        {Object.entries(preserved ?? {}).map(([name, value]) =>
          value === undefined || value === "" || name === param
            ? null
            : <input key={name} name={name} type="hidden" value={value} />,
        )}
        <ul aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border/60 bg-muted/60 backdrop-blur-md p-1">
          {entries.map((entry) => {
            const active = entry.value === selected;
            return (
              <li key={entry.value}>
                <button
                  aria-pressed={active}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-border/80 bg-background font-semibold text-foreground shadow-xs"
                      : "border-transparent font-medium text-muted-foreground hover:bg-background/60 hover:text-foreground",
                  )}
                  data-metric-id={entry.metricId}
                  name={param}
                  type="submit"
                  value={entry.value}
                >
                  {active ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  <span>{entry.label}</span>
                  <span className="font-mono tabular-nums">{countFormatter.format(entry.count)}</span>
                  <span className="sr-only">. {entry.description}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </form>
    );
  }
  return (
    <form action={action} className="grid min-w-0 gap-2" data-slot="state-summary-panel" method="get">
      {Object.entries(preserved ?? {}).map(([name, value]) =>
        value === undefined || value === "" || name === param
          ? null
          : <input key={name} name={name} type="hidden" value={value} />,
      )}
      {/* Wraps on a grid rather than scrolling: two columns at phone width,
          never an overflow container. */}
      <ul
        aria-label={label}
        className="grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6"
      >
        {entries.map((entry) => {
          const active = entry.value === selected;
          return (
            <li className="min-w-0" key={entry.value}>
              <button
                aria-pressed={active}
                className={cn(
                  "flex h-full min-h-11 w-full flex-col items-start gap-1 rounded-xl border px-3.5 py-2.5 text-left outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary/10 shadow-xs text-foreground font-medium"
                    : "border-border/70 border-dashed bg-card/70 hover:border-border hover:bg-card hover:shadow-2xs",
                )}
                data-metric-id={entry.metricId}
                name={param}
                type="submit"
                value={entry.value}
              >
                <span className="flex w-full min-w-0 items-center gap-1.5">
                  {active ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary" /> : null}
                  <span className="min-w-0 flex-1 text-sm font-medium wrap-anywhere">{entry.label}</span>
                  <span className="font-mono text-base font-bold tabular-nums">
                    {countFormatter.format(entry.count)}
                  </span>
                </span>
                <span className={cn("text-xs wrap-anywhere", active ? "text-foreground/80" : "text-muted-foreground")}>{entry.description}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {selectedHere || !selectedElsewhereLabel ? null : (
        <p className="text-xs text-muted-foreground">
          Filter aktif: <span className="font-medium text-foreground">{selectedElsewhereLabel}</span>
          {" — tidak termasuk ringkasan di atas."}
        </p>
      )}
    </form>
  );
}
