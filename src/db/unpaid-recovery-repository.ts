import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { appendLedgerForCompletedUnpaidRecovery } from "@/db/ledger-repository";

import {
  providerBatches,
  providerOrderSnapshots,
  providerUnpaidRecoveries,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import type { ProviderBatchScope } from "@/db/order-batch-repository";

export type UnpaidRecoveryBatchScope = ProviderBatchScope & {
  batchId: string;
  providerAccountKey: string;
};

export type PreparedUnpaidRecovery = {
  id: string;
  batchId: string;
  providerOrderSnapshotId: string;
  shipmentId: string;
  providerOrderId: string;
  /** Mengantar `batch`; NULL on rows accepted before T-223 (DATA-13). */
  providerBatchId: string | null;
  created: boolean;
  status: (typeof providerUnpaidRecoveries.$inferSelect)["status"];
};

export type PreparedUnpaidRecoveryBatch = {
  scope: UnpaidRecoveryBatchScope;
  recoveries: PreparedUnpaidRecovery[];
};

export type ProviderUnpaidRecoveryResult = {
  providerBatchId: string;
  courier: string;
  cnoteNo: string;
};

export class UnpaidRecoveryDeniedError extends Error {
  constructor() {
    super("Unpaid recovery is not authorized.");
  }
}

export class UnpaidRecoveryUnavailableError extends Error {
  constructor() {
    super("Unpaid recovery is unavailable.");
  }
}

/** A legacy order without the stored Mengantar `batch` id cannot be paid (T-223). */
export class MengantarUnpaidRecoveryBatchIdMissingError extends UnpaidRecoveryUnavailableError {
  readonly safeCode = "PAY_UNPAID_BATCH_ID_MISSING";
}

export const UNPAID_RECOVERY_CLAIM_STALE_AFTER_SECONDS = 120;

function requireTenantAdmin(context: TenantContext) {
  if (context.role !== "TENANT_ADMIN") throw new UnpaidRecoveryDeniedError();
}


type RecoveryCandidate = {
  position: number;
  providerOrderSnapshotId: string;
  shipmentId: string;
  providerOrderId: string | null;
  providerBatchId: string | null;
  orderStatus: (typeof providerOrderSnapshots.$inferSelect)["status"];
  /** T-247 (M1): the shipment's own lifecycle; Mengantar may cancel an unpaid order. */
  shipmentStatus: (typeof shipments.$inferSelect)["status"];
  isCod: boolean;
  isPaid: boolean | null;
  cnoteNo: string | null;
  recoveryId: string | null;
  recoveryStatus: (typeof providerUnpaidRecoveries.$inferSelect)["status"] | null;
};

function isAwaitingRecovery(row: RecoveryCandidate) {
  return row.orderStatus === "AWAITING_UPSTREAM_PAYMENT"
    // A cancelled order is never paid, even though its order snapshot still reads unpaid.
    && row.shipmentStatus === "AWAITING_UPSTREAM_PAYMENT"
    && !row.isCod
    && row.isPaid === false
    && row.cnoteNo === null
    && Boolean(row.providerOrderId?.trim());
}

function hasConsistentExistingRecovery(row: RecoveryCandidate) {
  if (!row.recoveryId || !row.recoveryStatus) return false;
  if (row.recoveryStatus === "COMPLETED") {
    return row.orderStatus === "ISSUED"
      && !row.isCod
      && row.isPaid === true
      && Boolean(row.cnoteNo?.trim())
      && Boolean(row.providerOrderId?.trim());
  }
  return isAwaitingRecovery(row);
}

export async function prepareUnpaidRecoveries(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
): Promise<PreparedUnpaidRecoveryBatch> {
  requireTenantAdmin(context);

  const [batch] = await tx
    .select({
      id: providerBatches.id,
      outletId: providerBatches.outletId,
      pickupAddressId: providerBatches.pickupAddressId,
      courier: providerBatches.courier,
      credentialSource: providerBatches.credentialSource,
      providerAccountKey: providerBatches.providerAccountKey,
    })
    .from(providerBatches)
    .where(
      and(
        eq(providerBatches.id, batchId),
        eq(providerBatches.tenantId, context.tenantId),
        inArray(providerBatches.status, ["COMPLETED", "SUBMISSION_UNKNOWN"]),
      ),
    )
    .limit(1);
  if (!batch || !/^[0-9a-f]{64}$/.test(batch.providerAccountKey)) {
    throw new UnpaidRecoveryUnavailableError();
  }

  const candidates: RecoveryCandidate[] = await tx
    .select({
      position: providerOrderSnapshots.position,
      providerOrderSnapshotId: providerOrderSnapshots.id,
      shipmentId: providerOrderSnapshots.shipmentId,
      providerOrderId: providerOrderSnapshots.providerOrderId,
      providerBatchId: providerOrderSnapshots.providerBatchId,
      orderStatus: providerOrderSnapshots.status,
      shipmentStatus: shipments.status,
      isCod: providerOrderSnapshots.isCod,
      isPaid: providerOrderSnapshots.isPaid,
      cnoteNo: providerOrderSnapshots.cnoteNo,
      recoveryId: providerUnpaidRecoveries.id,
      recoveryStatus: providerUnpaidRecoveries.status,
    })
    .from(providerOrderSnapshots)
    .innerJoin(
      shipments,
      and(
        eq(shipments.id, providerOrderSnapshots.shipmentId),
        eq(shipments.tenantId, providerOrderSnapshots.tenantId),
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
        eq(providerOrderSnapshots.batchId, batchId),
        eq(providerOrderSnapshots.tenantId, context.tenantId),
      ),
    )
    .orderBy(asc(providerOrderSnapshots.position));

  const invalidAwaiting = candidates.some(
    (row) => row.orderStatus === "AWAITING_UPSTREAM_PAYMENT" && !isAwaitingRecovery(row),
  );
  const invalidExisting = candidates.some(
    (row) => row.recoveryId !== null && !hasConsistentExistingRecovery(row),
  );
  if (invalidAwaiting || invalidExisting) throw new UnpaidRecoveryUnavailableError();

  const targets = candidates.filter(
    (row) => row.recoveryId !== null || isAwaitingRecovery(row),
  );
  if (targets.length === 0) throw new UnpaidRecoveryUnavailableError();

  const missing = targets.filter((row) => row.recoveryId === null);
  // Review 2026-09-26: a legacy order without the Mengantar batch id can never be paid;
  // refuse before any row is written so it cannot sit in PAYMENT_QUEUED for good.
  if (missing.some((row) => !row.providerBatchId)) throw new MengantarUnpaidRecoveryBatchIdMissingError();
  const inserted = missing.length === 0
    ? []
    : await tx
        .insert(providerUnpaidRecoveries)
        .values(
          missing.map((row) => ({
            tenantId: context.tenantId,
            batchId,
            providerOrderSnapshotId: row.providerOrderSnapshotId,
            requestedByUserId: context.userId,
          })),
        )
        .onConflictDoNothing({
          target: providerUnpaidRecoveries.providerOrderSnapshotId,
        })
        .returning({
          id: providerUnpaidRecoveries.id,
          providerOrderSnapshotId: providerUnpaidRecoveries.providerOrderSnapshotId,
        });
  const createdOrderIds = new Set(inserted.map((row) => row.providerOrderSnapshotId));

  const persisted = await tx
    .select({
      id: providerUnpaidRecoveries.id,
      providerOrderSnapshotId: providerUnpaidRecoveries.providerOrderSnapshotId,
      status: providerUnpaidRecoveries.status,
    })
    .from(providerUnpaidRecoveries)
    .where(
      and(
        eq(providerUnpaidRecoveries.batchId, batchId),
        eq(providerUnpaidRecoveries.tenantId, context.tenantId),
        inArray(
          providerUnpaidRecoveries.providerOrderSnapshotId,
          targets.map((row) => row.providerOrderSnapshotId),
        ),
      ),
    );
  if (persisted.length !== targets.length) throw new UnpaidRecoveryUnavailableError();

  const persistedByOrderId = new Map(
    persisted.map((row) => [row.providerOrderSnapshotId, row]),
  );
  return {
    scope: {
      tenantId: context.tenantId,
      batchId,
      outletId: batch.outletId,
      pickupAddressId: batch.pickupAddressId,
      courier: batch.courier,
      credentialSource: batch.credentialSource,
      providerAccountKey: batch.providerAccountKey,
    },
    recoveries: targets.map((target) => {
      const recovery = persistedByOrderId.get(target.providerOrderSnapshotId);
      const providerOrderId = target.providerOrderId?.trim();
      if (!recovery || !providerOrderId) throw new UnpaidRecoveryUnavailableError();
      return {
        id: recovery.id,
        batchId,
        providerOrderSnapshotId: target.providerOrderSnapshotId,
        shipmentId: target.shipmentId,
        providerOrderId,
        providerBatchId: target.providerBatchId?.trim() || null,
        created: createdOrderIds.has(target.providerOrderSnapshotId),
        status: recovery.status,
      };
    }),
  };
}

export async function claimUnpaidRecovery(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
  recoveryId: string,
): Promise<boolean> {
  requireTenantAdmin(context);
  const claimed = await tx
    .update(providerUnpaidRecoveries)
    .set({ status: "PAYING", attemptedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(providerUnpaidRecoveries.id, recoveryId),
        eq(providerUnpaidRecoveries.batchId, batchId),
        eq(providerUnpaidRecoveries.tenantId, context.tenantId),
        eq(providerUnpaidRecoveries.status, "PAYMENT_QUEUED"),
      ),
    )
    .returning({ id: providerUnpaidRecoveries.id });
  return claimed.length === 1;
}
export async function markUnpaidRecoveryUnknown(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
  recoveryId: string,
  responseCode: string,
) {
  requireTenantAdmin(context);
  if (!/^[A-Z0-9_]{1,80}$/.test(responseCode)) {
    throw new UnpaidRecoveryUnavailableError();
  }
  const updated = await tx
    .update(providerUnpaidRecoveries)
    .set({
      status: "PAYMENT_UNKNOWN",
      safeResponseCode: responseCode,
      completedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(providerUnpaidRecoveries.id, recoveryId),
        eq(providerUnpaidRecoveries.batchId, batchId),
        eq(providerUnpaidRecoveries.tenantId, context.tenantId),
        eq(providerUnpaidRecoveries.status, "PAYING"),
      ),
    )
    .returning({ id: providerUnpaidRecoveries.id });
  if (updated.length !== 1) throw new UnpaidRecoveryUnavailableError();
}

export async function markStaleUnpaidRecoveryUnknown(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
  recoveryId: string,
): Promise<boolean> {
  requireTenantAdmin(context);
  const updated = await tx
    .update(providerUnpaidRecoveries)
    .set({
      status: "PAYMENT_UNKNOWN",
      safeResponseCode: "PAY_UNPAID_INTERRUPTED",
      completedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(providerUnpaidRecoveries.id, recoveryId),
        eq(providerUnpaidRecoveries.batchId, batchId),
        eq(providerUnpaidRecoveries.tenantId, context.tenantId),
        eq(providerUnpaidRecoveries.status, "PAYING"),
        sql`${providerUnpaidRecoveries.attemptedAt} <= now() - (${UNPAID_RECOVERY_CLAIM_STALE_AFTER_SECONDS} * interval '1 second')`,
      ),
    )
    .returning({ id: providerUnpaidRecoveries.id });
  return updated.length === 1;
}

export async function completeUnpaidRecovery(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
  recoveryId: string,
  result: ProviderUnpaidRecoveryResult,
) {
  requireTenantAdmin(context);

  const [target] = await tx
    .select({
      recoveryStatus: providerUnpaidRecoveries.status,
      providerOrderSnapshotId: providerOrderSnapshots.id,
      shipmentId: providerOrderSnapshots.shipmentId,
      orderStatus: providerOrderSnapshots.status,
      providerOrderId: providerOrderSnapshots.providerOrderId,
      providerBatchId: providerOrderSnapshots.providerBatchId,
      isCod: providerOrderSnapshots.isCod,
      isPaid: providerOrderSnapshots.isPaid,
      cnoteNo: providerOrderSnapshots.cnoteNo,
      courier: providerBatches.courier,
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
      providerBatches,
      and(
        eq(providerBatches.id, providerUnpaidRecoveries.batchId),
        eq(providerBatches.tenantId, providerUnpaidRecoveries.tenantId),
      ),
    )
    .where(
      and(
        eq(providerUnpaidRecoveries.id, recoveryId),
        eq(providerUnpaidRecoveries.batchId, batchId),
        eq(providerUnpaidRecoveries.tenantId, context.tenantId),
      ),
    )
    .limit(1);

  const providerBatchId = result.providerBatchId.trim();
  const cnoteNo = result.cnoteNo.trim();
  if (
    !target
    || target.recoveryStatus !== "PAYING"
    || target.orderStatus !== "AWAITING_UPSTREAM_PAYMENT"
    || target.isCod
    || target.isPaid !== false
    || target.cnoteNo !== null
    || !target.providerOrderId
    || !target.providerBatchId
    || target.providerBatchId.trim() !== providerBatchId
    || target.courier.trim().toUpperCase() !== result.courier.trim().toUpperCase()
    || cnoteNo.length < 1
    || cnoteNo.length > 160
  ) {
    throw new UnpaidRecoveryUnavailableError();
  }

  const issuedOrder = await tx
    .update(providerOrderSnapshots)
    .set({
      status: "ISSUED",
      isPaid: true,
      cnoteNo,
      safeResponseCode: "PAY_UNPAID_ACCEPTED",
      resolvedAt: sql`now()`,
    })
    .where(
      and(
        eq(providerOrderSnapshots.id, target.providerOrderSnapshotId),
        eq(providerOrderSnapshots.batchId, batchId),
        eq(providerOrderSnapshots.tenantId, context.tenantId),
        eq(providerOrderSnapshots.status, "AWAITING_UPSTREAM_PAYMENT"),
        eq(providerOrderSnapshots.providerBatchId, providerBatchId),
        eq(providerOrderSnapshots.isCod, false),
        eq(providerOrderSnapshots.isPaid, false),
        isNull(providerOrderSnapshots.cnoteNo),
      ),
    )
    .returning({ id: providerOrderSnapshots.id });
  if (issuedOrder.length !== 1) throw new UnpaidRecoveryUnavailableError();

  const issuedShipment = await tx
    .update(shipments)
    .set({ status: "ISSUED", updatedAt: sql`now()` })
    .where(
      and(
        eq(shipments.id, target.shipmentId),
        eq(shipments.tenantId, context.tenantId),
        eq(shipments.status, "AWAITING_UPSTREAM_PAYMENT"),
      ),
    )
    .returning({ id: shipments.id });
  if (issuedShipment.length !== 1) throw new UnpaidRecoveryUnavailableError();

  const completed = await tx
    .update(providerUnpaidRecoveries)
    .set({
      status: "COMPLETED",
      safeResponseCode: "PAY_UNPAID_ACCEPTED",
      completedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(providerUnpaidRecoveries.id, recoveryId),
        eq(providerUnpaidRecoveries.batchId, batchId),
        eq(providerUnpaidRecoveries.tenantId, context.tenantId),
        eq(providerUnpaidRecoveries.status, "PAYING"),
      ),
    )
    .returning({ id: providerUnpaidRecoveries.id });
  if (completed.length !== 1) throw new UnpaidRecoveryUnavailableError();
  await appendLedgerForCompletedUnpaidRecovery(tx, context, recoveryId);
}
