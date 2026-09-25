import "server-only";

import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";

import {
  outlets,
  providerBatches,
  providerOrderSnapshots,
  shipmentCodTotals,
  shipmentDrafts,
  shipmentEstimateServices,
  shipmentEstimateSnapshots,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  BASIS_POINTS,
  codOngkirBreakEvenIdr,
  MAX_COD_AMOUNT_IDR,
  MENGANTAR_COD_FEE_BASIS_POINTS,
  mengantarCodFeeIdr,
} from "@/lib/mengantar-cod-fee";

const ZERO = BigInt("0");
const ONE = BigInt("1");
const POSTGRES_INTEGER_MAX = BigInt("2147483647");
const COD_SCALE = BigInt(BASIS_POINTS);
const COD_NET_OF_FEE = BigInt(BASIS_POINTS - MENGANTAR_COD_FEE_BASIS_POINTS);
// VAT is 11% of the fee, so the fee is 100/111 of fee + VAT.
const FEE_SHARE_NUMERATOR = BigInt("100");
const FEE_SHARE_DENOMINATOR = BigInt("111");
const FEE_SHARE_HALF = BigInt("55");

/**
 * Which formula a `shipment_cod_totals` row was written with. Every row records
 * what was actually submitted to Mengantar, so a row is never recomputed under a
 * newer formula; the database checks each version's own arithmetic
 * (`drizzle/0048_cod_amount_gross_up.sql`).
 *
 * - 1 (until T-175): additive — fee = round(3% × (goods + shipping)),
 *   VAT = round(11% × fee), COD = goods + shipping + fee + VAT. Mengantar then
 *   keeps 3.33% of that COD, so the seller came up 0.111% of (goods + shipping)
 *   short on every COD shipment.
 * - 2 (T-175): grossed up — see `calculateCodAmounts`.
 * - 3 (T-186): COD Ongkir — the courier collects a shipping charge only; see
 *   `calculateCodOngkirAmounts`.
 */
export const COD_FORMULA_VERSION = 2;
export const COD_ONGKIR_FORMULA_VERSION = 3;

export type CodEstimateSelection = {
  shipmentId: string;
  snapshotId: string;
  providerService: string;
};

export type CodConfirmationSelection = {
  shipmentId: string;
  estimateSnapshotId: string;
  estimateServiceId: string;
  /**
   * T-186: the COD Ongkir charge the operator confirmed. Required for a COD
   * Ongkir draft and refused for any other method, so a value the form never
   * showed cannot become money.
   */
  codShippingChargeIdr?: number | null;
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
  codFormulaVersion: number;
  /** Version 3 only: the shipping Mengantar deducts the charge was checked against. */
  codShippingBasisIdr: number | null;
  createdAt: Date;
};

export class CodTotalsUnavailableError extends Error {
  constructor() {
    super("COD totals selection is unavailable.");
  }
}

/**
 * T-193: the shipment already holds a formula version 1 COD totals row and
 * nothing has been sent to Mengantar with it. Confirming would submit the
 * pre-T-175 amount, which leaves the seller about 0.111% of goods plus shipping
 * short. The row is immutable and one per shipment (INSERT/SELECT grants only,
 * `shipment_cod_totals_shipment_tenant_key`), so it cannot be recomputed as
 * version 2 either: the shipment is refused and the operator makes a new one.
 */
export class CodTotalsFormulaRetiredError extends Error {
  constructor() {
    super("COD totals were recorded under a retired formula.");
  }
}

/**
 * A COD Ongkir charge the server will not record. `breakEvenIdr` is the lowest
 * charge it would accept for the selected service, so the operator can be told
 * the exact figure; `recordedChargeIdr` is set when the shipment already holds
 * an immutable charge that a retry did not repeat.
 */
export class CodOngkirChargeRefusedError extends Error {
  readonly reason: "MISSING" | "INVALID" | "BELOW_BREAK_EVEN" | "NOT_COD_ONGKIR" | "ALREADY_RECORDED";
  readonly breakEvenIdr: number | null;
  readonly recordedChargeIdr: number | null;

