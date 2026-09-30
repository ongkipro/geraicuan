import { codChargeBreakdown, mengantarCodFeeIdr, type CodChargeBreakdown } from "@/lib/mengantar-cod-fee";
import type { PaymentMethod } from "@/lib/payment-method";

/**
 * T-261 "Rincian uang": the one per-shipment money breakdown every screen quotes (shipment
 * detail, label page panel, Laporan row). Pure and plain (no `server-only`): each surface's
 * loader supplies the stored facts and renders `MoneyBreakdown` from the result, so the same
 * shipment shows the same numbers under the same labels everywhere. No formula lives here that
 * spec 19 does not already define; every line carries its metric ID.
 */

/** Spec 19 IDs, one per rendered line (`data-metric-id`). */
export const MONEY_METRIC_IDS = {
  codTotal: "COD-TOTAL",
  codOngkirCharge: "COD-ONGKIR-CHARGE-IDR",
  chargeBreakdown: "COD-CHARGE-BREAKDOWN",
  codFeeCharged: "COD-MENGANTAR-FEE",
  shippingCost: "RPT-SHP-SHIPPING-COST-IDR",
  codFee: "RPT-SHP-COD-FEE-IDR",
  disbursementEstimate: "RPT-SHP-COD-DISBURSEMENT-EST-IDR",
  declaredValue: "SHP-DECLARED-VALUE-IDR",
  insurance: "SHP-INSURANCE-IDR",
  paymentMode: "RPT-SHP-PAYMENT-MODE",
} as const;

/** The one label per concept (spec 17 §T-261, spec 10 §4.15). */
export const MONEY_LABELS = {
  collect: "Ditagih ke penerima",
  noCollect: "Tidak ada tagihan ke penerima",
  goods: "Nilai barang",
  chargedShipping: "Ongkir Mengantar",
  codFee: "Biaya COD (termasuk PPN)",
  rounding: "Pembulatan",
  shippingCost: "Biaya kirim Mengantar",
  estimate: "Estimasi cair",
  insurance: "Asuransi Mengantar",
} as const;

/**
 * The stored COD totals row (`shipment_cod_totals`) as a surface reads it; `null` when the
 * shipment has none. `providerCodAmountIdr` there is canonical (spec 19, T-199).
 */
export type StoredCodTotals = {
  goodsValueIdr: number | null;
  shippingAmountIdr: number | null;
  providerCodAmountIdr: number | null;
};

/**
 * The COD charge breakdown a label may print, and whether the order and the stored totals tell
 * one story. The label repository (`loadPrintableLabel`) and the shipment detail both use this,
 * so "tidak konsisten" means the same thing on both.
 *
 * - COD: the breakdown exists only when the order's amount equals the stored total and the lines
 *   add up (`codChargeBreakdown`, null for a version 1 amount); otherwise inconsistent.
 * - COD Ongkir: never a goods breakdown (the goods were paid outside GeraiCUAN); inconsistent only
 *   when the order's amount differs from the stored charge.
 * - Non-COD, or no order yet: nothing to be inconsistent about.
 */
export function storedCodCharge(input: {
  paymentMethod: PaymentMethod;
  providerCodAmountIdr: number | null;
  codTotals: StoredCodTotals | null;
}): { breakdown: CodChargeBreakdown | null; consistent: boolean } {
  const { codTotals, paymentMethod, providerCodAmountIdr } = input;
  if (paymentMethod === "NON_COD" || providerCodAmountIdr === null) return { breakdown: null, consistent: true };
  const matches = codTotals !== null && codTotals.providerCodAmountIdr === providerCodAmountIdr;
  if (paymentMethod === "COD_ONGKIR") return { breakdown: null, consistent: matches };
  const breakdown = matches && codTotals.goodsValueIdr !== null && codTotals.shippingAmountIdr !== null
    ? codChargeBreakdown({
        goodsValueIdr: codTotals.goodsValueIdr,
        shippingAmountIdr: codTotals.shippingAmountIdr,
        providerCodAmountIdr,
      })
    : null;
  return { breakdown, consistent: breakdown !== null };
}

/**
 * "Estimasi cair" of a COD or COD Ongkir order (T-213, formerly "Jumlah bersih"): the amount the
 * courier collects, less the shipping Mengantar deducts at settlement and its 3.33% COD fee —
 * RPT-SHP-COD-DISBURSEMENT-EST-IDR per shipment. Null outside COD, before an order exists, on
 * legacy snapshots without the deducted shipping, or when it would be negative.
 */
