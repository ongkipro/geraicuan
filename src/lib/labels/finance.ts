import { lookupProviderDeliveryStatus, normalizeProviderDeliveryStatus } from "@/lib/provider-delivery-status";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";

/**
 * Mengantar order statuses that name no single lifecycle state. `RTS` does not say whether
 * the return is queued, moving or received, so it reads "Retur", not the label of the least
 * advanced return state it is mapped to.
 */
const PROVIDER_ONLY_STATUS_LABELS: Readonly<Record<string, string>> = {
  "PENDING PICKUP": "Menunggu dijemput kurir",
  RTS: "Retur",
  // T-231: unverified app vocabulary (§9.3) that names no lifecycle state.
  "MENUNGGU PENJEMPUTAN": "Menunggu dijemput kurir",
  "UNPAID ORDER": "Belum dibayar ke Mengantar",
  // T-238: documented values that name no lifecycle state.
  ACTIVE: "Aktif di Mengantar",
  "ACTIVE/WAITING NEXT PROCESS": "Menunggu proses berikutnya",
};

/**
 * Spec 10 §8 (V-6): a stored Mengantar order status in Indonesian. A value that means a
 * lifecycle state reads that state's one label (`SHIPMENT_STATUS_PRESENTATION`); a value
 * outside the observed vocabulary stays visible, marked as unknown, rather than guessed.
 */
export function providerOrderStatusLabel(status: string | null | undefined): string {
  if (!status?.trim()) return "—";
  const normalized = normalizeProviderDeliveryStatus(status);
  if (Object.hasOwn(PROVIDER_ONLY_STATUS_LABELS, normalized)) return PROVIDER_ONLY_STATUS_LABELS[normalized];
  const mapped = lookupProviderDeliveryStatus(normalized);
  return mapped ? SHIPMENT_STATUS_PRESENTATION[mapped].label : `Status tidak dikenal (${normalized})`;
}