  constructor(
    reason: CodOngkirChargeRefusedError["reason"],
    breakEvenIdr: number | null = null,
    recordedChargeIdr: number | null = null,
  ) {
    super("COD Ongkir charge is refused.");
    this.reason = reason;
    this.breakEvenIdr = breakEvenIdr;
    this.recordedChargeIdr = recordedChargeIdr;
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

/**
 * COD formula version 2 (T-175). The buyer pays goods plus shipping, and
 * Mengantar keeps `specialShipping + 0.0333 × COD` of what the buyer paid, so
 * COD is grossed up to the smallest whole rupiah whose net of Mengantar's fee
 * still covers goods plus shipping:
 *
 *   COD = ceil((goods + shipping) × 10000 / 9667)
 *
 * The markup `M = COD − goods − shipping` is split so the two stored columns
 * keep summing to it: `serviceFee = round_half_up(M × 100 / 111)` and
 * `vat = M − serviceFee`. `M × 100 / 111` never lands on exactly .5 (200M is
 * even, an odd multiple of 111 is odd), so the rounding has no tie to break.
 * Integer arithmetic only; the same rule is a CHECK in the database.
 */
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
  const providerCod =
    ((goods + shipping) * COD_SCALE + COD_NET_OF_FEE - ONE) / COD_NET_OF_FEE;
  const markup = providerCod - goods - shipping;
  const serviceFee =
    (markup * FEE_SHARE_NUMERATOR + FEE_SHARE_HALF) / FEE_SHARE_DENOMINATOR;
  const vat = markup - serviceFee;

  return {
    codFormulaVersion: COD_FORMULA_VERSION,
    goodsValueIdr: wholeIdr(goods),
    shippingAmountIdr: wholeIdr(shipping),
    serviceFeeIdr: wholeIdr(serviceFee),
    vatAmountIdr: wholeIdr(vat),
    providerCodAmountIdr: wholeIdr(providerCod),
  };
}

/**
 * COD formula version 3 (T-186, COD Ongkir). The goods were paid for outside
 * GeraiCUAN, so the COD amount is the operator's shipping charge alone. It must
 * be at least `codOngkirBreakEvenIdr(shippingDeducted)` — the smallest whole
 * rupiah whose net of Mengantar's 3.33% still covers the shipping Mengantar
 * deducts — and may be raised above it; the seller keeps the difference.
 * `serviceFee + vat` is Mengantar's fee on the charge, half-up, split 100/111
 * like version 2. Goods and the quote `price` are recorded, never collected.
 * The database checks the same rules (`drizzle/0050_cod_ongkir_payment_method.sql`).
 */
export function calculateCodOngkirAmounts(input: {
  goodsValueIdr: number;
  shippingAmountIdr: number;
  shippingDeductedIdr: number;
  chargeIdr: number | null;
}) {
  if (
    !Number.isSafeInteger(input.goodsValueIdr)
    || input.goodsValueIdr <= 0
    || input.goodsValueIdr > MAX_COD_AMOUNT_IDR
    || !Number.isSafeInteger(input.shippingAmountIdr)
    || input.shippingAmountIdr < 0
    || input.shippingAmountIdr > MAX_COD_AMOUNT_IDR
  ) {
    throw new CodTotalsUnavailableError();
  }
  const breakEvenIdr = input.shippingDeductedIdr > MAX_COD_AMOUNT_IDR
    ? null
    : codOngkirBreakEvenIdr(input.shippingDeductedIdr);
  if (breakEvenIdr === null) throw new CodTotalsUnavailableError();
  if (input.chargeIdr === null) {
    throw new CodOngkirChargeRefusedError("MISSING", breakEvenIdr);
  }
  if (
    !Number.isSafeInteger(input.chargeIdr)
    || input.chargeIdr <= 0
    || input.chargeIdr > MAX_COD_AMOUNT_IDR
  ) {
    throw new CodOngkirChargeRefusedError("INVALID", breakEvenIdr);
  }
  if (input.chargeIdr < breakEvenIdr) {
    throw new CodOngkirChargeRefusedError("BELOW_BREAK_EVEN", breakEvenIdr);
  }

  const feeTotal = BigInt(mengantarCodFeeIdr(input.chargeIdr));
  const serviceFee =
    (feeTotal * FEE_SHARE_NUMERATOR + FEE_SHARE_HALF) / FEE_SHARE_DENOMINATOR;

  return {
    codFormulaVersion: COD_ONGKIR_FORMULA_VERSION,
    codShippingBasisIdr: input.shippingDeductedIdr,
    goodsValueIdr: input.goodsValueIdr,
    shippingAmountIdr: input.shippingAmountIdr,
    serviceFeeIdr: wholeIdr(serviceFee),
    vatAmountIdr: wholeIdr(feeTotal - serviceFee),
    providerCodAmountIdr: input.chargeIdr,
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
      codFormulaVersion: shipmentCodTotals.codFormulaVersion,
      codShippingBasisIdr: shipmentCodTotals.codShippingBasisIdr,
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

/**
 * T-193: whether an order for this selection has already been attempted at
 * Mengantar — its batch left the never-attempted queue. Only then may a
 * version 1 totals row be read back: the provider already holds that amount,
 * and a retry returns the recorded outcome without submitting anything. A batch
 * still queued and never attempted would be submitted on resume, with the old
 * amount, so it is refused like a row with no order at all.
 */
async function providerSubmissionAttempted(
  tx: TenantTransaction,
  context: TenantContext,
  selection: Pick<CodConfirmationSelection, "shipmentId">,
) {
  const rows = await tx
    .select({ id: providerOrderSnapshots.id })
    .from(providerOrderSnapshots)
    .innerJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(
      and(
        eq(providerOrderSnapshots.tenantId, context.tenantId),
        eq(providerOrderSnapshots.shipmentId, selection.shipmentId),
        or(
          ne(providerBatches.status, "SUBMISSION_QUEUED"),
          isNotNull(providerBatches.submissionAttemptedAt),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * T-193 / T-199: the one decision behind `CodTotalsFormulaRetiredError`. True
 * when the shipment holds a version 1 COD totals row and no order with it has
 * been attempted at Mengantar. Confirmation throws on it; the shipment detail
 * reads it before rendering, so the operator sees the refusal and a disabled
 * confirm button instead of a current-formula preview the server would refuse.
 */
export async function shipmentCodFormulaRetired(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
) {
  const recorded = await loadCodTotalsForShipment(tx, context, shipmentId);
  return recorded?.codFormulaVersion === 1
    && !(await providerSubmissionAttempted(tx, context, { shipmentId }));
}

type ConfirmationEstimate = {
  codShippingOnly: boolean;
  currency: "IDR";
  goodsValueIdr: number;
  isCod: boolean;
  shippingAmountIdr: number;
  shippingDeductedIdr: number;
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
      ${shipmentDrafts.codShippingOnly} AS "codShippingOnly",
      ${shipmentEstimateServices.shippingAmountIdr} AS "shippingAmountIdr",
      -- T-186: the shipping Mengantar deducts, the COD Ongkir break-even basis;
      -- the same COALESCE as provider_order_snapshots.provider_charged_shipping_idr.
      coalesce(
        ${shipmentEstimateServices.specialPriceIdr},
        ${shipmentEstimateServices.normalPriceIdr},
        ${shipmentEstimateServices.shippingAmountIdr}
      ) AS "shippingDeductedIdr"
    FROM ${shipments}
    INNER JOIN ${shipmentDrafts}
      ON ${shipmentDrafts.shipmentId} = ${shipments.id}
      AND ${shipmentDrafts.tenantId} = ${shipments.tenantId}
    INNER JOIN ${outlets}
      ON ${outlets.id} = ${shipments.outletId}
      AND ${outlets.tenantId} = ${shipments.tenantId}
    -- T-157: the origin the estimate was taken at is the draft's own pickup
    -- point, falling back to the outlet default only for a draft that has none.
    -- Matching the outlet default alone made every COD shipment from a
    -- non-default pickup point fail confirmation with CodTotalsUnavailableError.
    INNER JOIN ${shipmentEstimateSnapshots}
      ON ${shipmentEstimateSnapshots.id} = ${selection.estimateSnapshotId}
      AND ${shipmentEstimateSnapshots.shipmentId} = ${shipments.id}
      AND ${shipmentEstimateSnapshots.outletId} = ${shipments.outletId}
      AND ${shipmentEstimateSnapshots.tenantId} = ${shipments.tenantId}
      AND ${shipmentEstimateSnapshots.originAreaId} = coalesce(
        ${shipmentDrafts.originAreaId},
        ${outlets.defaultOriginAreaId}
      )
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
  const charge = selection.codShippingChargeIdr ?? null;
  // Checked on the shipment's row, whichever estimate wrote it: re-estimating
  // cannot replace it (one immutable row per shipment).
  if (await shipmentCodFormulaRetired(tx, context, selection.shipmentId)) {
    throw new CodTotalsFormulaRetiredError();
  }
  const existing = await loadCodTotalsForSelection(tx, context, selection);
  if (existing) {
    // A recorded row is immutable: a retry confirms the charge already stored,
    // and a charge sent for a shipment that is not COD Ongkir is refused.
    if (existing.codFormulaVersion === COD_ONGKIR_FORMULA_VERSION) {
      if (charge !== existing.providerCodAmountIdr) {
        throw new CodOngkirChargeRefusedError(
          "ALREADY_RECORDED",
          null,
          existing.providerCodAmountIdr,
        );
      }
    } else if (charge !== null) {
      throw new CodOngkirChargeRefusedError("NOT_COD_ONGKIR");
    }
    return existing;
  }

  const existingOrderIsCod = await loadExistingProviderOrderCodState(
    tx,
    context,
    selection,
  );
  if (existingOrderIsCod !== null) {
    if (!existingOrderIsCod && charge === null) return null;
    throw new CodTotalsUnavailableError();
  }

  const estimate = await loadConfirmationEstimate(tx, context, selection);
  if (!estimate.codShippingOnly && charge !== null) {
    throw new CodOngkirChargeRefusedError("NOT_COD_ONGKIR");
  }
  if (!estimate.isCod) return null;

  const amounts = estimate.codShippingOnly
    ? calculateCodOngkirAmounts({
        chargeIdr: charge,
        goodsValueIdr: estimate.goodsValueIdr,
        shippingAmountIdr: estimate.shippingAmountIdr,
        shippingDeductedIdr: estimate.shippingDeductedIdr,
      })
    : { ...calculateCodAmounts(estimate.goodsValueIdr, estimate.shippingAmountIdr), codShippingBasisIdr: null };
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
      codFormulaVersion: shipmentCodTotals.codFormulaVersion,
      codShippingBasisIdr: shipmentCodTotals.codShippingBasisIdr,
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
    totals.providerCodAmountIdr !== amounts.providerCodAmountIdr ||
    totals.codFormulaVersion !== amounts.codFormulaVersion ||
    totals.codShippingBasisIdr !== amounts.codShippingBasisIdr
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
      -- Version 2 only: a COD Ongkir charge is chosen at confirmation (T-186).
      AND ${shipmentDrafts.codShippingOnly} = false
      AND ${shipmentEstimateSnapshots.id} = ${selection.snapshotId}
      AND ${shipmentEstimateSnapshots.isCodRequested} = true
      AND ${shipmentEstimateSnapshots.originAreaId} = coalesce(
        ${shipmentDrafts.originAreaId},
        ${outlets.defaultOriginAreaId}
      )
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
      codFormulaVersion: shipmentCodTotals.codFormulaVersion,
      codShippingBasisIdr: shipmentCodTotals.codShippingBasisIdr,
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
      codFormulaVersion: shipmentCodTotals.codFormulaVersion,
      codShippingBasisIdr: shipmentCodTotals.codShippingBasisIdr,
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
