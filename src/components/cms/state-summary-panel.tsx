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
}: StateSummaryPanelProps) {
  const selectedHere = entries.some((entry) => entry.value === selected);
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
        className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6"
      >
        {entries.map((entry) => {
          const active = entry.value === selected;
          return (
            <li className="min-w-0" key={entry.value}>
              <button
                aria-pressed={active}
                className={cn(
                  "flex h-full min-h-11 w-full flex-col items-start gap-1 rounded-lg border bg-card px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-primary bg-muted" : "border-dashed",
                )}
                data-metric={entry.metricId}
                name={param}
                type="submit"
                value={entry.value}
              >
                <span className="flex w-full min-w-0 items-center gap-1.5">
                  {active ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  <span className="min-w-0 flex-1 text-sm font-medium wrap-anywhere">{entry.label}</span>
                  <span className="font-mono text-base font-semibold tabular-nums">
                    {countFormatter.format(entry.count)}
                  </span>
                </span>
                <span className="text-xs wrap-anywhere text-muted-foreground">{entry.description}</span>
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
