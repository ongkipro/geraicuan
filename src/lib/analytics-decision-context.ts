import { shipmentDetailHref } from "@/lib/shipment-number";
import {
  formatRangeLabel,
  previousAnalyticsRange,
  serializeAnalyticsRange,
  type AnalyticsRange,
} from "@/lib/analytics-range";

export type AnalyticsTenantRole = "TENANT_ADMIN" | "OPERATOR";

export type AnalyticsComparisonPresentation = {
  cue: "↑" | "↓" | "→";
  text: string;
};

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

export function formatAnalyticsComparison(
  current: number,
  previous: number,
): AnalyticsComparisonPresentation {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    throw new TypeError("Analytics comparison values must be finite numbers.");
  }

  if (current === previous) {
    return {
      cue: "→",
      text: "Tidak berubah dibanding periode sebelumnya.",
    };
  }

  if (previous === 0) {
    return {
      cue: "↑",
      text: "Naik dari 0 pada periode sebelumnya.",
    };
  }

  const percentage = Math.round(
    (Math.abs(current - previous) / Math.abs(previous)) * 100,
  );
  const increased = current > previous;

  return {
    cue: increased ? "↑" : "↓",
    text: `${percentage}% ${increased ? "lebih tinggi" : "lebih rendah"} dari periode sebelumnya.`,
  };
}

export function analyticsShipmentDetailHref(
  role: AnalyticsTenantRole,
  publicReference: string,
): string | null {
  return role === "TENANT_ADMIN" ? shipmentDetailHref(publicReference) : null;
}
