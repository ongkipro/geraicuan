import "server-only";

import { and, eq, sql } from "drizzle-orm";

import {
  outlets,
  providerOrderSnapshots,
  shipmentCodTotals,
  shipmentDrafts,
  shipmentEstimateServices,
  shipmentEstimateSnapshots,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

const ZERO = BigInt("0");
const SERVICE_FEE_NUMERATOR = BigInt("3");
const VAT_NUMERATOR = BigInt("11");
const HALF_PERCENT_DENOMINATOR = BigInt("50");
const PERCENT_DENOMINATOR = BigInt("100");
const POSTGRES_INTEGER_MAX = BigInt("2147483647");

export type CodEstimateSelection = {
  shipmentId: string;
  snapshotId: string;
  providerService: string;
};

export type CodConfirmationSelection = {
  shipmentId: string;
  estimateSnapshotId: string;
  estimateServiceId: string;
};

export type PersistedCodTotals = {
  id: string;
  shipmentId: string;
  snapshotId: string;
  estimateServiceId: string;
  currency: "IDR";
  goodsValueIdr: number;
  shippingAmountIdr: number;
  serviceFeeIdr: number;
  vatAmountIdr: number;
  providerCodAmountIdr: number;
  createdAt: Date;
};

export class CodTotalsUnavailableError extends Error {
  constructor() {
    super("COD totals selection is unavailable.");
  }
}

type SelectedEstimate = {
  estimateServiceId: string;
  currency: "IDR";
  goodsValueIdr: number;
  shippingAmountIdr: number;
};

function wholeIdr(value: bigint): number {
  if (value < ZERO || value > POSTGRES_INTEGER_MAX) {
    throw new CodTotalsUnavailableError();
  }

  return Number(value);
}

export function calculateCodAmounts(goodsValueIdr: number, shippingAmountIdr: number) {
  if (
    !Number.isSafeInteger(goodsValueIdr) ||
    goodsValueIdr <= 0 ||
    !Number.isSafeInteger(shippingAmountIdr) ||
    shippingAmountIdr < 0
  ) {
    throw new CodTotalsUnavailableError();
  }

  const goods = BigInt(goodsValueIdr);
  const shipping = BigInt(shippingAmountIdr);
  const serviceFee =
    ((goods + shipping) * SERVICE_FEE_NUMERATOR + HALF_PERCENT_DENOMINATOR) /
    PERCENT_DENOMINATOR;
  const vat =
    (serviceFee * VAT_NUMERATOR + HALF_PERCENT_DENOMINATOR) /
    PERCENT_DENOMINATOR;
  const providerCod = goods + shipping + serviceFee + vat;

  return {
    goodsValueIdr: wholeIdr(goods),
    shippingAmountIdr: wholeIdr(shipping),
    serviceFeeIdr: wholeIdr(serviceFee),
    vatAmountIdr: wholeIdr(vat),
    providerCodAmountIdr: wholeIdr(providerCod),
  };
}

export function calculateCodAmountsOrNull(
  goodsValueIdr: number,
  shippingAmountIdr: number,
) {
  try {
    return calculateCodAmounts(goodsValueIdr, shippingAmountIdr);
  } catch (error) {
    if (error instanceof CodTotalsUnavailableError) return null;
    throw error;
  }
}

async function loadCodTotalsForSelection(
  tx: TenantTransaction,
  context: TenantContext,
  selection: CodConfirmationSelection,
): Promise<PersistedCodTotals | null> {
  const rows = await tx
    .select({
      id: shipmentCodTotals.id,
      shipmentId: shipmentCodTotals.shipmentId,
      snapshotId: shipmentCodTotals.snapshotId,
      estimateServiceId: shipmentCodTotals.estimateServiceId,
      currency: shipmentCodTotals.currency,
      goodsValueIdr: shipmentCodTotals.goodsValueIdr,
      shippingAmountIdr: shipmentCodTotals.shippingAmountIdr,
      serviceFeeIdr: shipmentCodTotals.serviceFeeIdr,
      vatAmountIdr: shipmentCodTotals.vatAmountIdr,
      providerCodAmountIdr: shipmentCodTotals.providerCodAmountIdr,
      createdAt: shipmentCodTotals.createdAt,
    })
    .from(shipmentCodTotals)
    .where(
      and(
        eq(shipmentCodTotals.tenantId, context.tenantId),
        eq(shipmentCodTotals.shipmentId, selection.shipmentId),
        eq(shipmentCodTotals.snapshotId, selection.estimateSnapshotId),
        eq(shipmentCodTotals.estimateServiceId, selection.estimateServiceId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

async function loadExistingProviderOrderCodState(
  tx: TenantTransaction,
  context: TenantContext,
  selection: CodConfirmationSelection,
): Promise<boolean | null> {
  const rows = await tx
    .select({ isCod: providerOrderSnapshots.isCod })
    .from(providerOrderSnapshots)
    .where(
      and(
        eq(providerOrderSnapshots.tenantId, context.tenantId),
        eq(providerOrderSnapshots.shipmentId, selection.shipmentId),
        eq(
          providerOrderSnapshots.estimateSnapshotId,
          selection.estimateSnapshotId,
        ),
        eq(
          providerOrderSnapshots.estimateServiceId,
          selection.estimateServiceId,
        ),
      ),
    )
    .limit(1);

  return rows[0]?.isCod ?? null;
}

type ConfirmationEstimate = {
  currency: "IDR";
  goodsValueIdr: number;
  isCod: boolean;
  shippingAmountIdr: number;
};

async function loadConfirmationEstimate(
  tx: TenantTransaction,
  context: TenantContext,
  selection: CodConfirmationSelection,
): Promise<ConfirmationEstimate> {
  const selected = await tx.execute<ConfirmationEstimate>(sql`
    SELECT
      ${shipmentEstimateServices.currency} AS "currency",
      ${shipmentDrafts.declaredValueIdr} AS "goodsValueIdr",
      ${shipmentDrafts.isCod} AS "isCod",
      ${shipmentEstimateServices.shippingAmountIdr} AS "shippingAmountIdr"
    FROM ${shipments}
    INNER JOIN ${shipmentDrafts}
      ON ${shipmentDrafts.shipmentId} = ${shipments.id}
      AND ${shipmentDrafts.tenantId} = ${shipments.tenantId}
    INNER JOIN ${outlets}
      ON ${outlets.id} = ${shipments.outletId}
      AND ${outlets.tenantId} = ${shipments.tenantId}
    INNER JOIN ${shipmentEstimateSnapshots}
      ON ${shipmentEstimateSnapshots.id} = ${selection.estimateSnapshotId}
      AND ${shipmentEstimateSnapshots.shipmentId} = ${shipments.id}
      AND ${shipmentEstimateSnapshots.outletId} = ${shipments.outletId}
      AND ${shipmentEstimateSnapshots.tenantId} = ${shipments.tenantId}
      AND ${shipmentEstimateSnapshots.originAreaId} = ${outlets.defaultOriginAreaId}
      AND ${shipmentEstimateSnapshots.destinationAreaId} = ${shipmentDrafts.destinationAreaId}
      AND ${shipmentEstimateSnapshots.destinationAreaLabel} = ${shipmentDrafts.destinationAreaLabel}
      AND ${shipmentEstimateSnapshots.weightGrams} = ${shipmentDrafts.packageWeightGrams}
      AND ${shipmentEstimateSnapshots.isCodRequested} = ${shipmentDrafts.isCod}
    INNER JOIN ${shipmentEstimateServices}
      ON ${shipmentEstimateServices.id} = ${selection.estimateServiceId}
      AND ${shipmentEstimateServices.snapshotId} = ${shipmentEstimateSnapshots.id}
      AND ${shipmentEstimateServices.tenantId} = ${shipmentEstimateSnapshots.tenantId}
      AND ${shipmentEstimateServices.currency} = 'IDR'
      AND (
        NOT ${shipmentDrafts.isCod}
        OR ${shipmentEstimateServices.codEligible}
      )
    WHERE ${shipments.id} = ${selection.shipmentId}
      AND ${shipments.tenantId} = ${context.tenantId}
      AND ${shipments.status} = 'ESTIMATED'
      AND NOT EXISTS (
        SELECT 1
        FROM ${shipmentEstimateSnapshots} AS newer_snapshot
        WHERE newer_snapshot.shipment_id = ${shipments.id}
          AND newer_snapshot.tenant_id = ${shipments.tenantId}
          AND (
            newer_snapshot.retrieved_at > ${shipmentEstimateSnapshots.retrievedAt}
            OR (
              newer_snapshot.retrieved_at = ${shipmentEstimateSnapshots.retrievedAt}
              AND newer_snapshot.id > ${shipmentEstimateSnapshots.id}
            )
          )
      )
    FOR UPDATE OF ${shipments}
  `);

  const estimate = selected.rows[0];
  if (!estimate) throw new CodTotalsUnavailableError();
  return estimate;
}

export async function ensureCodTotalsForConfirmation(
  tx: TenantTransaction,
  context: TenantContext,
  selection: CodConfirmationSelection,
): Promise<PersistedCodTotals | null> {
  const existing = await loadCodTotalsForSelection(tx, context, selection);
  if (existing) return existing;

  const existingOrderIsCod = await loadExistingProviderOrderCodState(
    tx,
    context,
    selection,
  );
  if (existingOrderIsCod !== null) {
    if (!existingOrderIsCod) return null;
    throw new CodTotalsUnavailableError();
  }

  const estimate = await loadConfirmationEstimate(tx, context, selection);
  if (!estimate.isCod) return null;

  const amounts = calculateCodAmounts(
    estimate.goodsValueIdr,
    estimate.shippingAmountIdr,
  );
  const inserted = await tx
    .insert(shipmentCodTotals)
    .values({
      tenantId: context.tenantId,
      shipmentId: selection.shipmentId,
      snapshotId: selection.estimateSnapshotId,
      estimateServiceId: selection.estimateServiceId,
      currency: estimate.currency,
      ...amounts,
    })
    .onConflictDoNothing({
      target: [shipmentCodTotals.shipmentId, shipmentCodTotals.tenantId],
    })
    .returning({
      id: shipmentCodTotals.id,
      shipmentId: shipmentCodTotals.shipmentId,
      snapshotId: shipmentCodTotals.snapshotId,
      estimateServiceId: shipmentCodTotals.estimateServiceId,
      currency: shipmentCodTotals.currency,
      goodsValueIdr: shipmentCodTotals.goodsValueIdr,
      shippingAmountIdr: shipmentCodTotals.shippingAmountIdr,
      serviceFeeIdr: shipmentCodTotals.serviceFeeIdr,
      vatAmountIdr: shipmentCodTotals.vatAmountIdr,
      providerCodAmountIdr: shipmentCodTotals.providerCodAmountIdr,
      createdAt: shipmentCodTotals.createdAt,
    });
  const totals =
    inserted[0] ??
    (await loadCodTotalsForSelection(tx, context, selection));
  if (
    !totals ||
    totals.goodsValueIdr !== amounts.goodsValueIdr ||
    totals.shippingAmountIdr !== amounts.shippingAmountIdr ||
    totals.serviceFeeIdr !== amounts.serviceFeeIdr ||
    totals.vatAmountIdr !== amounts.vatAmountIdr ||
    totals.providerCodAmountIdr !== amounts.providerCodAmountIdr
  ) {
    throw new CodTotalsUnavailableError();
  }

  return totals;
}

async function loadSelectedEstimate(
  tx: TenantTransaction,
  context: TenantContext,
  selection: CodEstimateSelection,
): Promise<SelectedEstimate> {
  const selected = await tx.execute<SelectedEstimate>(sql`
    SELECT
      ${shipmentEstimateServices.id} AS "estimateServiceId",
      ${shipmentEstimateServices.currency} AS "currency",
      ${shipmentDrafts.declaredValueIdr} AS "goodsValueIdr",
      ${shipmentEstimateServices.shippingAmountIdr} AS "shippingAmountIdr"
    FROM ${shipments}
    INNER JOIN ${shipmentDrafts}
      ON ${shipmentDrafts.shipmentId} = ${shipments.id}
      AND ${shipmentDrafts.tenantId} = ${shipments.tenantId}
    INNER JOIN ${outlets}
      ON ${outlets.id} = ${shipments.outletId}
      AND ${outlets.tenantId} = ${shipments.tenantId}
    INNER JOIN ${shipmentEstimateSnapshots}
      ON ${shipmentEstimateSnapshots.shipmentId} = ${shipments.id}
      AND ${shipmentEstimateSnapshots.tenantId} = ${shipments.tenantId}
      AND ${shipmentEstimateSnapshots.outletId} = ${shipments.outletId}
    INNER JOIN ${shipmentEstimateServices}
      ON ${shipmentEstimateServices.snapshotId} = ${shipmentEstimateSnapshots.id}
      AND ${shipmentEstimateServices.tenantId} = ${shipmentEstimateSnapshots.tenantId}
    WHERE ${shipments.id} = ${selection.shipmentId}
      AND ${shipments.tenantId} = ${context.tenantId}
      AND ${shipments.status} IN ('DRAFT', 'ESTIMATED')
      AND ${shipmentDrafts.isCod} = true
      AND ${shipmentEstimateSnapshots.id} = ${selection.snapshotId}
      AND ${shipmentEstimateSnapshots.isCodRequested} = true
      AND ${shipmentEstimateSnapshots.originAreaId} = ${outlets.defaultOriginAreaId}
      AND ${shipmentEstimateSnapshots.destinationAreaId} = ${shipmentDrafts.destinationAreaId}
      AND ${shipmentEstimateSnapshots.destinationAreaLabel} = ${shipmentDrafts.destinationAreaLabel}
      AND ${shipmentEstimateSnapshots.weightGrams} = ${shipmentDrafts.packageWeightGrams}
      AND NOT EXISTS (
        SELECT 1
        FROM ${shipmentEstimateSnapshots} AS newer_snapshot
        WHERE newer_snapshot.shipment_id = ${shipments.id}
          AND newer_snapshot.tenant_id = ${shipments.tenantId}
          AND newer_snapshot.retrieved_at > ${shipmentEstimateSnapshots.retrievedAt}
      )
      AND ${shipmentEstimateServices.providerService} = ${selection.providerService}
      AND ${shipmentEstimateServices.codEligible} = true
      AND ${shipmentEstimateServices.currency} = 'IDR'
    FOR UPDATE OF ${shipments}, ${shipmentDrafts}, ${outlets}
  `);

  const row = selected.rows[0];
  if (!row) {
    throw new CodTotalsUnavailableError();
  }

  return row;
}

export async function persistCodTotalsForEstimate(
  tx: TenantTransaction,
  context: TenantContext,
  selection: CodEstimateSelection,
): Promise<PersistedCodTotals> {
  const estimate = await loadSelectedEstimate(tx, context, selection);
  const amounts = calculateCodAmounts(
    estimate.goodsValueIdr,
    estimate.shippingAmountIdr,
  );

  const inserted = await tx
    .insert(shipmentCodTotals)
    .values({
      tenantId: context.tenantId,
      shipmentId: selection.shipmentId,
      snapshotId: selection.snapshotId,
      estimateServiceId: estimate.estimateServiceId,
      currency: estimate.currency,
      ...amounts,
    })
    .returning({
      id: shipmentCodTotals.id,
      shipmentId: shipmentCodTotals.shipmentId,
      snapshotId: shipmentCodTotals.snapshotId,
      estimateServiceId: shipmentCodTotals.estimateServiceId,
      currency: shipmentCodTotals.currency,
      goodsValueIdr: shipmentCodTotals.goodsValueIdr,
      shippingAmountIdr: shipmentCodTotals.shippingAmountIdr,
      serviceFeeIdr: shipmentCodTotals.serviceFeeIdr,
      vatAmountIdr: shipmentCodTotals.vatAmountIdr,
      providerCodAmountIdr: shipmentCodTotals.providerCodAmountIdr,
      createdAt: shipmentCodTotals.createdAt,
    });

  const totals = inserted[0];
  if (!totals) {
    throw new Error("COD totals were not persisted.");
  }

  return totals;
}

export async function loadCodTotalsForShipment(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<PersistedCodTotals | null> {
  const rows = await tx
    .select({
      id: shipmentCodTotals.id,
      shipmentId: shipmentCodTotals.shipmentId,
      snapshotId: shipmentCodTotals.snapshotId,
      estimateServiceId: shipmentCodTotals.estimateServiceId,
      currency: shipmentCodTotals.currency,
      goodsValueIdr: shipmentCodTotals.goodsValueIdr,
      shippingAmountIdr: shipmentCodTotals.shippingAmountIdr,
      serviceFeeIdr: shipmentCodTotals.serviceFeeIdr,
      vatAmountIdr: shipmentCodTotals.vatAmountIdr,
      providerCodAmountIdr: shipmentCodTotals.providerCodAmountIdr,
      createdAt: shipmentCodTotals.createdAt,
    })
    .from(shipmentCodTotals)
    .where(
      and(
        eq(shipmentCodTotals.shipmentId, shipmentId),
        eq(shipmentCodTotals.tenantId, context.tenantId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}
