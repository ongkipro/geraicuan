import { formatAnalyticsComparison } from "@/lib/analytics-decision-context";

type AnalyticsComparisonCueProps = {
  current: number;
  previous: number;
};

/** Visible short cue for every variant ("50% lebih tinggi", "Tidak berubah", "Naik dari 0"); the full sentence stays available to assistive technology. */
export function AnalyticsComparisonCue({
  current,
  previous,
}: AnalyticsComparisonCueProps) {
  const comparison = formatAnalyticsComparison(current, previous);
  const shortText = comparison.text.replace(/ (?:dari|dibanding|pada) periode sebelumnya\.$/, "");

  return (
    <span className="text-xs leading-5">
      <span aria-hidden="true">{comparison.cue} {shortText}</span>
      <span className="sr-only">{comparison.text}</span>
    </span>
  );
}
