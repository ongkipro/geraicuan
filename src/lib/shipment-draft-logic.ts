// T-208 (UI v3 clean slate): the pure shipment-draft rules that used to live beside the old
// form components. No JSX — server actions, the new UI and tests import these.
import {
  BASIS_POINTS,
  codOngkirBreakEvenIdr,
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

/**
 * D-28 (T-237): the COD Ongkir amount, computed — never typed. The courier collects
 * ongkir + biaya COD (goods value 0; the goods were paid at the gerai): the version 3
 * break-even `ceil(ongkir × 10000 / 9667)` over the shipping Mengantar deducts, so
 * `ongkir + round_half_up(3.33% × amount) + rounding = amount` with rounding ≥ 0.
 * The server records the same figure (`computedCodOngkirChargeIdr`). Null when the
 * service has no usable shipping amount.
 */
export function codOngkirAmount(shippingDeductedIdr: number | null | undefined) {
  if (shippingDeductedIdr === null || shippingDeductedIdr === undefined) return null;
  const chargeIdr = codOngkirBreakEvenIdr(shippingDeductedIdr);
  if (chargeIdr === null) return null;
  const codFeeIdr = mengantarCodFeeIdr(chargeIdr);
  return {
    chargeIdr,
    codFeeIdr,
    roundingIdr: chargeIdr - shippingDeductedIdr - codFeeIdr,
    shippingIdr: shippingDeductedIdr,
  };
}

// ---------------------------------------------------------------------------
// T-211 (PR-70/PR-72): handover type, pickup schedule and product weight in kg.
// Pure and clock-injected so the form, the server validation and tests share one rule.

/** How the parcel reaches the courier. Stored only; not sent to Mengantar until T-153. */
export const HANDOVER_TYPES = ["PICKUP", "DROP_OFF"] as const;
export type HandoverType = (typeof HANDOVER_TYPES)[number];
export const HANDOVER_TYPE_LABELS: Record<HandoverType, string> = {
  DROP_OFF: "Drop di outlet",
  PICKUP: "Penjemputan terjadwal",
};

export function isHandoverType(value: unknown): value is HandoverType {
  return typeof value === "string" && (HANDOVER_TYPES as readonly string[]).includes(value);
}

/**
 * T-232 / PR-90 / D-19: the vehicle a scheduled pickup needs (Mengantar app "Volume").
 * Optional and PICKUP only. Stored and shown; not sent to Mengantar until T-153.
 */
export const PICKUP_VEHICLES = ["MOTOR", "MOBIL", "TRUK"] as const;
export type PickupVehicle = (typeof PICKUP_VEHICLES)[number];
export const PICKUP_VEHICLE_LABELS: Record<PickupVehicle, string> = {
  MOBIL: "Mobil",
  MOTOR: "Motor",
  TRUK: "Truk",
};

export function isPickupVehicle(value: unknown): value is PickupVehicle {
  return typeof value === "string" && (PICKUP_VEHICLES as readonly string[]).includes(value);
}

/**
 * One-hour pickup windows 09.00–18.00 WIB (D-27, following Mengantar `POST /time`), stored by
 * their start ("09:00"): starts 09:00–17:00. The docs list the accepted `time` values as
 * "9:00, 10:00, …, 17:00, 18:00" (api-public.mengantar.com/docs, read 2026-09-26); an
 * 18:00 start would be an 18.00–19.00 window outside 09.00–18.00, so it is not offered (and
 * the 0061 CHECK would refuse it). A draft saved with the D-25 "08:00" start stays valid and
 * is shown as saved (the CHECK still accepts 08); a new selection cannot pick it, and the
 * slot is re-picked when the pickup is sent (T-153).
 */
export const PICKUP_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"] as const;
export type PickupSlot = (typeof PICKUP_SLOTS)[number];
/** A same-day slot must start at least this far ahead. */
export const PICKUP_LEAD_MINUTES = 90;
/** Dates offered: today and the next six days (WIB). */
export const PICKUP_DATE_WINDOW_DAYS = 7;

const WIB_OFFSET_HOURS = 7;

export function isPickupSlot(value: unknown): value is PickupSlot {
  return typeof value === "string" && (PICKUP_SLOTS as readonly string[]).includes(value);
}

/** "09:00" → "09.00–10.00 WIB". */
export function pickupSlotLabel(slot: string) {
  const hour = Number(slot.slice(0, 2));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hour)}.00–${pad(hour + 1)}.00 WIB`;
}

/** The WIB calendar date of an instant, "YYYY-MM-DD". */
export function jakartaDateKey(now: Date) {
  const shifted = new Date(now.getTime() + WIB_OFFSET_HOURS * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The instant a slot starts on a WIB date. */
function slotStart(dateKey: string, slot: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day, Number(slot.slice(0, 2)) - WIB_OFFSET_HOURS, 0);
}

/** Slots still bookable on a date: a same-day slot starts ≥ 90 minutes from now. */
export function availablePickupSlots(dateKey: string, now: Date): PickupSlot[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return [];
  return PICKUP_SLOTS.filter((slot) => slotStart(dateKey, slot) - now.getTime() >= PICKUP_LEAD_MINUTES * 60_000);
}

/** The pickup dates to offer (WIB), today first; today drops out once its last slot has passed. */
export function pickupDateOptions(now: Date) {
  const today = jakartaDateKey(now);
  const format = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "long", timeZone: "UTC", weekday: "long", year: "numeric" });
  return Array.from({ length: PICKUP_DATE_WINDOW_DAYS }, (_, index) => addDays(today, index))
    .filter((dateKey) => availablePickupSlots(dateKey, now).length > 0)
    .map((dateKey) => ({ label: format.format(new Date(`${dateKey}T00:00:00.000Z`)), value: dateKey }));
}

/** "2026-09-30" → "Rabu, 30 Sep 2026". */
export function pickupDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", timeZone: "UTC", weekday: "long", year: "numeric" })
    .format(new Date(`${dateKey}T00:00:00.000Z`));
}

export type PickupScheduleError = "date" | "slot";

/** The one schedule rule: a date inside the window and a slot still bookable on it. */
export function checkPickupSchedule(dateKey: string, slot: string, now: Date): PickupScheduleError | null {
  const today = jakartaDateKey(now);
  // Round-trip: V8 rolls "2026-04-31" over to 1 May, so a parse alone accepts impossible dates.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? new Date(`${dateKey}T00:00:00.000Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateKey
    || dateKey < today || dateKey > addDays(today, PICKUP_DATE_WINDOW_DAYS - 1)) return "date";
  if (!isPickupSlot(slot) || !availablePickupSlots(dateKey, now).includes(slot)) return "slot";
  return null;
}

