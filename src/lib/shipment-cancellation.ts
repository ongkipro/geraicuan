import "server-only";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import * as schema from "@/db/schema";
import {
  loadShipmentCancelTarget,
  recordShipmentCancelled,
  ShipmentCancelDeniedError,
  type ShipmentCancelTarget,
} from "@/db/shipment-cancellation-repository";
import { withTenantContext, type TenantContext, type TenantTransaction } from "@/db/tenant-context";
import {
  LiveMengantarOrdersDisabledError,
  resolveLiveMengantarCancelTransport,
  type MengantarCancelTransport,
} from "@/lib/mengantar-live-transport";
import { withProviderAccountSerialization } from "@/lib/mengantar-order";
import { enforceOrderRateLimit } from "@/lib/order-rate-limit";
import { shipmentCancelRefusal, type ShipmentCancelRefusal } from "@/lib/shipment-cancel-rules";

export { ShipmentCancelDeniedError };

/** The account or its credentials no longer match the order; nothing was sent. */
export class ShipmentCancelUnavailableError extends Error {
  constructor() {
    super("Shipment cancellation is unavailable.");
  }
}

const RECORD_ATTEMPTS = 3;

export type ShipmentCancelResult =
  /** Mengantar deleted the order; the shipment is CANCELLED with one audit row. */
  | { outcome: "CANCELLED" }
  /** The shipment was already CANCELLED; nothing was sent or written. */
  | { outcome: "ALREADY_CANCELLED" }
  /** A rule forbids it; nothing was sent. */
  | { outcome: "NOT_ALLOWED"; reason: ShipmentCancelRefusal }
  /** Mengantar refused (4xx or `success: false`); nothing changed. */
  | { outcome: "REFUSED"; providerMessage: string | null }
  /** Mengantar answered success without our order (past pickup); nothing changed. */
  | { outcome: "SKIPPED"; providerMessage: string | null }
  /** No readable answer: the order may or may not be deleted; nothing changed. */
  | { outcome: "UNKNOWN" }
  /**
   * Mengantar deleted it, but the shipment could not be marked here after retries. A status pull
   * settles it: the pull reads a deleted Mengantar order as CANCELED (T-281 review F1).
   */
  | { outcome: "NOT_RECORDED" };

export type ShipmentCancelInput = {
  db: NodePgDatabase<typeof schema>;
  lockPool: Pool;
  principalId: string;
  tenantId: string;
  shipmentId: string;
};

/**
 * T-281 (D-42): cancel one shipment on Mengantar. The rules are checked, the attempt counted
 * (the order-mutation limit) and the account resolved in one tenant transaction; then, under the
 * per-account lock, the shipment is read again (a second click waits and finds it CANCELLED)
 * and `DELETE /order` is sent once. Only a confirmed deletion changes state, in its own
 * transaction, still under the lock. Never retried here.
 */
export async function cancelShipmentAtMengantar(input: ShipmentCancelInput): Promise<ShipmentCancelResult> {
  const inTenant = <T>(work: (tx: TenantTransaction, context: TenantContext) => Promise<T>) =>
    withTenantContext(input.db, input.principalId, input.tenantId, work);

  type Prepared = { result: ShipmentCancelResult } | { target: ShipmentCancelTarget; transport: MengantarCancelTransport };
  const prepared = await inTenant(async (tx, context): Promise<Prepared> => {
    if (context.role !== "TENANT_ADMIN") throw new ShipmentCancelDeniedError();
    const target = await loadShipmentCancelTarget(tx, context, input.shipmentId);
    if (target?.shipmentStatus === "CANCELLED") return { result: { outcome: "ALREADY_CANCELLED" } };
    const refusal = shipmentCancelRefusal(target);
    if (refusal || !target) return { result: { outcome: "NOT_ALLOWED", reason: refusal ?? "NOT_FOUND" } };
    await enforceOrderRateLimit(tx, context);
    let transport: MengantarCancelTransport;
    try {
      transport = await resolveLiveMengantarCancelTransport(target.scope, tx, context);
    } catch (error) {
      if (error instanceof LiveMengantarOrdersDisabledError) throw error;
      throw new ShipmentCancelUnavailableError();
    }
    // The order was placed on this account; credentials now addressing another one send nothing.
    if (transport.providerAccountKey !== target.scope.providerAccountKey) throw new ShipmentCancelUnavailableError();
    return { target, transport };
  });
  if ("result" in prepared) return prepared.result;
  const { target, transport } = prepared;

  return withProviderAccountSerialization(input.lockPool, target.scope.providerAccountKey, async (): Promise<ShipmentCancelResult> => {
    const current = await inTenant((tx, context) => loadShipmentCancelTarget(tx, context, input.shipmentId));
    if (current?.shipmentStatus === "CANCELLED") return { outcome: "ALREADY_CANCELLED" };
    const refusal = shipmentCancelRefusal(current);
    if (refusal || !current) return { outcome: "NOT_ALLOWED", reason: refusal ?? "NOT_FOUND" };
    if (current.providerOrderId !== target.providerOrderId || current.documentedCourier !== target.documentedCourier) {
      return { outcome: "NOT_ALLOWED", reason: "STATUS" };
    }

    const answer = await transport.cancel({ courier: current.documentedCourier!, ids: [current.providerOrderId!] });
    switch (answer.kind) {
      case "REFUSED":
        return { outcome: "REFUSED", providerMessage: answer.providerMessage };
      case "SKIPPED":
        return { outcome: "SKIPPED", providerMessage: answer.providerMessage };
      case "UNKNOWN":
        return { outcome: "UNKNOWN" };
      case "DELETED":
        break;
    }
    // T-281 review F1: the deletion is confirmed, and the local write is idempotent, so a
    // transient failure is retried here rather than leaving a dead resi printable.
    for (let attempt = 1; attempt <= RECORD_ATTEMPTS; attempt += 1) {
      try {
        const recorded = await inTenant((tx, context) =>
          recordShipmentCancelled(tx, context, input.shipmentId, { courier: current.documentedCourier! }));
        if (recorded === "CANCELLED") return { outcome: "CANCELLED" };
        // Recorded by a status pull that raced this request: the deletion is still ours.
        if (recorded === "ALREADY_CANCELLED") return { outcome: "CANCELLED" };
        return { outcome: "NOT_RECORDED" };
      } catch {
        if (attempt === RECORD_ATTEMPTS) return { outcome: "NOT_RECORDED" };
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
    return { outcome: "NOT_RECORDED" };
  });
}
