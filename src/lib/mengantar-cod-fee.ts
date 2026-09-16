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

/** The fee Mengantar keeps on a COD amount, half-up to a whole rupiah (M-0). */
export function mengantarCodFeeIdr(codAmountIdr: number) {
  const cod = BigInt(codAmountIdr);
  return Number(
    (cod * BigInt(MENGANTAR_COD_FEE_BASIS_POINTS) + BigInt(BASIS_POINTS / 2)) /
      BigInt(BASIS_POINTS),
  );
}
