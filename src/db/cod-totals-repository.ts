import { and, eq, sql } from "drizzle-orm";

import {
  outlets,
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

function calculateCodAmounts(goodsValueIdr: number, shippingAmountIdr: number) {
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