/**
 * "2", "0,25", "1.5" kg → whole grams as a string, exactly (no float arithmetic); at most three
 * decimals. Anything else is "" so the server's own weight message answers it.
 */
export function kilogramsToGrams(value: string) {
  const match = /^(\d{1,6})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!match) return "";
  const grams = Number(match[1]) * 1_000 + Number((match[2] ?? "").padEnd(3, "0"));
  return grams > 0 ? String(grams) : "";
}

/** Grams → "1,25 kg" for summaries. */
export function gramsToKilogramLabel(grams: number) {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(grams / 1_000)} kg`;
}

/**
 * PR-72: the total weight of the product rows (each row's weight is that row's total), in grams.
 * Rows without a name are unused and ignored; any unreadable weight on a named row gives "".
 */
export function composeProductWeightGrams(rows: readonly (ProductRow & { weightKg: string })[]) {
  const named = rows.filter((row) => row.name.trim() !== "");
  const counted = named.length > 0 ? named : rows;
  const grams = counted.map((row) => kilogramsToGrams(row.weightKg));
  if (grams.length === 0 || grams.some((value) => value === "")) return "";
  return String(grams.reduce((sum, value) => sum + Number(value), 0));
}

/** "Pengirim di label" while masking is off (PR-71): the gerai's name, WhatsApp and pickup address. */
export function geraiSenderIdentity(
  gerai: { name: string; phone: string | null },
  point: { pickupAddressLabel: string } | null,
) {
  return { address: geraiAddress(point), name: gerai.name, phone: gerai.phone ?? "" };
}

/**
 * T-205 → T-211: whether "Konfirmasi & terbitkan AWB" may be pressed, and the one sentence that
 * says why not. The physical-check tick is a client gate on top of the server's own
 * `confirmation=confirmed` requirement; every other refusal stays the server's.
 */
export function issuanceGate(input: {
  codFormulaRetired: boolean;
  codOngkirBlocked: boolean;
  consented: boolean;
  fixtureEnabled: boolean;
  pending: boolean;
  physicalCheck: boolean;
  selected: boolean;
}) {
  const confirmDisabled = input.codFormulaRetired || !input.selected || !input.fixtureEnabled || input.pending || input.codOngkirBlocked;
  const message = input.codFormulaRetired
    ? null
    : !input.fixtureEnabled
      ? "Penerbitan dikunci untuk data ini."
      : !input.selected
        ? "Pilih layanan terlebih dahulu."
        : input.codOngkirBlocked
          ? "Nilai COD Ongkir layanan ini tidak dapat dihitung. Muat ulang tarif."
          : !input.consented
            ? input.physicalCheck
              ? "Centang “Paket sudah dicek fisik” terlebih dahulu."
              : "Centang konfirmasi di atas terlebih dahulu."
            : null;
  return { confirmDisabled, message, submitDisabled: confirmDisabled || !input.consented };
}

/** The option fields the charge lines read (a `ShipmentEstimateOption` satisfies it). */
export type IssuanceChargeOption = {
  codBreakdown: {
    codFeeIdr: number;
    goodsValueIdr: number;
    providerCodAmountIdr: number;
    roundingIdr: number;
    shippingAmountIdr: number;
  } | null;
  insuranceAmountIdr: number | null;
  shippingAmountIdr: number;
  shippingDeductedIdr?: number;
};

export type IssuanceCharges = {
  note: string;
  rows: { label: string; amountIdr: number | null }[];
  total: { label: string; amountIdr: number | null };
};

/**
 * T-211: the "Rincian komponen biaya" lines and the big total of the Buat kiriman rail for one
 * chosen service. COD adds up exactly (goods + ongkir + Mengantar's 3,33% + rounding = total,
 * T-193); COD Ongkir's total is ongkir + biaya COD, computed (D-28); Non-COD's is the ongkir.
 * Null when no service is chosen or a COD service carries no honest breakdown.
 */
export function issuanceCharges(input: {
  declaredValueIdr: number;
  option: IssuanceChargeOption | null;
  paymentMethod: "COD" | "COD_ONGKIR" | "NON_COD";
}): IssuanceCharges | null {
  const { option } = input;
  if (!option) return null;
  if (input.paymentMethod === "COD") {
    const breakdown = option.codBreakdown;
    if (!breakdown) return null;
    return {
      note: "Ditagih kurir ke penerima saat serah terima.",
      rows: [
        { amountIdr: breakdown.goodsValueIdr, label: "Nilai barang" },
        { amountIdr: breakdown.shippingAmountIdr, label: "Ongkir" },
        { amountIdr: breakdown.codFeeIdr, label: `Biaya COD ${MENGANTAR_COD_FEE_RATE_LABEL}` },
        ...(breakdown.roundingIdr > 0 ? [{ amountIdr: breakdown.roundingIdr, label: "Pembulatan" }] : []),
      ],
      total: { amountIdr: breakdown.providerCodAmountIdr, label: "Total tagihan COD" },
    };
  }
  if (input.paymentMethod === "COD_ONGKIR") {
    const amount = codOngkirAmount(option.shippingDeductedIdr);
    return {
      note: "Barang sudah dibayar; kurir menagih ongkir + biaya COD (dihitung otomatis).",
      rows: [
        { amountIdr: input.declaredValueIdr, label: "Nilai barang (sudah dibayar)" },
        { amountIdr: amount?.shippingIdr ?? null, label: "Ongkir dipotong Mengantar" },
        { amountIdr: amount?.codFeeIdr ?? null, label: `Biaya COD ${MENGANTAR_COD_FEE_RATE_LABEL}` },
        ...(amount && amount.roundingIdr > 0 ? [{ amountIdr: amount.roundingIdr, label: "Pembulatan" }] : []),
      ],
      total: { amountIdr: amount?.chargeIdr ?? null, label: "Nilai COD Ongkir" },
    };
  }
  return {
    note: "Kurir tidak menagih apa pun ke penerima.",
    rows: [
      { amountIdr: input.declaredValueIdr, label: "Nilai barang (asuransi)" },
      ...(option.insuranceAmountIdr === null ? [] : [{ amountIdr: option.insuranceAmountIdr, label: "Asuransi" }]),
    ],
    total: { amountIdr: option.shippingAmountIdr, label: "Ongkir layanan" },
  };
}

const MAX_PHONE_LENGTH = 16;
/**
 * Indonesian national significant number: no leading zero, 8-12 digits, so the
 * canonical form is `0` + NSN (10-13 characters). Mobile (`8...`) and landline
 * (`2...`-`7...`, `9...`) both fit; any other shape is not Indonesian.
 */
const INDONESIAN_NSN_PATTERN = /^[2-9]\d{7,11}$/;

/**
 * Every party phone converges on one Indonesian form, `0` + national number.
 * `+62812…`, `62812…`, `0812…` and a bare `812…` are the same subscriber, so
 * they must be stored, deduplicated and sent to the provider identically.
 * A non-Indonesian shape (another country code, a leading `00`, too few or too
 * many digits) is rejected rather than passed through.
 */
export function normalizePartyPhone(value: string) {
  if (!/^[+0-9()\s-]+$/.test(value)) {
    return null;
  }

  const compact = value.replace(/[()\s-]/g, "");
  if (compact.length > MAX_PHONE_LENGTH || compact.includes("+", 1)) {
    return null;
  }
  if (compact.startsWith("+") && !compact.startsWith("+62")) {
    return null;
  }

  const nationalNumber = compact.startsWith("+62")
    ? compact.slice(3)
    : compact.startsWith("62")
      ? compact.slice(2)
      : compact.startsWith("0")
        ? compact.slice(1)
        : compact;
  return INDONESIAN_NSN_PATTERN.test(nationalNumber) ? `0${nationalNumber}` : null;
}
