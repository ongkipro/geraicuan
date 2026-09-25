import Link from "next/link";

import { DateRangeFilter } from "@/components/cms/date-range-filter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  analyticsIssueMessage,
  formatRangeLabel,
  parseAnalyticsRange,
  type AnalyticsRange,
} from "@/lib/analytics-range";

/**
 * PR-53: the range control as a complete filter bar, for the operational list
 * pages that own no other period dimension.
 *
 * `/app`, `/app/analitik` and `/app/keuangan` embed `DateRangeFilter` in the
 * filter bar they already had; the three list pages had none, so this is it.
 * It states the resolved range and zone in text below the control, and repeats
 * the range parser's own fallback message unchanged when a URL was adjusted.
 */

export type RangeFilterFormProps = {
  /** GET target, e.g. "/app/pengiriman". */
  action: string;
  /** Prefix for every id the control owns, e.g. "shipment-queue". */
  idPrefix: string;
  /** Instant the page resolved its range at, so "today" agrees with the rows. */
  now: Date;
  /**
   * Other URL state to keep across a range change. Omit `page`: changing the
   * range always starts on page one.
   */
  preserved?: Readonly<Record<string, string | undefined>>;
  range: AnalyticsRange;
};

export function RangeFilterForm({
  action,
  idPrefix,
  now,
  preserved,
  range,
}: RangeFilterFormProps) {
  const { periodLabel, presetLabel, timezoneLabel } = formatRangeLabel(range);
  const todayLocalDate = parseAnalyticsRange(
    { rentang: "hari-ini", tz: range.timezone },
    now,
  ).startDate;
  // The default window is whatever the parser resolves with no range in the URL,
  // so "Hapus filter" appears only when the range differs from it.
  const defaultRange = parseAnalyticsRange({ tz: range.timezone }, now);
  const isDefaultRange = range.presetId === defaultRange.presetId
    && range.startDate === defaultRange.startDate
    && range.lastIncludedDate === defaultRange.lastIncludedDate;
  const kept = Object.entries(preserved ?? {}).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "",
  );
  const resetQuery = new URLSearchParams(kept).toString();
  const resetHref = resetQuery ? `${action}?${resetQuery}` : action;

  // T-204 reference filter row: one line of controls with no stacked labels —
  // the range trigger names the period itself and the group keeps "Periode" as
  // its accessible name — then an outline "Terapkan" and the "Hapus filter" link.
  return (
    <div className="grid min-w-0 gap-2">
      <form action={action} className="cms-filter-bar" method="get">
        <div>
          {kept.map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
          <div aria-labelledby={`${idPrefix}-range-label`} role="group">
            <span className="sr-only" id={`${idPrefix}-range-label`}>Periode</span>
            <DateRangeFilter
              endDate={range.lastIncludedDate}
              idPrefix={idPrefix}
              presetId={range.presetId}
              rangeLabel={periodLabel}
              startDate={range.startDate}
              timezoneLabel={timezoneLabel}
              todayLocalDate={todayLocalDate}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button className="max-md:min-h-11" type="submit" variant="outline">Terapkan</Button>
          {isDefaultRange ? null : (
            <Button asChild className="h-10 px-1 text-xs font-normal text-muted-foreground underline hover:text-foreground max-md:min-h-11" variant="link">
              <Link href={resetHref} prefetch={false}>Hapus filter</Link>
            </Button>
          )}
        </div>
      </form>
      <p className="max-w-2xl text-xs wrap-anywhere text-muted-foreground">
        {periodLabel} · {timezoneLabel} · {presetLabel}
      </p>
      {range.issues.length > 0 ? (
        <Alert>
          <AlertTitle>Rentang disesuaikan</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {range.issues.map((issue, index) => (
                <li key={`${issue}-${index}`}>{analyticsIssueMessage(issue)}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