export function codNetAmountIdr(input: {
  chargedShippingIdr: number | null;
  paymentMethod: PaymentMethod;
  providerCodAmountIdr: number | null;
}) {
  if (input.paymentMethod === "NON_COD" || input.providerCodAmountIdr === null || input.chargedShippingIdr === null) {
    return null;
  }
  const net = input.providerCodAmountIdr - input.chargedShippingIdr - mengantarCodFeeIdr(input.providerCodAmountIdr);
  return net < 0 ? null : net;
}

export type ShipmentMoneyFacts = {
  paymentMethod: PaymentMethod;
  /** `shipment_drafts.declared_value_idr`. */
  declaredValueIdr: number;
  /** `provider_order_snapshots.provider_cod_amount_idr`; null for Non-COD and before an order. */
  providerCodAmountIdr: number | null;
  /** `provider_order_snapshots.shipping_amount_idr` (the quote's `price`); null before an order. */
  shippingAmountIdr: number | null;
  /** `provider_order_snapshots.provider_charged_shipping_idr`: what Mengantar deducts. */
  chargedShippingIdr: number | null;
  /** `provider_order_snapshots.insurance_amount_idr`. */
  insuranceAmountIdr: number | null;
  /** From `storedCodCharge`. */
  codCharge: CodChargeBreakdown | null;
  codConsistent: boolean;
};

export type MoneyLine = {
  key: string;
  label: string;
  metricId: string;
  /** Null renders "—" (unknown), never Rp 0. */
  amountIdr: number | null;
  /** A deduction renders with an explicit minus. */
  sign?: "minus";
  note?: string;
};

export type ShipmentMoney =
  | { kind: "pending"; method: PaymentMethod; info: MoneyLine[] }
  | { kind: "inconsistent"; method: "COD" | "COD_ONGKIR"; collect: MoneyLine }
  | {
      kind: "ready";
      method: PaymentMethod;
      /** Ditagih ke penerima (null amount + note for Non-COD). */
      collect: MoneyLine;
      /** What the collected amount is made of (COD only). */
      collectParts: MoneyLine[];
      /** Informational lines outside the arithmetic (goods paid elsewhere, declared value, insurance). */
      info: MoneyLine[];
      /** What Mengantar keeps (COD methods) or is paid (Non-COD). */
      deductions: MoneyLine[];
      /** Estimasi cair; null for Non-COD. */
      estimate: MoneyLine | null;
    };

/**
 * RPT-SHP-SHIPPING-COST-IDR, "Biaya kirim Mengantar": the shipping Mengantar deducts (charged),
 * else the order's own price (legacy snapshots). The Rincian uang panel and the thermal sheet's
 * Non-COD line both read it here (T-263), so the sheet never prints the list price under it.
 */
export function shippingCostIdr<Price extends number | null>(facts: { chargedShippingIdr: number | null; shippingAmountIdr: Price }): number | Price {
  return facts.chargedShippingIdr ?? facts.shippingAmountIdr;
}

