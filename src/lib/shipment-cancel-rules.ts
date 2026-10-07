// T-281 (D-42): when a shipment may be cancelled on Mengantar (`DELETE /order`). No database
// import, so the detail rail states the same rule the server action enforces.
import type { ShipmentStatus } from "@/lib/shipment-queue";
import { normalizeProviderDeliveryStatus } from "@/lib/provider-delivery-status";

/** The shipment statuses the cancel action accepts: the order exists and nothing has moved yet. */
export const CANCELLABLE_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ["ISSUED", "AWAITING_UPSTREAM_PAYMENT"];

/**
 * Mengantar docs, Delete Orders (read 2026-10-07): "An order can only be deleted while its
 * status is still active, error, PENDING PICKUP, PICKUP FAILED, or PICKUP_FAILED_API (or has no
 * status yet)." Normalized as the status pull normalizes them. Anything else — picked up, in
 * transit, delivered, RTS, an unrecognised value — is treated as past pickup.
 */
export const MENGANTAR_DELETABLE_PROVIDER_STATUSES: ReadonlySet<string> = new Set([
  "ACTIVE",
  "ERROR",
  "PENDING PICKUP",
  "PICKUP FAILED",
  "PICKUP_FAILED_API",
]);

/** Docs: "Anteraja — orders can only be deleted after 5 minutes from order created." */
export const ANTERAJA_DELETE_WAIT_MS = 5 * 60 * 1000;

export type ShipmentCancelRefusal =
  | "NOT_FOUND"
  | "STATUS"
  | "NO_ORDER_ID"
  | "PAST_PICKUP"
  | "ANTERAJA_WAIT"
  | "PAYMENT_UNCERTAIN"
  | "COURIER_UNSUPPORTED";

export type ShipmentCancelFacts = {
  shipmentStatus: ShipmentStatus;
  providerOrderId: string | null;
  /** The documented `courier` value for `DELETE /order`, or null when the docs name none. */
  documentedCourier: string | null;
  /** When Mengantar accepted the order (`provider_order_snapshots.resolved_at`). */
  acceptedAt: Date | null;
  /** The newest observed provider `status` for this order, raw, or null when none was observed. */
  latestProviderStatus: string | null;
  /** The unpaid recovery's state, when one exists. */
  recoveryStatus: string | null;
  /** The database clock of the read. */
  now: Date;
};

export function cancellableShipmentStatus(status: ShipmentStatus) {
  return CANCELLABLE_SHIPMENT_STATUSES.includes(status);
}

/** The first rule that forbids the cancel, or null when it may be sent. */
export function shipmentCancelRefusal(facts: ShipmentCancelFacts | null): ShipmentCancelRefusal | null {
  if (!facts) return "NOT_FOUND";
  if (!cancellableShipmentStatus(facts.shipmentStatus)) return "STATUS";
  // `DELETE /order` takes Mengantar's object `_id` in `ids`; an older row that stored the readable
  // ORDER_ID instead (the response fallback) would always be skipped (T-281 review F5).
  if (!facts.providerOrderId?.trim() || !/^[0-9a-f]{24}$/i.test(facts.providerOrderId.trim())) return "NO_ORDER_ID";
  // A payment that may have gone through is reconciled first; never cancel across it.
  if (facts.recoveryStatus === "PAYING" || facts.recoveryStatus === "PAYMENT_UNKNOWN") return "PAYMENT_UNCERTAIN";
  if (!facts.documentedCourier) return "COURIER_UNSUPPORTED";
  if (
    facts.latestProviderStatus !== null
    && !MENGANTAR_DELETABLE_PROVIDER_STATUSES.has(normalizeProviderDeliveryStatus(facts.latestProviderStatus))
  ) {
    return "PAST_PICKUP";
  }
  if (facts.documentedCourier.toLowerCase() === "anteraja") {
    if (!facts.acceptedAt || facts.now.getTime() - facts.acceptedAt.getTime() < ANTERAJA_DELETE_WAIT_MS) return "ANTERAJA_WAIT";
  }
  return null;
}
