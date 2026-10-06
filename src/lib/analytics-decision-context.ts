import {
  formatRangeLabel,
  previousAnalyticsRange,
  serializeAnalyticsRange,
  type AnalyticsRange,
} from "@/lib/analytics-range";

export function buildAnalyticsDecisionContext(range: AnalyticsRange) {
  const previousRange = previousAnalyticsRange(range);
  const currentLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previousRange);

  return {
    currentRange: range,
    previousRange,
    periodLabel: currentLabel.periodLabel,
    previousPeriodLabel: previousLabel.periodLabel,
    presetLabel: currentLabel.presetLabel,
    timezoneLabel: currentLabel.timezoneLabel,
    persistedQuery: serializeAnalyticsRange(range).toString(),
  };
}
