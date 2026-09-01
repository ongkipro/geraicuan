import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { appendLedgerForIssuedProviderOrder } from "@/db/ledger-repository";
import {
  providerBatches,
  providerOrderSnapshots,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

export type ShipmentReconciliationTarget = {
  batchId: string;
  courier: string;
  credentialSource: (typeof providerBatches.$inferSelect)["credentialSource"];
  estimateServiceId: string;
  estimateSnapshotId: string;
  idempotencyKey: string;
  isCod: boolean;
  outletId: string;
  pickupAddressId: string;
  providerAccountKey: string;
  providerOrderSnapshotId: string;
  shipmentId: string;
  tenantId: string;
};

export type AuthoritativeShipmentReconciliation = {
  cnoteNo: string | null;
  isPaid: boolean | null;
  providerOrderId: string | null;
  safeResponseCode: string;
  status: "AWAITING_UPSTREAM_PAYMENT" | "FAILED" | "ISSUED";
};

export class ShipmentReconciliationDeniedError extends Error {
  constructor() {
    super("Shipment reconciliation is not authorized.");
  }
}

export class ShipmentReconciliationUnavailableError extends Error {
  constructor() {
    super("Shipment reconciliation is unavailable.");
  }
}

function requireTenantAdmin(context: TenantContext) {
  if (context.role !== "TENANT_ADMIN") {
    throw new ShipmentReconciliationDeniedError();
  }
}

export async function loadShipmentReconciliationTarget(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<ShipmentReconciliationTarget> {
  requireTenantAdmin(context);

  const [target] = await tx
    .select({
      batchId: providerBatches.id,
      courier: providerBatches.courier,
      credentialSource: providerBatches.credentialSource,
      estimateServiceId: providerOrderSnapshots.estimateServiceId,
      estimateSnapshotId: providerOrderSnapshots.estimateSnapshotId,
      idempotencyKey: providerBatches.idempotencyKey,
      isCod: providerOrderSnapshots.isCod,
      outletId: providerBatches.outletId,
      pickupAddressId: providerBatches.pickupAddressId,
      providerAccountKey: providerBatches.providerAccountKey,
      providerOrderSnapshotId: providerOrderSnapshots.id,
      providerOrderId: providerOrderSnapshots.providerOrderId,
      cnoteNo: providerOrderSnapshots.cnoteNo,
      shipmentId: shipments.id,
      tenantId: shipments.tenantId,
    })
    .from(shipments)
    .innerJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .innerJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(
      and(
        eq(shipments.id, shipmentId),
        eq(shipments.tenantId, context.tenantId),
        eq(shipments.status, "SUBMISSION_UNKNOWN"),
        eq(providerOrderSnapshots.status, "SUBMISSION_UNKNOWN"),
        eq(providerBatches.status, "SUBMISSION_UNKNOWN"),
      ),
    )
    .limit(1);

  if (!target || target.providerOrderId !== null || target.cnoteNo !== null) {
    throw new ShipmentReconciliationUnavailableError();
  }
  return target;
}

export async function applyAuthoritativeShipmentReconciliation(
  tx: TenantTransaction,
  context: TenantContext,
  target: ShipmentReconciliationTarget,
  result: AuthoritativeShipmentReconciliation,
) {
  requireTenantAdmin(context);
  if (target.tenantId !== context.tenantId) {
    throw new ShipmentReconciliationDeniedError();
  }

  const locked = await tx.execute<{ id: string }>(sql`
    SELECT provider_order.id
    FROM provider_order_snapshots AS provider_order
    JOIN provider_batches AS batch
      ON batch.id = provider_order.batch_id
      AND batch.tenant_id = provider_order.tenant_id
    JOIN shipments AS shipment
      ON shipment.id = provider_order.shipment_id
      AND shipment.tenant_id = provider_order.tenant_id
    WHERE provider_order.id = ${target.providerOrderSnapshotId}
      AND provider_order.tenant_id = ${context.tenantId}
      AND provider_order.shipment_id = ${target.shipmentId}
      AND provider_order.batch_id = ${target.batchId}
      AND provider_order.estimate_snapshot_id = ${target.estimateSnapshotId}
      AND provider_order.estimate_service_id = ${target.estimateServiceId}
      AND provider_order.status = 'SUBMISSION_UNKNOWN'
      AND provider_order.provider_order_id IS NULL
      AND provider_order.cnote_no IS NULL
      AND batch.status = 'SUBMISSION_UNKNOWN'
      AND batch.outlet_id = ${target.outletId}
      AND batch.pickup_address_id = ${target.pickupAddressId}
      AND batch.courier = ${target.courier}
      AND batch.credential_source = ${target.credentialSource}
      AND batch.idempotency_key = ${target.idempotencyKey}
      AND batch.provider_account_key = ${target.providerAccountKey}
      AND shipment.status = 'SUBMISSION_UNKNOWN'
    FOR UPDATE OF provider_order, batch, shipment
  `);
  if (locked.rows.length !== 1) {
    throw new ShipmentReconciliationUnavailableError();
  }

  const order = await tx
    .update(providerOrderSnapshots)
    .set({
      status: result.status,
      providerOrderId: result.providerOrderId,
      isPaid: result.isPaid,
      cnoteNo: result.cnoteNo,
      safeResponseCode: result.safeResponseCode,
      resolvedAt: sql`now()`,
    })
    .where(
      and(
        eq(providerOrderSnapshots.id, target.providerOrderSnapshotId),
        eq(providerOrderSnapshots.tenantId, context.tenantId),
        eq(providerOrderSnapshots.status, "SUBMISSION_UNKNOWN"),
      ),
    )
    .returning({ id: providerOrderSnapshots.id });
  const shipment = await tx
    .update(shipments)
    .set({ status: result.status, updatedAt: sql`now()` })
    .where(
      and(
        eq(shipments.id, target.shipmentId),
        eq(shipments.tenantId, context.tenantId),
        eq(shipments.status, "SUBMISSION_UNKNOWN"),
      ),
    )
    .returning({ id: shipments.id });
  if (order.length !== 1 || shipment.length !== 1) {
    throw new ShipmentReconciliationUnavailableError();
  }

  if (result.status === "ISSUED") {
    await appendLedgerForIssuedProviderOrder(
      tx,
      context,
      target.providerOrderSnapshotId,
    );
  }

  const batchOrders = await tx
    .select({ status: providerOrderSnapshots.status })
    .from(providerOrderSnapshots)
    .where(
      and(
        eq(providerOrderSnapshots.batchId, target.batchId),
        eq(providerOrderSnapshots.tenantId, context.tenantId),
      ),
    );
  if (
    batchOrders.length === 0
    || batchOrders.some(
      (candidate) => candidate.status === "SUBMISSION_QUEUED",
    )
  ) {
    throw new ShipmentReconciliationUnavailableError();
  }
  if (batchOrders.some((candidate) => candidate.status === "SUBMISSION_UNKNOWN")) {
    return;
  }

  const batchStatus = batchOrders.some((candidate) => candidate.status === "FAILED")
    ? "FAILED"
    : "COMPLETED";
  const batch = await tx
    .update(providerBatches)
    .set({
      status: batchStatus,
      safeErrorCode: batchStatus === "FAILED" ? "RECONCILED_FAILED" : null,
      completedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(providerBatches.id, target.batchId),
        eq(providerBatches.tenantId, context.tenantId),
        eq(providerBatches.status, "SUBMISSION_UNKNOWN"),
      ),
    )
    .returning({ id: providerBatches.id });
  if (batch.length !== 1) {
    throw new ShipmentReconciliationUnavailableError();
  }
}
