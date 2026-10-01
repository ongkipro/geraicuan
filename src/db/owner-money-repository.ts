import "server-only";

import { sql } from "drizzle-orm";

import {
  classifyProviderSettlement,
  expectedSettlementUnits,
  SETTLED_INVOICE_STATUS,
} from "@/db/provider-settlement-repository";
import { RTS_STATUSES } from "@/db/rts-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import type { AnalyticsRange } from "@/lib/analytics-range";
import { IDR_UNITS, parseIdrUnits } from "@/lib/mengantar-settlement";
import type { PaymentMethod } from "@/lib/payment-method";
import { codNetAmountIdr } from "@/lib/shipment-money";
import type { ShipmentStatus } from "@/lib/shipment-queue";

/*
 * T-275 (D-41): the gerai owner's money — what COD is still outside, what Mengantar has paid
 * out, and the ongkir margin the gerai keeps. Tenant Admin only (D-37/D-38): an Operator and
 * every customer document never see any of it. Spec 19 §Owner money holds the formulas.
 *
 * Cohort: shipments whose resi Mengantar issued in the period (`resolved_at`, like
 * FIN-COD-DISBURSEMENT-EST), cancelled ones excluded. Mengantar's money is exact to a
 * ten-thousandth of a rupiah (T-178), so it is added in BigInt units and rounded once.
 */

/** lazy: one gerai's issued resi for a period; a busier gerai needs SQL aggregation instead. */
export const OWNER_MONEY_ROW_LIMIT = 5000;

export class OwnerMoneyDeniedError extends Error {
  constructor() {
    super("Owner money is visible to the Tenant Admin only.");
  }
}

export type OwnerMoneyRow = {
  shipmentId: string;
  publicReference: string;
  cnoteNo: string;
  courier: string;
  outletName: string;
  status: ShipmentStatus;
  paymentMethod: PaymentMethod;
  issuedAt: Date;
  /** COD: shipment_cod_totals.goods_value_idr; COD Ongkir: 0; Non-COD: null. */
  goodsValueIdr: number | null;
  /** Canonical COD amount (T-199); null for Non-COD or a legacy COD row without totals. */
  collectIdr: number | null;
  /** The quote price — what the gerai charges a Non-COD customer (invoice `shipping_charge_idr`). */
  shippingAmountIdr: number;
  /** What Mengantar deducts for shipping (`provider_charged_shipping_idr`, else the quote). */
  chargedShippingIdr: number;
  /** RPT-SHP-COD-DISBURSEMENT-EST-IDR; null for Non-COD. */
  estimatedPayoutIdr: number | null;
  /** Cleared Mengantar invoice lines for this resi, in ten-thousandths. */
  settledUnits: bigint | null;
  chargeUnits: bigint;
  refundUnits: bigint;
  /** SETTLE-EXPECTED-IDR in ten-thousandths; null without COD totals. */
  expectedUnits: bigint | null;
  latestProviderStatus: string | null;
};

export type OwnerPayoutState = "BELUM_CAIR" | "SUDAH_CAIR" | "PERLU_DICEK" | "RETUR";
export type OwnerMarginBasis = "PROVEN" | "ESTIMATE";

const ZERO = BigInt(0);
const isReturned = (status: ShipmentStatus) => (RTS_STATUSES as readonly string[]).includes(status);

/** Ten-thousandths to whole rupiah, half away from zero — the one rounding a total gets. */
export function unitsToIdr(units: bigint) {
  const half = IDR_UNITS / BigInt(2);
  const magnitude = units < ZERO ? -units : units;
  const whole = (magnitude + half) / IDR_UNITS;
  return Number(units < ZERO ? -whole : whole);
}

const idrUnits = (idr: number) => BigInt(idr) * IDR_UNITS;

