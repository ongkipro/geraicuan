import { codChargeBreakdown, codOngkirBreakEvenIdr, mengantarCodFeeIdr, type CodChargeBreakdown } from "@/lib/mengantar-cod-fee";
import type { membershipRoles } from "@/lib/domain-enums";
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
  codOngkirChargeBreakdown: "COD-ONGKIR-CHARGE-BREAKDOWN",
  customerOngkir: "CUSTOMER-ONGKIR-IDR",
  shippingCost: "RPT-SHP-SHIPPING-COST-IDR",
  codFee: "RPT-SHP-COD-FEE-IDR",
  disbursementEstimate: "RPT-SHP-COD-DISBURSEMENT-EST-IDR",
  declaredValue: "SHP-DECLARED-VALUE-IDR",
  insurance: "SHP-INSURANCE-IDR",
  paymentMode: "RPT-SHP-PAYMENT-MODE",
} as const;

/**
 * The one label per quantity (spec 17 §T-261, spec 10 §4.15, spec 19 §Rincian uang term table).
 * T-269: the thermal sheet, the Buat kiriman rail, Cek resi and Laporan read these too.
 */
import { MONEY_LABELS } from "@/lib/money-labels";

export { MONEY_LABELS };

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
 * - COD Ongkir: never a goods breakdown (the goods were paid outside GeraiCuan); inconsistent only
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
 * RPT-SHP-SHIPPING-COST-IDR, "Ongkir dibayar ke Mengantar" (T-265; was "Biaya kirim Mengantar"): the shipping Mengantar deducts (charged),
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
  const collectParts = chargeParts(method, codAmount, facts);
  return {
    collect,
    collectParts,
    deductions: [
      // T-269: the fee is a part of the charge above and all of it goes to Mengantar, so it is
      // listed here again as a deduction, named as the same line — the settlement section reads
      // Ditagih ke penerima − these two = Estimasi cair.
      {
        amountIdr: fee,
        key: "cod-fee",
        label: MONEY_LABELS.codFee,
        metricId: ids.codFee,
        note: collectParts.length > 0 ? "Bagian tagihan di atas, seluruhnya untuk Mengantar" : undefined,
        sign: "minus",
      },
      { amountIdr: shippingCost, key: "shipping-cost", label: MONEY_LABELS.shippingCost, metricId: ids.shippingCost, sign: "minus" },
    ],
    estimate: {
      amountIdr: codNetAmountIdr({ chargedShippingIdr: facts.chargedShippingIdr, paymentMethod: method, providerCodAmountIdr: codAmount }),
      key: "estimate",
      label: MONEY_LABELS.estimate,
      metricId: ids.disbursementEstimate,
      note: "Ditagih ke penerima dikurangi potongan Mengantar. Perkiraan, bukan dana diterima",
    },
    // COD's goods are already a part of the charge above; COD Ongkir's were paid elsewhere.
    info: method === "COD_ONGKIR" ? [goods, ...insurance] : insurance,
    kind: "ready",
    method,
  };
}

/**
 * T-269 (critique 2026-09-30 P1): what "Ditagih ke penerima" is made of, so its children add up to
 * it on screen. Every part is an existing quantity; nothing here is a new formula.
 *
 * - COD: COD-CHARGE-BREAKDOWN — Nilai barang + Ongkir ditagih ke penerima + Biaya COD (termasuk
 *   PPN) + Pembulatan (only when ≠ 0) = COD-TOTAL (`codChargeBreakdown`). Empty without a breakdown
 *   (the inconsistent state never reaches here).
 * - COD Ongkir: COD-ONGKIR-CHARGE-BREAKDOWN — Ongkir ditagih ke penerima + Biaya COD + Pembulatan =
 *   COD-ONGKIR-CHARGE-IDR. At the D-28 computed charge the shipping is COD-ONGKIR-SHIPPING-DEDUCTED-IDR
 *   (the order's `provider_charged_shipping_idr`) and the rounding is COD-ONGKIR-SELLER-DIFFERENCE-IDR
 *   (0 or 1, as Buat kiriman showed it). A charge raised before D-28, or one whose basis is unknown,
 *   has no rounding line: the shipping part is the charge less the fee.
 */
