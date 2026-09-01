import "server-only";

import { and, asc, eq } from "drizzle-orm";

import {
  providerBatches,
  providerOrderSnapshots,
  providerUnpaidRecoveries,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  UnpaidRecoveryDeniedError,
  UnpaidRecoveryUnavailableError,
} from "@/db/unpaid-recovery-repository";

export type ShipmentUnpaidRecoveryTarget = {
  awb: string | null;
  batchId: string;
  recoveryId: string | null;
  recoveryStatus:
    | (typeof providerUnpaidRecoveries.$inferSelect)["status"]
    | null;
  shipmentId: string;
  state: "AWAITING_PAYMENT" | "RECOVERED";
};

export type RecoveredShipmentAwb = {
  awb: string;
  labelHref: string;
  shipmentId: string;
};

function requireTenantAdmin(context: TenantContext) {
  if (context.role !== "TENANT_ADMIN") throw new UnpaidRecoveryDeniedError();
}

export async function resolveShipmentUnpaidRecoveryTarget(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<ShipmentUnpaidRecoveryTarget> {
  requireTenantAdmin(context);

  const [row] = await tx
    .select({
      shipmentId: shipments.id,
      shipmentStatus: shipments.status,
      batchId: providerBatches.id,
      batchStatus: providerBatches.status,
      orderStatus: providerOrderSnapshots.status,
      providerOrderId: providerOrderSnapshots.providerOrderId,
      isCod: providerOrderSnapshots.isCod,
      isPaid: providerOrderSnapshots.isPaid,
      awb: providerOrderSnapshots.cnoteNo,
      recoveryStatus: providerUnpaidRecoveries.status,
      recoveryId: providerUnpaidRecoveries.id,
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
        eq(
          providerUnpaidRecoveries.providerOrderSnapshotId,
          providerOrderSnapshots.id,
        ),
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

  if (
    !row
    || (row.batchStatus !== "COMPLETED"
      && row.batchStatus !== "SUBMISSION_UNKNOWN")
    || row.isCod
    || !row.providerOrderId?.trim()
  ) {
    throw new UnpaidRecoveryUnavailableError();
  }

  const awb = row.awb?.trim() || null;
  if (
    row.shipmentStatus === "ISSUED"
    && row.orderStatus === "ISSUED"
    && row.isPaid === true
    && awb
  ) {
    return {
      awb,
      batchId: row.batchId,
      recoveryId: row.recoveryId,
      recoveryStatus: row.recoveryStatus,
      shipmentId: row.shipmentId,
      state: "RECOVERED",
    };
  }

  if (
    row.shipmentStatus === "AWAITING_UPSTREAM_PAYMENT"
    && row.orderStatus === "AWAITING_UPSTREAM_PAYMENT"
    && row.isPaid === false
    && row.awb === null
    && row.recoveryStatus !== "COMPLETED"
  ) {
    return {
      awb: null,
      batchId: row.batchId,
      recoveryId: row.recoveryId,
      recoveryStatus: row.recoveryStatus,
      shipmentId: row.shipmentId,
      state: "AWAITING_PAYMENT",
    };
  }

  throw new UnpaidRecoveryUnavailableError();
}

export async function listRecoveredShipmentAwbs(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
): Promise<RecoveredShipmentAwb[]> {
  requireTenantAdmin(context);

  const rows = await tx
    .select({
      awb: providerOrderSnapshots.cnoteNo,
      shipmentId: providerOrderSnapshots.shipmentId,
    })
    .from(providerUnpaidRecoveries)
    .innerJoin(
      providerOrderSnapshots,
      and(
        eq(
          providerOrderSnapshots.id,
          providerUnpaidRecoveries.providerOrderSnapshotId,
        ),
        eq(providerOrderSnapshots.batchId, providerUnpaidRecoveries.batchId),
        eq(providerOrderSnapshots.tenantId, providerUnpaidRecoveries.tenantId),
      ),
    )
    .innerJoin(
      shipments,
      and(
        eq(shipments.id, providerOrderSnapshots.shipmentId),
        eq(shipments.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(
      and(
        eq(providerUnpaidRecoveries.batchId, batchId),
        eq(providerUnpaidRecoveries.tenantId, context.tenantId),
        eq(providerUnpaidRecoveries.status, "COMPLETED"),
        eq(providerOrderSnapshots.status, "ISSUED"),
        eq(providerOrderSnapshots.isCod, false),
        eq(providerOrderSnapshots.isPaid, true),
        eq(shipments.status, "ISSUED"),
      ),
    )
    .orderBy(asc(providerOrderSnapshots.position));

  return rows.map((row) => {
    const awb = row.awb?.trim();
    if (!awb) throw new UnpaidRecoveryUnavailableError();
    return {
      awb,
      labelHref: `/app/label/${encodeURIComponent(row.shipmentId)}`,
      shipmentId: row.shipmentId,
    };
  });
}
