import type { TrackingLookupState } from "@/app/app/cek-resi/actions";
import { providerOrderStatusLabel } from "@/lib/labels/finance";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";

export type TrackingResult = Extract<TrackingLookupState, { kind: "found" }>["result"];

export type TrackingTimelineEntry = {
  at: string;
  /** "Mengantar" marks a provider-authoritative fact (spec 10 §4.11), "Kurir" the courier's own history line; "GeraiCUAN" our own record. */
  source: "GeraiCUAN" | "Mengantar" | "Kurir";
  title: string;
  detail?: string;
};

/**
 * The current status, the courier's tracking history (T-238, when a pull has stored any) and the
 * last Mengantar observation — newest first, every time in WIB (spec 10 §5.1 Timeline).
 */
export function trackingTimeline(result: TrackingResult): TrackingTimelineEntry[] {
  const entries: TrackingTimelineEntry[] = [{
    at: result.updatedAtIso,
    detail: SHIPMENT_STATUS_PRESENTATION[result.status].guidance,
    source: "GeraiCUAN",
    title: SHIPMENT_STATUS_PRESENTATION[result.status].label,
  }];
  for (const event of result.historyEvents) {
    entries.push({ at: event.occurredAtIso, source: "Kurir", title: event.description });
  }
  if (result.observation) {
    entries.push({
      at: result.observation.observedAtIso,
      source: "Mengantar",
      title: `Status kurir: ${providerOrderStatusLabel(result.observation.providerStatus)}`,
    });
  }
  return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