function chargeParts(method: PaymentMethod, codAmount: number, facts: ShipmentMoneyFacts): MoneyLine[] {
  const ids = MONEY_METRIC_IDS;
  const part = (key: string, label: string, amountIdr: number, metricId: string): MoneyLine => ({ amountIdr, key, label, metricId });
  if (method === "COD") {
    const charge = facts.codCharge;
    if (!charge) return [];
    return [
      part("part-goods", MONEY_LABELS.goods, charge.goodsValueIdr, ids.chargeBreakdown),
      part("part-shipping", MONEY_LABELS.chargedShipping, charge.shippingAmountIdr, ids.chargeBreakdown),
      part("part-cod-fee", MONEY_LABELS.codFee, charge.codFeeIdr, ids.chargeBreakdown),
      ...(charge.roundingIdr !== 0 ? [part("part-rounding", MONEY_LABELS.rounding, charge.roundingIdr, ids.chargeBreakdown)] : []),
    ];
  }
  if (method !== "COD_ONGKIR") return [];
  const fee = mengantarCodFeeIdr(codAmount);
  const basis = facts.chargedShippingIdr;
  const computed = basis !== null && codOngkirBreakEvenIdr(basis) === codAmount;
  const shipping = computed ? basis : codAmount - fee;
  const rounding = codAmount - shipping - fee;
  return [
    part("part-shipping", MONEY_LABELS.chargedShipping, shipping, ids.codOngkirChargeBreakdown),
    part("part-cod-fee", MONEY_LABELS.codFee, fee, ids.codOngkirChargeBreakdown),
    ...(rounding !== 0 ? [part("part-rounding", MONEY_LABELS.rounding, rounding, ids.codOngkirChargeBreakdown)] : []),
  ];
}

/**
 * T-270 (owner 2026-10-01): the customer-facing split of what is collected — Nilai barang + Ongkir,
 * where Ongkir (CUSTOMER-ONGKIR-IDR) = the amount collected − Nilai barang in it. COD: COD-TOTAL −
 * the breakdown's goods; COD Ongkir: the whole charge (the goods were paid elsewhere). Biaya COD and
 * Pembulatan are inside Ongkir and never shown apart. A presentation of stored quantities only; null
 * for Non-COD, before an order, and for a COD amount without its breakdown (nothing to split).
 */
export function customerCollectBreakdown(input: {
  paymentMethod: PaymentMethod;
  providerCodAmountIdr: number | null;
  codCharge: Pick<CodChargeBreakdown, "goodsValueIdr"> | null;
}): { goodsValueIdr: number | null; ongkirIdr: number } | null {
  if (input.providerCodAmountIdr === null) return null;
  if (input.paymentMethod === "COD_ONGKIR") return { goodsValueIdr: null, ongkirIdr: input.providerCodAmountIdr };
  if (input.paymentMethod !== "COD" || !input.codCharge) return null;
  return { goodsValueIdr: input.codCharge.goodsValueIdr, ongkirIdr: input.providerCodAmountIdr - input.codCharge.goodsValueIdr };
}

/**
 * T-269 (owner decision 2026-09-30): role-based money visibility, decided on the server before
 * anything renders, so an Operator's HTML and RSC payload never carry the withheld amounts.
 *
 * T-270 (owner 2026-10-01: "biaya potongan ini jangan dijadikan acuan ke customer, itu keuntungan
 * pribadi kita atau admin gerai"): an Operator sees the customer-facing view — Ditagih ke penerima
 * split into Nilai barang + Ongkir (`customerCollectBreakdown`), still summing to it — and never
 * Biaya COD, Pembulatan, the settlement deductions or Estimasi cair. The Tenant Admin sees all.
 */
export function moneyForRole(money: ShipmentMoney, role: (typeof membershipRoles)[number]): ShipmentMoney {
  if (role === "TENANT_ADMIN" || money.kind !== "ready") return money;
  const goodsPart = money.collectParts.find((part) => part.key === "part-goods");
  const split = customerCollectBreakdown({
    codCharge: goodsPart?.amountIdr != null ? { goodsValueIdr: goodsPart.amountIdr } : null,
    paymentMethod: money.method,
    providerCodAmountIdr: money.method === "NON_COD" ? null : money.collect.amountIdr,
  });
  const collectParts: MoneyLine[] = split === null ? [] : [
    ...(split.goodsValueIdr === null ? [] : [{ ...goodsPart!, amountIdr: split.goodsValueIdr }]),
    { amountIdr: split.ongkirIdr, key: "part-customer-ongkir", label: MONEY_LABELS.customerOngkir, metricId: MONEY_METRIC_IDS.customerOngkir },
  ];
  const collect = money.method === "COD_ONGKIR" ? { ...money.collect, note: "Ongkir saja, barang sudah dibayar" } : money.collect;
  return { ...money, collect, collectParts, deductions: [], estimate: null };
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
  shippingAmountIdr: number | null;
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
    { amountIdr: row.shippingCostIdr, key: "shipping-cost", label: MONEY_LABELS.shippingCost, metricId: MONEY_METRIC_IDS.shippingCost },
    ...(row.codFeeIdr !== null
      ? [{ amountIdr: row.codFeeIdr, key: "cod-fee", label: MONEY_LABELS.codFee, metricId: MONEY_METRIC_IDS.codFee }]
      : []),
  ];
}