/** The Mengantar settlement class of a COD resi (spec 19 SETTLE-CLASS), from exact units. */
function settlementClassOf(row: OwnerMoneyRow) {
  const idr = (units: bigint) => Number(units) / Number(IDR_UNITS);
  const variance = payoutVarianceUnits(row);
  return classifyProviderSettlement({
    chargeIdr: idr(row.chargeUnits),
    isCod: true,
    latestProviderStatus: row.latestProviderStatus,
    refundIdr: idr(row.refundUnits),
    settledIdr: row.settledUnits === null ? null : idr(row.settledUnits),
    varianceIdr: variance === null ? null : idr(variance),
  });
}

/** Returned: our status says so, or Mengantar reported RTS or billed a return without paying out. */
function isReturnedCod(row: OwnerMoneyRow) {
  return isReturned(row.status) || (row.settledUnits === null && settlementClassOf(row) === "RETURN_CHARGE");
}

/** SETTLE-VARIANCE-IDR: cleared payout − expected, in ten-thousandths; null until both exist. */
export function payoutVarianceUnits(row: OwnerMoneyRow) {
  return row.settledUnits !== null && row.expectedUnits !== null ? row.settledUnits - row.expectedUnits : null;
}

/**
 * OWN-MARGIN-IDR for one resi: what the gerai keeps after the customer paid and Mengantar took
 * its share. Proven from a cleared Mengantar invoice when there is one, else estimated:
 * - COD / COD Ongkir paid out: payout + cleared charges − Nilai barang (COD Ongkir: 0).
 * - COD / COD Ongkir returned: the cleared return charges (negative); before one, minus the
 *   shipping Mengantar deducts (fixture: a return is billed at estimatedSpecialPrice).
 * - COD / COD Ongkir otherwise: Estimasi cair − Nilai barang.
 * - Non-COD: the quote price the customer paid − the shipping Mengantar deducts. Always an
 *   estimate: Mengantar bills Non-COD per batch, with no per-resi line to prove it.
 * Refunds (claims for lost or damaged goods) are never margin. Null when a legacy COD row has
 * no stored goods value or no estimate.
 */
export function ownerMarginUnits(row: OwnerMoneyRow): { basis: OwnerMarginBasis; units: bigint } | null {
  if (row.paymentMethod === "NON_COD") {
    return { basis: "ESTIMATE", units: idrUnits(row.shippingAmountIdr - row.chargedShippingIdr) };
  }
  if (row.goodsValueIdr === null) return null;
  const goods = idrUnits(row.goodsValueIdr);
  if (row.settledUnits !== null) return { basis: "PROVEN", units: row.settledUnits + row.chargeUnits - goods };
  if (isReturnedCod(row)) {
    return row.chargeUnits !== ZERO
      ? { basis: "PROVEN", units: row.chargeUnits }
      : { basis: "ESTIMATE", units: -idrUnits(row.chargedShippingIdr) };
  }
  if (row.estimatedPayoutIdr === null) return null;
  return { basis: "ESTIMATE", units: idrUnits(row.estimatedPayoutIdr) - goods };
}

/** The Pencairan state of a COD resi; null for Non-COD, which Mengantar never pays out. */
export function ownerPayoutState(row: OwnerMoneyRow): OwnerPayoutState | null {
  if (row.paymentMethod === "NON_COD") return null;
  const settlementClass = settlementClassOf(row);
  // A paid-out resi with a later charge still needs a look (classifyProviderSettlement), never "cair".
  if (settlementClass === "AMOUNT_MISMATCH" || settlementClass === "REFUND"
    || (row.settledUnits !== null && settlementClass === "RETURN_CHARGE")) return "PERLU_DICEK";
  if (isReturnedCod(row)) return "RETUR";
  return row.settledUnits === null ? "BELUM_CAIR" : "SUDAH_CAIR";
}

export type OwnerMoneySummary = {
  /** OWN-COD-UNSETTLED-*: COD still with the courier or Mengantar. */
  unsettled: { count: number; codIdr: number; estimatedPayoutIdr: number };
  /** OWN-COD-SETTLED-*: cleared Mengantar payouts. */
  settled: { count: number; payoutIdr: number };
  /** OWN-MARGIN-IDR: proven part plus estimated part. */
  margin: { idr: number; provenIdr: number; provenCount: number; estimateCount: number; unknownCount: number };
  returned: { count: number };
  needsReviewCount: number;
  byCourier: { courier: string; count: number; marginIdr: number; provenIdr: number }[];
};

