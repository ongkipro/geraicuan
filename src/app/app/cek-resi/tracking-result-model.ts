import type { TrackingLookupState } from "@/app/app/cek-resi/actions";
import { serviceDisplayName } from "@/lib/labels/courier";
import { providerOrderStatusLabel } from "@/lib/labels/finance";
import { formatIdr } from "@/lib/label-format";
import { presentShipmentPayment } from "@/lib/payment-method";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";

export type TrackingResult = Extract<TrackingLookupState, { kind: "found" }>["result"];

export type TrackingTimelineEntry = {
  at: string;
  /** "Mengantar" marks a provider-authoritative fact (spec 10 §4.11); "GeraiCUAN" our own record. */
  source: "GeraiCUAN" | "Mengantar";
  title: string;
  detail?: string;
};

/** "Lion Parcel Regpack · COD Rp 119.479" — the courier service and how the parcel is paid. */
export function trackingSummaryLine(result: TrackingResult) {
  const payment = presentShipmentPayment(result);
  const money = payment.amountIdr === null ? "" : ` ${formatIdr(payment.amountIdr)}`;
  const service = result.providerService ? serviceDisplayName(result.providerService) : "Belum ada layanan";
  return `${service} · ${payment.label}${money}`;
}

/**
 * The lookup returns the current status and the last Mengantar observation, not a scan history,
 * so the timeline holds what is known — newest first, every time in WIB (spec 10 §5.1 Timeline).
 */
export function trackingTimeline(result: TrackingResult): TrackingTimelineEntry[] {
  const entries: TrackingTimelineEntry[] = [{
    at: result.updatedAtIso,
    detail: SHIPMENT_STATUS_PRESENTATION[result.status].guidance,
    source: "GeraiCUAN",
    title: SHIPMENT_STATUS_PRESENTATION[result.status].label,
  }];
  if (result.observation) {
    entries.push({
      at: result.observation.observedAtIso,
      source: "Mengantar",
      title: `Status kurir: ${providerOrderStatusLabel(result.observation.providerStatus)}`,
    });
  }
  return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
