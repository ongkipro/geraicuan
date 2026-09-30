import type { AnalyticsPresetId } from "@/lib/analytics-range";

export type SearchValue = string | string[] | undefined;

export function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

/** The period every shipment list opens on (PR-53); a different one counts as an active filter. */
const DEFAULT_PERIOD: AnalyticsPresetId = "30-hari";

/**
 * T-263: how many filters differ from the list's default — the period and the status — which is
 * the number on the mobile "Filter" button (`ListFilterSheet`).
 */
export function activeFilterCount(input: { defaultStatus: string; presetId: AnalyticsPresetId; status: string }) {
  return (input.presetId === DEFAULT_PERIOD ? 0 : 1) + (input.status === input.defaultStatus ? 0 : 1);
}