export function summarizeOwnerMoney(rows: readonly OwnerMoneyRow[]): OwnerMoneySummary {
  let unsettledCount = 0, unsettledCod = 0, unsettledPayout = 0;
  let settledCount = 0, settledUnits = ZERO;
  let marginUnits = ZERO, provenUnits = ZERO, provenCount = 0, estimateCount = 0, unknownCount = 0;
  let returnedCount = 0, needsReviewCount = 0;
  const couriers = new Map<string, { count: number; margin: bigint; proven: bigint }>();

  for (const row of rows) {
    const state = ownerPayoutState(row);
    if (state === "BELUM_CAIR") {
      unsettledCount += 1;
      unsettledCod += row.collectIdr ?? 0;
      unsettledPayout += row.estimatedPayoutIdr ?? 0;
    }
    if (row.settledUnits !== null) {
      settledCount += 1;
      settledUnits += row.settledUnits;
    }
    if (state === "RETUR") returnedCount += 1;
    if (state === "PERLU_DICEK") needsReviewCount += 1;

    const courier = couriers.get(row.courier) ?? { count: 0, margin: ZERO, proven: ZERO };
    couriers.set(row.courier, courier);
    courier.count += 1;
    const margin = ownerMarginUnits(row);
    if (margin === null) {
      unknownCount += 1;
      continue;
    }
    marginUnits += margin.units;
    courier.margin += margin.units;
    if (margin.basis === "PROVEN") {
      provenUnits += margin.units;
      courier.proven += margin.units;
      provenCount += 1;
    } else {
      estimateCount += 1;
    }
  }

  return {
    byCourier: [...couriers]
      .map(([courier, value]) => ({ count: value.count, courier, marginIdr: unitsToIdr(value.margin), provenIdr: unitsToIdr(value.proven) }))
      .sort((a, b) => b.marginIdr - a.marginIdr || a.courier.localeCompare(b.courier)),
    margin: { estimateCount, idr: unitsToIdr(marginUnits), provenCount, provenIdr: unitsToIdr(provenUnits), unknownCount },
    needsReviewCount,
    returned: { count: returnedCount },
    settled: { count: settledCount, payoutIdr: unitsToIdr(settledUnits) },
    unsettled: { codIdr: unsettledCod, count: unsettledCount, estimatedPayoutIdr: unsettledPayout },
  };
}

export type OwnerMoneyData = {
  rows: OwnerMoneyRow[];
  /** True when the period holds more than `OWNER_MONEY_ROW_LIMIT` resi; totals then cover the newest. */
  truncated: boolean;
  /** When this outlet scope last pulled from Mengantar (any outcome recorded), or null. */
  lastPullAt: Date | null;
  generatedAt: Date;
};

