// T-208 (UI v3 clean slate): the pure shipment-draft rules that used to live beside the old
// form components. No JSX — server actions, the new UI and tests import these.
import {
  BASIS_POINTS,
  codOngkirBreakEvenIdr,
  codOngkirSellerDifferenceIdr,
  MAX_COD_AMOUNT_IDR,
  MENGANTAR_COD_FEE_BASIS_POINTS,
  mengantarCodFeeIdr,
  shippingMengantarDeductsIdr,
} from "@/lib/mengantar-cod-fee";

/** "3,33%": Mengantar's COD fee rate, read from the one constant the fee helpers use. */
export const MENGANTAR_COD_FEE_RATE_LABEL = `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(
  (MENGANTAR_COD_FEE_BASIS_POINTS / BASIS_POINTS) * 100,
)}%`;

/** T-205: one product line on Buat kiriman — a name and how many of it. */
export type ProductRow = { name: string; quantity: string };

const PRODUCT_PART = /^(.*?\S)(?: \((\d+)\))?$/;

function wholeQuantity(value: string) {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
}

/**
 * T-205: the product rows become the two fields the draft already stores — no new
 * column. `packageContent` lists each named row as "Nama (qty)" (the name alone for one), joined by ", ";
 * `packageQuantity` is the sum of those rows. A blank name is an unused row and is
 * left out of both. Any unreadable quantity sends an empty total, so the server's
 * own "Jumlah paket harus 1–1.000." message answers it rather than a guess.
 */
export function composeProductRows(rows: readonly ProductRow[]) {
  const named = rows.filter((row) => row.name.trim() !== "");
  const counted = named.length > 0 ? named : rows;
  const quantities = counted.map((row) => wholeQuantity(row.quantity));
  return {
    // A quantity of 1 (or none yet) prints the name alone: "Kain batik (2), Daster".
    packageContent: named.map((row) => {
      const quantity = row.quantity.trim();
      return quantity && quantity !== "1" ? `${row.name.trim()} (${quantity})` : row.name.trim();
    }).join(", "),
    packageQuantity: quantities.length > 0 && quantities.every(Number.isSafeInteger)
      ? String(quantities.reduce((sum, quantity) => sum + quantity, 0))
      : "",
  };
}

/**
 * The inverse, for a form the server handed back after a refusal. Only content that
 * recomposes to exactly itself is split; anything else (a name containing ", ", a
 * pre-T-205 free-text content) stays one row, so no typed text is ever lost.
 */
export function parseProductRows(packageContent = "", packageQuantity = ""): ProductRow[] {
  const parts = packageContent.split(", ").map((part) => PRODUCT_PART.exec(part));
  // Split only T-205 text: every part parses and at least one carries an explicit "(n)",
  // so a free-text content such as "Baju, celana" stays one row.
  if (packageContent !== "" && parts.every(Boolean) && parts.some((match) => match![2] !== undefined)) {
    const rows = parts.map((match) => ({ name: match![1], quantity: match![2] ?? "1" }));
    const composed = composeProductRows(rows);
    if (composed.packageContent === packageContent && composed.packageQuantity === packageQuantity) return rows;
  }
  return [{ name: packageContent, quantity: packageQuantity || "1" }];
}

// Mirrors the server's sender-address limit (`src/lib/shipment-draft.ts` MAX_ADDRESS_LENGTH).
const MAX_SENDER_ADDRESS_LENGTH = 500;

/**
 * T-205 "Alamat gerai": the stored pickup label is "pickup name, street, sub-district, district,
 * city, province, zip" (`src/lib/mengantar-locations.ts`). The label prints the address only: the
 * leading name is Mengantar's pickup name, which need not be the gerai's (masking), and the area
 * is already in the label, so nothing is appended.
 */
export function geraiAddress(point: { pickupAddressLabel: string } | null) {
  if (!point) return "";
  const parts = point.pickupAddressLabel.split(",").map((part) => part.trim()).filter(Boolean);
  return (parts.length > 1 ? parts.slice(1) : parts).join(", ").slice(0, MAX_SENDER_ADDRESS_LENGTH);
}

/** "1.250 g · 3 barang" — the package line of the rail. */
export function packageSummaryLabel(weightGrams: string | number, quantity: string | number) {
  const weight = Number(weightGrams);
  const count = Number(quantity);
  const weightText = Number.isSafeInteger(weight) && weight > 0 ? `${new Intl.NumberFormat("id-ID").format(weight)} g` : "— g";
  const countText = Number.isSafeInteger(count) && count > 0 ? `${new Intl.NumberFormat("id-ID").format(count)} barang` : "— barang";
  return `${weightText} · ${countText}`;
}

