/**
 * T-186 / PR-64 / D-12: how a shipment is paid.
 *
 * - `NON_COD`: the buyer already paid; the courier collects nothing.
 * - `COD`: the courier collects goods plus shipping, grossed up for Mengantar's
 *   fee (formula version 2), computed and never typed.
 * - `COD_ONGKIR`: the goods were paid outside GeraiCUAN; the courier collects
 *   only a shipping charge the operator may raise above break-even (formula
 *   version 3).
 *
 * Stored as `shipment_drafts.is_cod` plus `shipment_drafts.cod_shipping_only`
 * (migration 0050), so every row written before the method existed, and every
 * writer that does not name it, stays NON_COD or COD exactly as it was.
 *
 * Plain module: the draft form renders these labels client-side.
 */
export const PAYMENT_METHODS = ["NON_COD", "COD", "COD_ONGKIR"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function paymentMethodOf(isCod: boolean, codShippingOnly: boolean): PaymentMethod {
  if (!isCod) return "NON_COD";
  return codShippingOnly ? "COD_ONGKIR" : "COD";
}

/** The operator-facing name, one vocabulary across the form, detail, label and report. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  COD: "COD",
  COD_ONGKIR: "COD Ongkir",
  NON_COD: "Non-COD",
};

/**
 * T-190: the money figure each method is read by, named once. Non-COD shows
 * the declared value the draft form collects for insurance; COD the total the
 * courier collects; COD Ongkir the shipping charge the courier collects —
 * never the goods, which were paid outside GeraiCUAN.
 */
export const PAYMENT_AMOUNT_LABELS: Record<PaymentMethod, string> = {
  COD: "Total COD",
  COD_ONGKIR: "Ongkir ditagih",
  NON_COD: "Nilai asuransi",
};

export type ShipmentPaymentFacts = {
  paymentMethod: PaymentMethod;
  /** `shipment_drafts.declared_value_idr`; `null` where the surface does not load it. */
  declaredValueIdr: number | null;
  /**
   * `provider_order_snapshots.provider_cod_amount_idr`: COD-TOTAL for COD,
   * COD-ONGKIR-CHARGE-IDR for COD Ongkir; `null` before an order exists.
   */
  providerCodAmountIdr: number | null;
};

export type ShipmentPaymentPresentation = {
  /** `null` when the figure is not known yet (no order) or not loaded. */
  amountIdr: number | null;
  amountLabel: string;
  label: string;
  method: PaymentMethod;
};

/** The one mapping every shipment list, lookup and preview renders its payment cell from. */
export function presentShipmentPayment(facts: ShipmentPaymentFacts): ShipmentPaymentPresentation {
  const method = facts.paymentMethod;
  return {
    amountIdr: method === "NON_COD" ? facts.declaredValueIdr : facts.providerCodAmountIdr,
    amountLabel: PAYMENT_AMOUNT_LABELS[method],
    label: PAYMENT_METHOD_LABELS[method],
    method,
  };
}
