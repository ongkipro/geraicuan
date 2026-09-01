import { formatAnalyticsComparison } from "@/lib/analytics-decision-context";

type AnalyticsComparisonCueProps = {
  current: number;
  previous: number;
};

export function AnalyticsComparisonCue({
  current,
  previous,
}: AnalyticsComparisonCueProps) {
  const comparison = formatAnalyticsComparison(current, previous);

  return (
    <small>
      <span aria-hidden="true">{comparison.cue}</span> {comparison.text}
    </small>
  );
}