/** The COD amount a draft would submit; the fee lines come from `codChargeBreakdown` (T-193). */
export type DraftCodBreakdownValue = {
  goodsValueIdr: number;
  providerCodAmountIdr: number;
  shippingAmountIdr: number;
};

/** The provider money facts one estimate row carries (PR-47). */
export type ProviderMoneyFacts = {
  codFeeIdr: number | null;
  discountIdr: number | null;
  normalPriceIdr: number | null;
  shippingAmountIdr: number;
  specialPriceIdr: number | null;
};

export type DraftProviderMoneyLines = {
  /** QUOTE-NORMAL-IDR */
  normalPriceIdr: number;
  /** QUOTE-SPECIAL-IDR; null when the account has no special price here. */
  specialPriceIdr: number | null;
  /**
   * The shipping basis Mengantar actually settles against: `estimatedSpecialPrice`
   * when the account has one, else `estimatedPrice`. Verified against 554/554 real
   * reconciliation invoices (BUILD-LOG T-146): `subItem.amount == COD_AMOUNT -
   * estimatedSpecialPrice`. This is NOT the `price` field COD_AMOUNT was built
   * from (see `cod-totals-repository.ts`) — the two are different provider price
   * scales, which is why they must never be subtracted from each other directly.
   */
  providerChargedShippingIdr: number;
  /**
   * The normal-vs-special shipping spread that stays inside the seller payout
   * (the `price` COD_AMOUNT was built with, minus the settlement basis above).
   */
  shippingSpreadIdr: number;
  /**
   * The fee Mengantar keeps on this COD amount: 3.33% of it, half-up (T-175,
   * `tests/fixtures/mengantar-cod-identities.json`). Null outside COD. The
   * estimate's own `codFee` is not used — it is 0 at every COD value tried.
   */
  mengantarCodFeeIdr: number | null;
  providerDiscountIdr: number | null;
  /**
   * COD-SELLER-PAYOUT-IDR; null outside COD, negative, or when `price` and the
   * settlement basis above look like they describe two different quotes.
   */
  estimatedSellerPayoutIdr: number | null;
};

export const DRAFT_MONEY_METRIC_IDS = {
  normalPrice: "QUOTE-NORMAL-IDR",
  sellerPayout: "COD-SELLER-PAYOUT-IDR",
  specialPrice: "QUOTE-SPECIAL-IDR",
} as const;

// lazy: `price` (which funds codAmountIdr, see cod-totals-repository.ts) and
// estimatedPrice/estimatedSpecialPrice (the settlement basis) normally sit
// within a legitimate discount of each other — the widest ratio across
// tests/fixtures/mengantar-estimate.sandbox.json's real services is SAPLite's
// price:estimatedPrice at 1.43x. SiCepatCargo's entry in that same fixture
// carries a cargo-tier `price` (30 000) against a non-cargo `estimatedPrice`/
// `estimatedSpecialPrice` pair (6 000 / 4 200) — a 5x-plus gap, meaning the two
// fields describe different quotes, not a discount. 2x is a conservative
// ceiling above every legitimate ratio observed; raise it (with new evidence)
// rather than lower it.
const SHIPPING_SCALE_MISMATCH_RATIO = 2;

/**
 * Money lines for one estimate row. COD-SELLER-PAYOUT-IDR is what Mengantar
 * keeps subtracted from what the buyer pays: the COD amount, minus the quoted
 * settlement shipping basis (`estimatedSpecialPrice`, falling back to
 * `estimatedPrice`; `subItem.amount == COD_AMOUNT − estimatedSpecialPrice`,
 * 554/554, BUILD-LOG T-146), minus Mengantar's COD fee of 3.33% of the COD
 * amount. The fee term is T-175's: on a *stored* order the price Mengantar
 * deducts already carries `COD_FEE = 0.0333 × COD_AMOUNT` (100/100), while the
 * estimate quote carries no fee at all (`codFee: 0`), so a payout built from the
 * quote has to subtract it once. With the grossed-up COD amount
 * (`calculateCodAmounts`, formula version 2) the figure is never below goods +
 * shipping − settlement basis.
 *
 * SETTLE-EXPECTED-IDR (Keuangan, `src/db/provider-settlement-repository.ts`)
 * does not carry the fee term yet: it subtracts the ledger's quote-basis
 * shipping cost only. That gap is recorded in `docs/spec/19` and bound by
 * `tests/mengantar-settlement-basis.integration.test.ts`, which asserts the two
 * figures differ by exactly this fee.
 */
