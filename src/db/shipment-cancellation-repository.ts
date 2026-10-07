import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import {
  auditEvents,
  providerBatches,
  providerOrderSnapshots,
  providerOrderStatusObservations,
  providerUnpaidRecoveries,
  shipments,
} from "@/db/schema";
import { appendLedgerReversalsForCancelledShipments } from "@/db/ledger-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { mengantarDocumentedOrderCourier } from "@/lib/mengantar-couriers";
import { ALLOWED_TRANSITIONS } from "@/lib/provider-delivery-status";
import type { ShipmentCancelFacts } from "@/lib/shipment-cancel-rules";
import { latestProviderStatusCandidate } from "@/db/shipment-event-predicates";

/** T-281: only a Tenant Admin cancels a shipment on Mengantar. */
export class ShipmentCancelDeniedError extends Error {
  constructor() {
    super("Shipment cancellation is not authorized.");
  }
}

function requireTenantAdmin(context: TenantContext) {
  if (context.role !== "TENANT_ADMIN") throw new ShipmentCancelDeniedError();
}

export type ShipmentCancelTarget = ShipmentCancelFacts & {
  shipmentId: string;
  scope: {
    tenantId: string;
    outletId: string;
    pickupAddressId: string;
    credentialSource: "private" | "platform_default";
    providerAccountKey: string;
  };
};

/**
 * T-281: everything the cancel rules and the live call need, for one shipment of the context
 * tenant (tenant in SQL; RLS repeats it). null = not this tenant's, or never submitted.
 */
