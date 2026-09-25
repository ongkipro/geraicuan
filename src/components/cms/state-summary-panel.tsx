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
 * `aria-pressed="true"` for assistive technology, a check glyph, and the
 * accent fill with a primary ring.
 *
 * T-203 (40+ readers): each card reads label → count → one short line. The
 * line is kept to a few words by the caller and never wraps; its full text is
 * also the entry's `title`, and it stays in the button's accessible name.
 */

export type StateSummaryEntry = {
  count: number;
  /** A few words under the count (one line, no wrap), e.g. "Belum punya resi". */
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
        <ul aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
          {entries.map((entry) => {
            const active = entry.value === selected;
            return (
              <li key={entry.value}>
                <button
                  aria-pressed={active}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring md:min-h-10",
                    active
                      ? "bg-background font-semibold text-foreground shadow-resting"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                  data-metric-id={entry.metricId}
                  name={param}
                  type="submit"
                  value={entry.value}
                >
                  {active ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  <span>{entry.label}</span>
                  <span className="tabular-nums">{countFormatter.format(entry.count)}</span>
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
                  "flex h-full min-h-11 w-full flex-col items-start gap-1 rounded-xl px-3 py-3 text-left border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-accent ring-1 ring-primary" : "bg-card hover:bg-accent",
                )}
                data-metric-id={entry.metricId}
                name={param}
                title={entry.description}
                type="submit"
                value={entry.value}
              >
                <span className="flex w-full min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                  {active ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary" /> : null}
                  <span className="min-w-0">{entry.label}</span>
                </span>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {countFormatter.format(entry.count)}
                </span>
                <span className="w-full truncate text-sm text-muted-foreground">{entry.description}</span>
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