/** One authority for every per-shipment money line (spec 19 §Rincian uang, T-261). */
export function shipmentMoney(facts: ShipmentMoneyFacts): ShipmentMoney {
  const method = facts.paymentMethod;
  const cod = method !== "NON_COD";
  const ids = MONEY_METRIC_IDS;
  const goodsNote = method === "NON_COD" ? "Untuk asuransi, tidak ditagih" : method === "COD_ONGKIR" ? "Sudah dibayar, tidak ditagih" : undefined;
  const goods: MoneyLine = { amountIdr: facts.declaredValueIdr, key: "goods", label: MONEY_LABELS.goods, metricId: ids.declaredValue, note: goodsNote };
  if (facts.shippingAmountIdr === null || (cod && facts.providerCodAmountIdr === null)) return { info: [goods], kind: "pending", method };

  const collect: MoneyLine = cod
    ? {
        amountIdr: facts.providerCodAmountIdr,
        key: "collect",
        label: MONEY_LABELS.collect,
        metricId: method === "COD" ? ids.codTotal : ids.codOngkirCharge,
        note: method === "COD_ONGKIR" ? "Ongkir + biaya COD saja" : undefined,
      }
    : { amountIdr: 0, key: "collect", label: MONEY_LABELS.collect, metricId: ids.paymentMode, note: MONEY_LABELS.noCollect };

  if (cod && !facts.codConsistent) return { collect, kind: "inconsistent", method: method as "COD" | "COD_ONGKIR" };

  const shippingCost = shippingCostIdr(facts);
  const insurance: MoneyLine[] = facts.insuranceAmountIdr
    ? [{ amountIdr: facts.insuranceAmountIdr, key: "insurance", label: MONEY_LABELS.insurance, metricId: ids.insurance }]
    : [];

  if (!cod) {
    return {
      collect,
      collectParts: [],
      deductions: [{ amountIdr: shippingCost, key: "shipping-cost", label: MONEY_LABELS.shippingCost, metricId: ids.shippingCost }],
      estimate: null,
      info: [goods, ...insurance],
      kind: "ready",
      method,
    };
  }

  const codAmount = facts.providerCodAmountIdr as number;
  const fee = mengantarCodFeeIdr(codAmount);
  const charge = facts.codCharge;
  const collectParts: MoneyLine[] = method === "COD" && charge
    ? [
        { amountIdr: charge.goodsValueIdr, key: "part-goods", label: MONEY_LABELS.goods, metricId: ids.chargeBreakdown },
        { amountIdr: charge.shippingAmountIdr, key: "part-shipping", label: MONEY_LABELS.chargedShipping, metricId: ids.chargeBreakdown },
        { amountIdr: charge.codFeeIdr, key: "part-fee", label: MONEY_LABELS.codFee, metricId: ids.codFeeCharged },
        ...(charge.roundingIdr > 0
          ? [{ amountIdr: charge.roundingIdr, key: "part-rounding", label: MONEY_LABELS.rounding, metricId: ids.chargeBreakdown }]
          : []),
      ]
    : [];
  return {
    collect,
    collectParts,
    deductions: [
      { amountIdr: shippingCost, key: "shipping-cost", label: MONEY_LABELS.shippingCost, metricId: ids.shippingCost, sign: "minus" },
      { amountIdr: fee, key: "cod-fee", label: MONEY_LABELS.codFee, metricId: ids.codFee, sign: "minus" },
    ],
    estimate: {
      amountIdr: codNetAmountIdr({ chargedShippingIdr: facts.chargedShippingIdr, paymentMethod: method, providerCodAmountIdr: codAmount }),
      key: "estimate",
      label: MONEY_LABELS.estimate,
      metricId: ids.disbursementEstimate,
      note: "Perkiraan, bukan dana diterima",
    },
    // COD's goods are already a part of the charge above; COD Ongkir's were paid elsewhere.
    info: method === "COD_ONGKIR" ? [goods, ...insurance] : insurance,
    kind: "ready",
    method,
  };
}

/**
 * The label page's facts (`loadPrintableLabel`). The repository already refuses a COD Ongkir
 * label whose order and stored charge differ, so only a COD label without its breakdown is
 * inconsistent — the predicate the page's warning always used, now also false for COD Ongkir,
 * whose sheet never prints a breakdown.
 */
export function labelMoneyFacts(label: {
  chargedShippingIdr: number | null;
  codBreakdown: CodChargeBreakdown | null;
  insuranceAmountIdr: number | null;
  package: { declaredValueIdr: number };
  paymentMethod: PaymentMethod;
  providerCodAmountIdr: number | null;
  shippingAmountIdr: number;
}): ShipmentMoneyFacts {
  return {
    chargedShippingIdr: label.chargedShippingIdr,
    codCharge: label.codBreakdown,
    codConsistent: label.paymentMethod !== "COD" || label.codBreakdown !== null,
    declaredValueIdr: label.package.declaredValueIdr,
    insuranceAmountIdr: label.insuranceAmountIdr,
    paymentMethod: label.paymentMethod,
    providerCodAmountIdr: label.providerCodAmountIdr,
    shippingAmountIdr: label.shippingAmountIdr,
  };
}

/**
 * Laporan's row money cell (compact): RPT-SHP-SHIPPING-COST-IDR and, for an issued COD order,
 * RPT-SHP-COD-FEE-IDR — the report row's own fields, under the column "Biaya Mengantar".
 */
export function reportRowMoneyLines(row: { codFeeIdr: number | null; shippingCostIdr: number | null }): MoneyLine[] {
  // No provider order yet: no figure at all (the cell reads "—").
  if (row.shippingCostIdr === null) return [];
  return [
    { amountIdr: row.shippingCostIdr, key: "shipping-cost", label: "Biaya kirim", metricId: MONEY_METRIC_IDS.shippingCost },
    ...(row.codFeeIdr !== null
      ? [{ amountIdr: row.codFeeIdr, key: "cod-fee", label: "Biaya COD", metricId: MONEY_METRIC_IDS.codFee }]
      : []),
  ];
}