export function deriveDraftProviderMoneyLines(
  service: ProviderMoneyFacts,
  codAmountIdr: number | null,
): DraftProviderMoneyLines {
  const normalPriceIdr = service.normalPriceIdr ?? service.shippingAmountIdr;
  const specialPriceIdr = service.specialPriceIdr;
  const providerChargedShippingIdr = shippingMengantarDeductsIdr(service);
  const shippingSpreadIdr = service.shippingAmountIdr - providerChargedShippingIdr;
  const scaleMismatch =
    service.shippingAmountIdr > providerChargedShippingIdr * SHIPPING_SCALE_MISMATCH_RATIO
    || providerChargedShippingIdr > service.shippingAmountIdr * SHIPPING_SCALE_MISMATCH_RATIO;
  const codFeeIdr = codAmountIdr === null ? null : mengantarCodFeeIdr(codAmountIdr);
  const rawPayoutIdr =
    codAmountIdr === null || codFeeIdr === null
      ? null
      : codAmountIdr - providerChargedShippingIdr - codFeeIdr;
  // Guard: never show a negative payout, and never show one built from a
  // shipping basis that does not plausibly share `price`'s scale — the exact
  // SiCepatCargo-style failure this identity replaces.
  const estimatedSellerPayoutIdr =
    rawPayoutIdr === null || rawPayoutIdr < 0 || scaleMismatch ? null : rawPayoutIdr;
  return {
    estimatedSellerPayoutIdr,
    normalPriceIdr,
    mengantarCodFeeIdr: codFeeIdr,
    providerChargedShippingIdr,
    providerDiscountIdr: service.discountIdr,
    shippingSpreadIdr,
    specialPriceIdr,
  };
}

export function formatDraftIdr(value: number) {
  return new Intl.NumberFormat("id-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

/** The confirmation form field that carries the COD Ongkir charge to the server. */
export const COD_ONGKIR_FIELD_NAME = "codShippingChargeIdr";

export const COD_ONGKIR_METRIC_IDS = {
  breakEven: "COD-ONGKIR-BREAK-EVEN-IDR",
  charge: "COD-ONGKIR-CHARGE-IDR",
  mengantarFee: "COD-ONGKIR-MENGANTAR-FEE-IDR",
  sellerDifference: "COD-ONGKIR-SELLER-DIFFERENCE-IDR",
  shippingDeducted: "COD-ONGKIR-SHIPPING-DEDUCTED-IDR",
} as const;

/** Whole rupiah as typed by an operator: `25000` or `25.000`. */
export function parseRupiahInput(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed) && !/^\d{1,3}(?:\.\d{3})+$/.test(trimmed)) return null;
  const amount = Number(trimmed.replace(/\./g, ""));
  return Number.isSafeInteger(amount) ? amount : null;
}

export type CodOngkirChargeState =
  | { kind: "valid"; chargeIdr: number; sellerDifferenceIdr: number; mengantarCodFeeIdr: number }
  | { kind: "invalid"; message: string };

/**
 * The one rule the COD Ongkir field applies as the operator types, and the
 * message it shows. `calculateCodOngkirAmounts` and the database apply the
 * same break-even; this only decides what the screen says.
 */
export function evaluateCodOngkirCharge(
  input: string,
  shippingDeductedIdr: number,
): CodOngkirChargeState {
  const breakEvenIdr = codOngkirBreakEvenIdr(shippingDeductedIdr);
  if (breakEvenIdr === null) {
    return { kind: "invalid", message: "Ongkir layanan ini tidak dapat dipakai untuk COD Ongkir." };
  }
  const charge = parseRupiahInput(input);
  if (charge === null || charge > MAX_COD_AMOUNT_IDR) {
    return {
      kind: "invalid",
      message: `Isi ongkir dalam rupiah bulat tanpa desimal, minimal ${formatDraftIdr(breakEvenIdr)}.`,
    };
  }
  if (charge < breakEvenIdr) {
    return {
      kind: "invalid",
      message: `Ongkir tidak boleh di bawah titik impas ${formatDraftIdr(breakEvenIdr)}. ${formatDraftIdr(charge)} kurang ${formatDraftIdr(breakEvenIdr - charge)} dan membuat penjual rugi.`,
    };
  }
  return {
    chargeIdr: charge,
    kind: "valid",
    mengantarCodFeeIdr: mengantarCodFeeIdr(charge),
    sellerDifferenceIdr: codOngkirSellerDifferenceIdr(charge, shippingDeductedIdr),
  };
}