export async function loadOwnerMoney(
  tx: TenantTransaction,
  context: TenantContext,
  range: Pick<AnalyticsRange, "startInclusive" | "endExclusive">,
  filters: { outletId?: string | null } = {},
): Promise<OwnerMoneyData> {
  if (context.role !== "TENANT_ADMIN") throw new OwnerMoneyDeniedError();
  const outletFilter = filters.outletId ? sql`AND shipment.outlet_id = ${filters.outletId}` : sql``;
  const result = await tx.execute<{
    shipment_id: string;
    public_reference: string;
    cnote_no: string;
    courier: string;
    outlet_name: string;
    status: ShipmentStatus;
    is_cod: boolean;
    cod_shipping_only: boolean;
    resolved_at: string;
    goods_value_idr: number | null;
    provider_cod_amount_idr: number | null;
    shipping_amount_idr: number;
    charged_shipping_idr: number;
    settled_idr: string | null;
    charge_idr: string;
    refund_idr: string;
    latest_provider_status: string | null;
    ledger_shipping_idr: string | null;
    generated_at: string;
  }>(sql`
    WITH cohort AS (
      SELECT shipment.id, shipment.public_reference, shipment.status, shipment.outlet_id, snapshot.cnote_no,
        snapshot.resolved_at, snapshot.is_cod, snapshot.shipping_amount_idr,
        coalesce(snapshot.provider_charged_shipping_idr, snapshot.shipping_amount_idr) AS charged_shipping_idr,
        batch.courier, draft.cod_shipping_only
      FROM provider_order_snapshots snapshot
      JOIN shipments shipment ON shipment.id = snapshot.shipment_id AND shipment.tenant_id = snapshot.tenant_id
      JOIN provider_batches batch ON batch.id = snapshot.batch_id AND batch.tenant_id = snapshot.tenant_id
      JOIN shipment_drafts draft ON draft.shipment_id = shipment.id AND draft.tenant_id = shipment.tenant_id
      WHERE snapshot.tenant_id = ${context.tenantId}
        AND snapshot.status = 'ISSUED' AND snapshot.cnote_no IS NOT NULL
        AND snapshot.resolved_at >= ${range.startInclusive} AND snapshot.resolved_at < ${range.endExclusive}
        AND shipment.status <> 'CANCELLED'
        ${outletFilter}
      ORDER BY snapshot.resolved_at DESC, shipment.id
      LIMIT ${OWNER_MONEY_ROW_LIMIT + 1}
    ), latest_item AS (
      -- Same rule as listProviderSettlementReview: the latest observation of each invoice line wins.
      SELECT DISTINCT ON (item.provider_invoice_id, item.item_type, item.cnote_no) item.*
      FROM provider_settlement_items item
      WHERE item.tenant_id = ${context.tenantId} AND item.shipment_id IN (SELECT id FROM cohort)
      ORDER BY item.provider_invoice_id, item.item_type, item.cnote_no, item.created_at DESC, item.id DESC
    ), settlement AS (
      SELECT item.shipment_id,
        sum(item.amount_idr) FILTER (WHERE item.item_type = 'SETTLEMENT') AS settled_idr,
        coalesce(sum(item.amount_idr) FILTER (WHERE item.item_type = 'CHARGE'), 0) AS charge_idr,
        coalesce(sum(item.amount_idr) FILTER (WHERE item.item_type = 'REFUND'), 0) AS refund_idr
      FROM latest_item item
      WHERE item.invoice_status = ${SETTLED_INVOICE_STATUS}
      GROUP BY item.shipment_id
    ), latest_status AS (
      SELECT DISTINCT ON (observation.shipment_id) observation.shipment_id, observation.provider_status
      FROM provider_order_status_observations observation
      WHERE observation.tenant_id = ${context.tenantId} AND observation.shipment_id IN (SELECT id FROM cohort)
      ORDER BY observation.shipment_id, observation.observed_at DESC, observation.id DESC
    ), ledger_cost AS (
      -- SETTLE-EXPECTED-IDR's shipping: the ledger's MENGANTAR_SHIPPING_COST with its reversals.
      SELECT entry.shipment_id, coalesce(sum(entry.amount_idr) FILTER (WHERE
          entry.entry_type = 'MENGANTAR_SHIPPING_COST'
          OR (entry.entry_type = 'ADJUSTMENT' AND original.entry_type = 'MENGANTAR_SHIPPING_COST')
        ), 0) AS provider_cost_idr
      FROM ledger_entries entry
      LEFT JOIN ledger_entries original ON original.id = entry.reverses_entry_id AND original.tenant_id = entry.tenant_id
      WHERE entry.tenant_id = ${context.tenantId} AND entry.shipment_id IN (SELECT id FROM cohort)
      GROUP BY entry.shipment_id
    )
    SELECT cohort.id AS shipment_id, cohort.public_reference, cohort.cnote_no, cohort.courier,
      outlet.name AS outlet_name, cohort.status, cohort.is_cod, cohort.cod_shipping_only, cohort.resolved_at,
      cod_total.goods_value_idr, cod_total.provider_cod_amount_idr,
      cohort.shipping_amount_idr, cohort.charged_shipping_idr,
      settlement.settled_idr, coalesce(settlement.charge_idr, 0) AS charge_idr,
      coalesce(settlement.refund_idr, 0) AS refund_idr,
      latest_status.provider_status AS latest_provider_status,
      ledger_cost.provider_cost_idr AS ledger_shipping_idr,
      statement_timestamp() AS generated_at
    FROM cohort
    JOIN outlets outlet ON outlet.id = cohort.outlet_id AND outlet.tenant_id = ${context.tenantId}
    LEFT JOIN shipment_cod_totals cod_total ON cod_total.shipment_id = cohort.id AND cod_total.tenant_id = ${context.tenantId}
    LEFT JOIN settlement ON settlement.shipment_id = cohort.id
    LEFT JOIN latest_status ON latest_status.shipment_id = cohort.id
    LEFT JOIN ledger_cost ON ledger_cost.shipment_id = cohort.id
    ORDER BY cohort.resolved_at DESC, cohort.id
  `);

  const units = (value: string | null) => {
    if (value === null) return null;
    const parsed = parseIdrUnits(String(value));
    if (parsed === null) throw new Error("Provider settlement amount is not an exact rupiah value.");
    return parsed;
  };
  const truncated = result.rows.length > OWNER_MONEY_ROW_LIMIT;
  const rows = result.rows.slice(0, OWNER_MONEY_ROW_LIMIT).map((row): OwnerMoneyRow => {
    const paymentMethod: PaymentMethod = !row.is_cod ? "NON_COD" : row.cod_shipping_only ? "COD_ONGKIR" : "COD";
    const collectIdr = paymentMethod === "NON_COD" || row.provider_cod_amount_idr === null ? null : Number(row.provider_cod_amount_idr);
    const chargedShippingIdr = Number(row.charged_shipping_idr);
    return {
      chargeUnits: units(row.charge_idr)!,
      chargedShippingIdr,
      cnoteNo: row.cnote_no,
      collectIdr,
      courier: row.courier,
      // RPT-SHP-COD-DISBURSEMENT-EST-IDR: the same rounded fee as `codDisbursementEstimateExpression`.
      estimatedPayoutIdr: codNetAmountIdr({ chargedShippingIdr, paymentMethod, providerCodAmountIdr: collectIdr }),
      // SETTLE-EXPECTED-IDR; a resi with no ledger shipping yet falls back to the order's own figure.
      expectedUnits: collectIdr === null
        ? null
        : expectedSettlementUnits(BigInt(collectIdr), BigInt(String(row.ledger_shipping_idr ?? chargedShippingIdr))),
      goodsValueIdr: paymentMethod === "NON_COD" ? null : paymentMethod === "COD_ONGKIR" ? 0
        : row.goods_value_idr === null ? null : Number(row.goods_value_idr),
      issuedAt: new Date(row.resolved_at),
      latestProviderStatus: row.latest_provider_status,
      outletName: row.outlet_name,
      paymentMethod,
      publicReference: row.public_reference,
      refundUnits: units(row.refund_idr)!,
      settledUnits: units(row.settled_idr),
      shipmentId: row.shipment_id,
      shippingAmountIdr: Number(row.shipping_amount_idr),
      status: row.status,
    };
  });

  const pulls = await tx.execute<{ last_pull_at: string | null }>(sql`
    SELECT max(pull.created_at) AS last_pull_at FROM provider_settlement_pulls pull
    WHERE pull.tenant_id = ${context.tenantId} ${filters.outletId ? sql`AND pull.outlet_id = ${filters.outletId}` : sql``}
  `);
  const lastPull = pulls.rows[0]?.last_pull_at ?? null;
  return {
    generatedAt: new Date(result.rows[0]?.generated_at ?? Date.now()),
    lastPullAt: lastPull === null ? null : new Date(lastPull),
    rows,
    truncated,
  };
}
