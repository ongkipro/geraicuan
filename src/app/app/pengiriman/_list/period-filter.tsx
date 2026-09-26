import { CircleAlert } from "lucide-react";

import { DateRangePicker } from "@/components/app/date-range-picker";
import { FilterBar } from "@/components/app/filter-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { analyticsIssueMessage, formatRangeLabel, type AnalyticsRange } from "@/lib/analytics-range";

/**
 * Spec 10 §4.2 filter row of the shipment lists: the PR-53 period and "Terapkan", the one
 * 13px line with the active period, and "Hapus filter" once the period is not the default.
 */
export function PeriodFilter({
  clearHref,
  hidden,
  range,
}: {
  /** The list URL with its other state but the default period. */
  clearHref: string;
  hidden?: Record<string, string | undefined>;
  range: AnalyticsRange;
}) {
  const { periodLabel, presetLabel, timezoneLabel } = formatRangeLabel(range);
  return (
    <FilterBar
      clearHref={range.presetId === "30-hari" ? undefined : clearHref}
      hidden={hidden}
      label="Filter periode"
      summary={`${periodLabel} · ${timezoneLabel} · ${presetLabel}`}
    >
      <DateRangePicker endDate={range.lastIncludedDate} presetId={range.presetId} startDate={range.startDate} />
    </FilterBar>
  );
}

/** A URL that could not be read as asked says what was shown instead (one alert, no sentence per field). */
export function AdjustedFilterAlert({ issues }: { issues: readonly string[] }) {
  if (issues.length === 0) return null;
  return (
    <Alert role="status">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Filter disesuaikan</AlertTitle>
      <AlertDescription>
        {issues.length === 1 ? issues[0] : (
          <ul className="list-disc pl-4">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function rangeIssueMessages(range: AnalyticsRange) {
  return range.issues.map(analyticsIssueMessage);
}
