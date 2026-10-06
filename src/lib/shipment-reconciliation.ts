import "server-only";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  applyAuthoritativeShipmentReconciliation,
  loadShipmentReconciliationTarget,
  type AuthoritativeShipmentReconciliation,
  type ShipmentReconciliationTarget,
} from "@/db/shipment-reconciliation-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { normalizeMengantarProviderIdentifier } from "@/lib/mengantar-order";
import { isLiveMengantarOrdersEnabled } from "@/lib/mengantar-live-transport";
import { isSanctionedReconciliationFixtureEnabled } from "@/lib/sanctioned-reconciliation-fixture";

export type ShipmentReconciliationLookupKey = Readonly<{
  batchId: string;
  courier: string;
  credentialSource: ShipmentReconciliationTarget["credentialSource"];
  estimateServiceId: string;
  estimateSnapshotId: string;
  idempotencyKey: string;
  outletId: string;
  pickupAddressId: string;
  providerAccountKey: string;
  shipmentId: string;
  tenantId: string;
}>;

export type ShipmentReconciliationLookupResult = ShipmentReconciliationLookupKey & {
  cnoteNo: unknown;
  isPaid: unknown;
  providerOrderId: unknown;
  /** T-282 (T-227 #3): the Mengantar batch `_id`, when the lookup proved it; else absent or null. */
  providerBatchId?: unknown;
  /** `UNDETERMINED`: the lookup could not prove one outcome; nothing changes (D-43). */
  status: unknown;
};

export type ShipmentReconciliationLookup = (
  key: ShipmentReconciliationLookupKey,
) => Promise<ShipmentReconciliationLookupResult>;

export type ReconcileFixtureBackedShipmentInput = {
  db: NodePgDatabase<typeof schema>;
  principalId: string;
  resolveAuthoritativeResult: ShipmentReconciliationLookup;
  shipmentId: string;
  tenantId: string;
};

export type ReconcileFixtureBackedShipmentResult = {
  awb: string | null;
  shipmentId: string;
  status: AuthoritativeShipmentReconciliation["status"];
};

export class ShipmentReconciliationResultUnavailableError extends Error {
  constructor() {
    super("Authoritative shipment reconciliation result is unavailable.");
  }
}

/**
 * T-282 (D-43): Mengantar's stored orders did not prove one outcome — more than one match,
 * none yet while the order may still appear, or the read could not complete. No state changes.
 */
export class ShipmentReconciliationUndeterminedError extends Error {
  constructor() {
    super("The provider outcome could not be determined automatically.");
  }
}

function optionalBatchId(value: unknown) {
  if (value === undefined || value === null) return null;
  return normalizeMengantarProviderIdentifier(value, "RECONCILIATION_BATCH_ID_UNSAFE");
}

function lookupKey(target: ShipmentReconciliationTarget) {
  return Object.freeze({
    batchId: target.batchId,
    courier: target.courier,
    credentialSource: target.credentialSource,
    estimateServiceId: target.estimateServiceId,
    estimateSnapshotId: target.estimateSnapshotId,
    idempotencyKey: target.idempotencyKey,
    outletId: target.outletId,
    pickupAddressId: target.pickupAddressId,
    providerAccountKey: target.providerAccountKey,
    shipmentId: target.shipmentId,
    tenantId: target.tenantId,
  });
}

function sameLookupKey(
  expected: ShipmentReconciliationLookupKey,
  actual: ShipmentReconciliationLookupResult,
) {
  return actual.batchId === expected.batchId
    && actual.courier === expected.courier
    && actual.credentialSource === expected.credentialSource
    && actual.estimateServiceId === expected.estimateServiceId
    && actual.estimateSnapshotId === expected.estimateSnapshotId
    && actual.idempotencyKey === expected.idempotencyKey
    && actual.outletId === expected.outletId
    && actual.pickupAddressId === expected.pickupAddressId
    && actual.providerAccountKey === expected.providerAccountKey
    && actual.shipmentId === expected.shipmentId
    && actual.tenantId === expected.tenantId;
}

function normalizeResult(
  target: ShipmentReconciliationTarget,
  key: ShipmentReconciliationLookupKey,
  value: ShipmentReconciliationLookupResult,
): AuthoritativeShipmentReconciliation {
  if (!sameLookupKey(key, value)) {
    throw new ShipmentReconciliationResultUnavailableError();
  }
  if (value.status === "UNDETERMINED") throw new ShipmentReconciliationUndeterminedError();

  try {
    if (value.status === "ISSUED") {
      if (typeof value.isPaid !== "boolean") {
        throw new ShipmentReconciliationResultUnavailableError();
      }
      return {
        cnoteNo: normalizeMengantarProviderIdentifier(
          value.cnoteNo,
          "RECONCILIATION_CNOTE_UNSAFE",
        ),
        isPaid: value.isPaid,
        providerOrderId: normalizeMengantarProviderIdentifier(
          value.providerOrderId,
          "RECONCILIATION_ORDER_ID_UNSAFE",
        ),
        providerBatchId: optionalBatchId(value.providerBatchId),
        safeResponseCode: "RECONCILED_ISSUED",
        status: "ISSUED",
      };
    }
    if (value.status === "AWAITING_UPSTREAM_PAYMENT") {
      if (
        target.isCod
        || value.isPaid !== false
        || value.cnoteNo !== null
      ) {
        throw new ShipmentReconciliationResultUnavailableError();
      }
      return {
        cnoteNo: null,
        isPaid: false,
        providerOrderId: normalizeMengantarProviderIdentifier(
          value.providerOrderId,
          "RECONCILIATION_ORDER_ID_UNSAFE",
        ),
        providerBatchId: optionalBatchId(value.providerBatchId),
        safeResponseCode: "RECONCILED_AWAITING_PAYMENT",
        status: "AWAITING_UPSTREAM_PAYMENT",
      };
    }
    if (
      value.status === "FAILED"
      && value.cnoteNo === null
      && value.isPaid === null
      && value.providerOrderId === null
    ) {
      return {
        cnoteNo: null,
        isPaid: null,
        providerOrderId: null,
        providerBatchId: null,
        safeResponseCode: "RECONCILED_FAILED",
        status: "FAILED",
      };
    }
  } catch {
    throw new ShipmentReconciliationResultUnavailableError();
  }
  throw new ShipmentReconciliationResultUnavailableError();
}

export async function reconcileFixtureBackedShipment(
  input: ReconcileFixtureBackedShipmentInput,
): Promise<ReconcileFixtureBackedShipmentResult> {
  const target = await withTenantContext(
    input.db,
    input.principalId,
    input.tenantId,
    (tx, context) =>
      loadShipmentReconciliationTarget(tx, context, input.shipmentId),
  );
  const key = lookupKey(target);
  // T-282: the live lookup (D-42 switch) or the development fixture; neither → nothing to ask.
  if (!isLiveMengantarOrdersEnabled() && !isSanctionedReconciliationFixtureEnabled()) {
    throw new ShipmentReconciliationResultUnavailableError();
  }

  let raw: ShipmentReconciliationLookupResult;
  try {
    raw = await input.resolveAuthoritativeResult(key);
  } catch (error) {
    if (error instanceof ShipmentReconciliationUndeterminedError) throw error;
    throw new ShipmentReconciliationResultUnavailableError();
  }
  const result = normalizeResult(target, key, raw);

  await withTenantContext(
    input.db,
    input.principalId,
    input.tenantId,
    (tx, context) =>
      applyAuthoritativeShipmentReconciliation(tx, context, target, result),
  );
  return {
    awb: result.cnoteNo,
    shipmentId: target.shipmentId,
    status: result.status,
  };
}
