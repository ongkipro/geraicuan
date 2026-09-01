import "server-only";

import { and, eq } from "drizzle-orm";

import { markStaleProviderBatchUnknown } from "@/db/order-batch-repository";
import {
  providerBatches,
  providerOrderSnapshots,
  providerUnpaidRecoveries,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { markStaleUnpaidRecoveryUnknown } from "@/db/unpaid-recovery-repository";

export type ShipmentStaleOperationCheckResult = "ACTIVE" | "NOT_APPLICABLE" | "UPDATED";

export async function checkShipmentStaleOperation(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<ShipmentStaleOperationCheckResult> {
  const [target] = await tx
    .select({
      batchId: providerBatches.id,
      batchStatus: providerBatches.status,
      recoveryId: providerUnpaidRecoveries.id,
      recoveryStatus: providerUnpaidRecoveries.status,
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
    .leftJoin(
      providerUnpaidRecoveries,
      and(
        eq(providerUnpaidRecoveries.providerOrderSnapshotId, providerOrderSnapshots.id),
        eq(providerUnpaidRecoveries.batchId, providerOrderSnapshots.batchId),
        eq(providerUnpaidRecoveries.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(
      and(
        eq(shipments.id, shipmentId),
        eq(shipments.tenantId, context.tenantId),
      ),
    )
    .limit(1);

  if (!target) return "NOT_APPLICABLE";
  if (target.batchStatus === "SUBMITTING") {
    return await markStaleProviderBatchUnknown(
      tx,
      context,
      target.batchId,
      "ORDER_SUBMISSION_INTERRUPTED",
    ) ? "UPDATED" : "ACTIVE";
  }
  if (target.recoveryStatus === "PAYING" && target.recoveryId) {
    return await markStaleUnpaidRecoveryUnknown(
      tx,
      context,
      target.batchId,
      target.recoveryId,
    ) ? "UPDATED" : "ACTIVE";
  }
  return "NOT_APPLICABLE";
}