export async function loadShipmentCancelTarget(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<ShipmentCancelTarget | null> {
  requireTenantAdmin(context);
  const [row] = await tx
    .select({
      shipmentId: shipments.id,
      shipmentStatus: shipments.status,
      providerOrderId: providerOrderSnapshots.providerOrderId,
      acceptedAt: providerOrderSnapshots.resolvedAt,
      snapshotId: providerOrderSnapshots.id,
      outletId: providerBatches.outletId,
      pickupAddressId: providerBatches.pickupAddressId,
      courier: providerBatches.courier,
      credentialSource: providerBatches.credentialSource,
      providerAccountKey: providerBatches.providerAccountKey,
      recoveryStatus: providerUnpaidRecoveries.status,
      now: sql<Date>`now()`.mapWith((value: string | Date) => new Date(value)),
    })
    .from(shipments)
    .innerJoin(
      providerOrderSnapshots,
      and(eq(providerOrderSnapshots.shipmentId, shipments.id), eq(providerOrderSnapshots.tenantId, shipments.tenantId)),
    )
    .innerJoin(
      providerBatches,
      and(eq(providerBatches.id, providerOrderSnapshots.batchId), eq(providerBatches.tenantId, providerOrderSnapshots.tenantId)),
    )
    .leftJoin(
      providerUnpaidRecoveries,
      and(
        eq(providerUnpaidRecoveries.providerOrderSnapshotId, providerOrderSnapshots.id),
        eq(providerUnpaidRecoveries.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(and(eq(shipments.id, shipmentId), eq(shipments.tenantId, context.tenantId)))
    .limit(1);
  if (!row) return null;

  const [latest] = await tx
    .select({ providerStatus: providerOrderStatusObservations.providerStatus })
    .from(providerOrderStatusObservations)
    .where(and(
      eq(providerOrderStatusObservations.tenantId, context.tenantId),
      eq(providerOrderStatusObservations.shipmentId, shipmentId),
      latestProviderStatusCandidate("provider_order_status_observations"),
    ))
    .orderBy(desc(providerOrderStatusObservations.observedAt), desc(providerOrderStatusObservations.id))
    .limit(1);

  return {
    shipmentId: row.shipmentId,
    shipmentStatus: row.shipmentStatus,
    providerOrderId: row.providerOrderId?.trim() || null,
    documentedCourier: mengantarDocumentedOrderCourier(row.courier),
    acceptedAt: row.acceptedAt,
    latestProviderStatus: latest?.providerStatus ?? null,
    recoveryStatus: row.recoveryStatus,
    now: row.now,
    scope: {
      tenantId: context.tenantId,
      outletId: row.outletId,
      pickupAddressId: row.pickupAddressId,
      credentialSource: row.credentialSource,
      providerAccountKey: row.providerAccountKey,
    },
  };
}

export type ShipmentCancelRecord = "CANCELLED" | "ALREADY_CANCELLED" | "STATE_CHANGED";

/**
 * T-281: Mengantar confirmed the deletion; one transaction locks the shipment, re-reads its
 * status and moves it to CANCELLED (a move `ALLOWED_TRANSITIONS` names) with one
 * SHIPMENT_CANCELLED audit row (no recipient data). T-290: the same transaction reverses the
 * issuance ledger entries (`appendLedgerReversalsForCancelledShipments`, append-only ADJUSTMENTs).
 *
 * Already CANCELLED: a status pull or the webhook recorded Mengantar's cancel first. The deletion
 * is still this Tenant Admin's, so it is audited once here (T-290 round-3 (a)) when the provider
 * applied the CANCELLED (an APPLIED observation to CANCELLED exists); without one the app itself
 * recorded it earlier (a retried write), which was already audited. The reversal runs again too:
 * it appends only what nothing reverses yet (a webhook cancel books none of its own).
 */
export async function recordShipmentCancelled(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
  input: { courier: string },
): Promise<ShipmentCancelRecord> {
  requireTenantAdmin(context);
  const [row] = await tx
    .select({ status: shipments.status })
    .from(shipments)
    .where(and(eq(shipments.id, shipmentId), eq(shipments.tenantId, context.tenantId)))
    .for("update");
  if (!row) return "STATE_CHANGED";
  if (row.status === "CANCELLED") {
    const [providerCancel] = await tx
      .select({ fromStatus: providerOrderStatusObservations.fromStatus })
      .from(providerOrderStatusObservations)
      .where(and(
        eq(providerOrderStatusObservations.tenantId, context.tenantId),
        eq(providerOrderStatusObservations.shipmentId, shipmentId),
        eq(providerOrderStatusObservations.mappedStatus, "CANCELLED"),
        eq(providerOrderStatusObservations.transitionOutcome, "APPLIED"),
      ))
      .orderBy(desc(providerOrderStatusObservations.observedAt), desc(providerOrderStatusObservations.id))
      .limit(1);
    // lazy: a retry after a commit whose answer was lost, racing a provider cancel, could audit
    // twice; the runtime role cannot read SHIPMENT_CANCELLED rows to rule it out without a migration.
    if (providerCancel) await insertCancelAudit(tx, context, shipmentId, input.courier, providerCancel.fromStatus);
    await appendLedgerReversalsForCancelledShipments(tx, context, [shipmentId]);
    return "ALREADY_CANCELLED";
  }
  if (!(ALLOWED_TRANSITIONS[row.status] ?? []).includes("CANCELLED")) return "STATE_CHANGED";
  await tx
    .update(shipments)
    .set({ status: "CANCELLED", updatedAt: sql`now()` })
    .where(and(eq(shipments.id, shipmentId), eq(shipments.tenantId, context.tenantId)));
  await insertCancelAudit(tx, context, shipmentId, input.courier, row.status);
  await appendLedgerReversalsForCancelledShipments(tx, context, [shipmentId]);
  return "CANCELLED";
}

async function insertCancelAudit(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
  courier: string,
  fromStatus: string | null,
) {
  await tx.insert(auditEvents).values({
    actorId: context.userId,
    actorRole: "TENANT_MEMBER",
    tenantId: context.tenantId,
    action: "SHIPMENT_CANCELLED",
    targetType: "SHIPMENT",
    targetId: shipmentId,
    outcome: "SUCCESS",
    metadata: { courier, fromStatus },
  });
}
