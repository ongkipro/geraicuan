import "server-only";

import { and, desc, eq, or, sql } from "drizzle-orm";

import {
  providerBatches,
  providerOrderSnapshots,
  providerOrderStatusObservations,
  shipmentDrafts,
  shipments,
  type shipmentStatuses,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

/**
 * PR-51 tracking lookup key. At least one of `tenantNumber` / `awb` is set; `prefix` is the
 * displayed `PREFIX-` the operator typed, which must match the stored reference when supplied.
 */
export type ShipmentTrackingLookupKey = {
  awb: string | null;
  prefix: string | null;
  tenantNumber: number | null;
};

export type ShipmentTrackingLookup = {
  awb: string | null;
  courier: string | null;
  destinationAreaLabel: string;
  isCod: boolean;
  observation: { observedAt: Date; providerStatus: string } | null;
  providerService: string | null;
  publicReference: string;
  status: (typeof shipmentStatuses)[number];
  updatedAt: Date;
};

/**
 * Resolves one shipment inside the caller's tenant only. Every candidate predicate is ANDed with
 * the server-derived tenant id, so a key owned by another tenant produces the identical empty
 * result as a key that exists nowhere: one statement, one plan, one `null`. RLS repeats the same
 * scope underneath. Provider status comes from already-stored observations; nothing calls out.
 */
export async function lookupShipmentByTrackingKey(
  tx: TenantTransaction,
  context: TenantContext,
  key: ShipmentTrackingLookupKey,
): Promise<ShipmentTrackingLookup | null> {
  const candidates = [
    key.tenantNumber === null
      ? null
      : key.prefix === null
        ? eq(shipments.tenantNumber, key.tenantNumber)
        : eq(shipments.publicReference, `${key.prefix}-${key.tenantNumber}`),
    key.awb === null
      ? null
      : sql`upper(btrim(${providerOrderSnapshots.cnoteNo})) = ${key.awb}`,
  ].filter((candidate) => candidate !== null);
  if (candidates.length === 0) return null;

  const [row] = await tx
    .select({
      awb: providerOrderSnapshots.cnoteNo,
      courier: providerBatches.courier,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      isCod: shipmentDrafts.isCod,
      providerService: providerOrderSnapshots.providerService,
      publicReference: shipments.publicReference,
      shipmentId: shipments.id,
      status: shipments.status,
      updatedAt: shipments.updatedAt,
    })
    .from(shipments)
    .innerJoin(
      shipmentDrafts,
      and(
        eq(shipmentDrafts.shipmentId, shipments.id),
        eq(shipmentDrafts.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(and(eq(shipments.tenantId, context.tenantId), or(...candidates)))
    .limit(1);

  if (!row) return null;

  const [observation] = await tx
    .select({
      observedAt: providerOrderStatusObservations.observedAt,
      providerStatus: providerOrderStatusObservations.providerStatus,
    })
    .from(providerOrderStatusObservations)
    .where(
      and(
        eq(providerOrderStatusObservations.tenantId, context.tenantId),
        eq(providerOrderStatusObservations.shipmentId, row.shipmentId),
      ),
    )
    .orderBy(
      desc(providerOrderStatusObservations.observedAt),
      desc(providerOrderStatusObservations.id),
    )
    .limit(1);

  return {
    awb: row.awb?.trim() || null,
    courier: row.courier,
    destinationAreaLabel: row.destinationAreaLabel,
    isCod: row.isCod,
    observation: observation ?? null,
    providerService: row.providerService,
    publicReference: row.publicReference,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}
