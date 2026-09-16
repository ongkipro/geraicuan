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

  return (
    <div className="grid min-w-0 gap-2">
      <form action={action} className="cms-filter-bar" method="get">
        <div>
          {Object.entries(preserved ?? {}).map(([name, value]) =>
            value === undefined || value === ""
              ? null
              : <input key={name} name={name} type="hidden" value={value} />,
          )}
          <div className="grid gap-3 md:grid-cols-[minmax(0,20rem)]">
            <div className="grid min-w-0 gap-1.5 text-xs font-medium text-foreground">
              <span id={`${idPrefix}-range-label`}>Periode</span>
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="min-h-11 md:min-h-8" type="submit">Terapkan</Button>
        </div>
      </form>
      <p className="max-w-2xl text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
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
