/**
 * Mengantar's COD fee, as observed on stored orders rather than read from a
 * document (T-175): `COD_FEE = COD_AMOUNT × 0.0333` exactly and unrounded on
 * 100/100 real COD orders — a 3% fee plus 11% VAT on that fee — and the stored
 * `estimatedPrice = price + COD_FEE` on the same 100/100
 * (`tests/fixtures/mengantar-cod-identities.json`). `GET /order/estimate`
 * returns `codFee: 0` at every COD value tried, so the quote never shows it.
 *
 * Plain module (no `server-only`): the draft preview renders it client-side and
 * the COD amount formula in `src/db/cod-totals-repository.ts` grosses up by it.
 */
export const MENGANTAR_COD_FEE_BASIS_POINTS = 333;
export const BASIS_POINTS = 10_000;

/**
 * The fee Mengantar keeps on a COD amount, half-up to a whole rupiah (M-0).
 * T-193: the one "Biaya COD" every surface shows and the amount a COD issuance
 * books as `MENGANTAR_COD_FEE_COST`.
 */
export function mengantarCodFeeIdr(codAmountIdr: number) {
  const cod = BigInt(codAmountIdr);
  return Number(
    (cod * BigInt(MENGANTAR_COD_FEE_BASIS_POINTS) + BigInt(BASIS_POINTS / 2)) /
      BigInt(BASIS_POINTS),
  );
}

/**
 * T-193: the VAT already inside Mengantar's fee. 3.33% is a 3% fee plus 11% VAT
 * on that fee, so the VAT share of a whole-rupiah fee is `fee × 11 / 111`,
 * half-up. Informational only ("termasuk PPN"): it is part of the fee Mengantar
 * keeps, never added on top of it and never GeraiCUAN's liability. `fee × 22`
 * is even and an odd multiple of 111 is odd, so the rounding has no tie.
 */
export function vatIncludedInMengantarCodFeeIdr(feeIdr: number) {
  return Number(
    (BigInt(feeIdr) * BigInt(22) + BigInt(111)) / BigInt(222),
  );
}

/**
 * T-193: one "Biaya COD" for a full-COD amount, split so the lines a buyer sees
 * add up to what the courier collects:
 * `goods + shipping + codFee + rounding = COD`, where `codFee` is
 * `mengantarCodFeeIdr(COD)` and `rounding` is what the round-up of COD to a whole
 * rupiah leaves over (0 or 1 for a formula version 2 amount). Null when COD is
 * below goods + shipping + fee — a pre-T-175 version 1 amount — because no
 * honest set of lines adds up there.
 */
export function codChargeBreakdown(input: {
  goodsValueIdr: number;
  shippingAmountIdr: number;
  providerCodAmountIdr: number;
}) {
  const codFeeIdr = mengantarCodFeeIdr(input.providerCodAmountIdr);
  const roundingIdr =
    input.providerCodAmountIdr - input.goodsValueIdr - input.shippingAmountIdr - codFeeIdr;
  if (roundingIdr < 0) return null;
  return {
    goodsValueIdr: input.goodsValueIdr,
    shippingAmountIdr: input.shippingAmountIdr,
    codFeeIdr,
    codFeeVatIncludedIdr: vatIncludedInMengantarCodFeeIdr(codFeeIdr),
    roundingIdr,
    providerCodAmountIdr: input.providerCodAmountIdr,
  };
}

/**
 * T-193: how a historical COD_SERVICE_FEE_VAT_PAYABLE row is presented. Those
 * rows were booked as GeraiCUAN's VAT liability until T-193, but the VAT is
 * inside the fee Mengantar keeps; they stay in the ledger (append-only) and are
 * shown as part of that fee, outside any payable total.
 */
/**
 * T-193: a COD amount recorded under the pre-T-175 formula. Nothing was sent to
 * Mengantar; the recorded amount cannot be replaced, so the way forward is a new
 * shipment estimated under the current formula. Shown by the confirmation
 * refusal and, since T-199, up front on the shipment detail.
 */
export const COD_FORMULA_RETIRED_MESSAGE =
  "Nilai COD kiriman ini dihitung dengan rumus lama, sehingga dana yang cair ke penjual akan kurang. Kiriman belum dikirim ke Mengantar dan tidak dapat dikonfirmasi: buat kiriman baru dengan data yang sama, lalu estimasi ulang.";

export const LEGACY_COD_FEE_VAT_LABEL = "PPN dalam biaya COD (dipotong Mengantar)";
export const LEGACY_COD_FEE_VAT_NOTE =
  "Entri lama. PPN ini sudah termasuk dalam biaya COD 3,33% yang dipotong Mengantar, bukan kewajiban GeraiCUAN, dan tidak dihitung sebagai utang.";

export type CodChargeBreakdown = NonNullable<ReturnType<typeof codChargeBreakdown>>;

/**
 * The shipping Mengantar deducts at settlement: the quote's special price when
 * the account has one, else its normal price, else the `price` the estimate
 * stored (T-146, 554/554 invoices). The same COALESCE order
 * `provider_order_snapshots.provider_charged_shipping_idr` records.
 */
export function shippingMengantarDeductsIdr(service: {
  normalPriceIdr: number | null;
  shippingAmountIdr: number;
  specialPriceIdr: number | null;
}) {
  return service.specialPriceIdr ?? service.normalPriceIdr ?? service.shippingAmountIdr;
}

/** A COD amount is a positive Postgres `integer`. */
export const MAX_COD_AMOUNT_IDR = 2_147_483_647;

/**
 * T-186 / D-12 COD Ongkir break-even: the smallest whole rupiah `C ≥ 1` with
 * `C × (10000 − 333) ≥ shippingDeducted × 10000`, i.e.
 * `ceil(shippingDeducted × 10000 / 9667)`. At that charge what Mengantar keeps
 * — the shipping it deducts plus 3.33% of the charge — never exceeds what the
 * buyer paid. `shipment_cod_totals_cod_ongkir_break_even_v3` is the same rule
 * in the database. Null when the shipping is not a non-negative safe integer
 * or the break-even would not fit the column.
 */
export function codOngkirBreakEvenIdr(shippingDeductedIdr: number) {
  if (!Number.isSafeInteger(shippingDeductedIdr) || shippingDeductedIdr < 0) return null;
  const net = BigInt(BASIS_POINTS - MENGANTAR_COD_FEE_BASIS_POINTS);
  const breakEven =
    (BigInt(shippingDeductedIdr) * BigInt(BASIS_POINTS) + net - BigInt(1)) / net;
  const charge = breakEven < BigInt(1) ? BigInt(1) : breakEven;
  return charge > BigInt(MAX_COD_AMOUNT_IDR) ? null : Number(charge);
}

/**
 * What the seller keeps of a COD Ongkir charge after settlement:
 * `charge − shipping Mengantar deducts − round_half_up(0.0333 × charge)`.
 * Never negative for any charge at or above `codOngkirBreakEvenIdr`.
 */
export function codOngkirSellerDifferenceIdr(chargeIdr: number, shippingDeductedIdr: number) {
  return chargeIdr - shippingDeductedIdr - mengantarCodFeeIdr(chargeIdr);
}
