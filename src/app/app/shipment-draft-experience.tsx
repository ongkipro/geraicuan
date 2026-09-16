import type { ShipmentContactSelection } from "@/app/app/actions";
import { mengantarCodFeeIdr } from "@/lib/mengantar-cod-fee";

type ContactSearchKeyEvent = {
  isComposing: boolean;
  key: string;
  preventDefault: () => void;
};

export function invokeContactSearchFromKeyboard(
  event: ContactSearchKeyEvent,
  search: () => void,
) {
  if (event.key !== "Enter" || event.isComposing) return false;

  event.preventDefault();
  search();
  return true;
}

type SelectedContactProvenanceProps = {
  addressLabel?: string;
  partyLabel: string;
  selection: ShipmentContactSelection;
};

export function SelectedContactProvenance({
  addressLabel,
  partyLabel,
  selection,
}: SelectedContactProvenanceProps) {
  return (
    <div
      aria-label={`Kontak ${partyLabel} terpilih`}
      className="grid gap-3 rounded-lg border bg-card p-4"
      role="status"
    >
      <p className="text-sm font-medium">Kontak tersimpan dipilih</p>
      <dl className="grid gap-3 text-sm md:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">Kontak dipilih</dt>
          <dd className="mt-1 wrap-anywhere">{selection.name}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">Alamat dipilih</dt>
          <dd className="mt-1 grid wrap-anywhere">
            <strong className="font-medium">{addressLabel ?? "Alamat tersimpan"}</strong>
            <span className="text-muted-foreground">{selection.address}</span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">Area alamat</dt>
          <dd className="mt-1 wrap-anywhere">{selection.destinationAreaLabel ?? "Area tidak disimpan untuk alamat ini"}</dd>
        </div>
      </dl>
      <p className="text-sm leading-5 text-muted-foreground">
        Disalin dari direktori kontak {partyLabel}. Isian manual tetap dapat diubah.
      </p>
    </div>
  );
}

export type DraftCodBreakdownValue = {
  goodsValueIdr: number;
  providerCodAmountIdr: number;
  serviceFeeIdr: number;
  shippingAmountIdr: number;
  vatAmountIdr: number;
};

type DraftCodBreakdownProps = {
  breakdown: DraftCodBreakdownValue;
  money: DraftProviderMoneyLines;
  providerService: string;
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
  const providerChargedShippingIdr = specialPriceIdr ?? normalPriceIdr;
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

function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function DraftCodBreakdown({
  breakdown,
  money,
  providerService,
}: DraftCodBreakdownProps) {
  return (
    <article className="min-w-0 rounded-lg border bg-card p-4">
      <h4 className="mb-3 wrap-anywhere text-sm font-medium">{providerService}</h4>
      <dl className="text-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2 first:border-t-0">
          <dt className="text-muted-foreground">Nilai barang dideklarasikan</dt>
          <dd className="text-right font-medium tabular-nums whitespace-nowrap">{formatIdr(breakdown.goodsValueIdr)}</dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2">
          <dt className="text-muted-foreground">Ongkir penyedia</dt>
          <dd className="text-right font-medium tabular-nums whitespace-nowrap">{formatIdr(breakdown.shippingAmountIdr)}</dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2">
          <dt className="text-muted-foreground">Biaya COD</dt>
          <dd className="text-right font-medium tabular-nums whitespace-nowrap">{formatIdr(breakdown.serviceFeeIdr)}</dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2">
          <dt className="text-muted-foreground">PPN biaya COD</dt>
          <dd className="text-right font-medium tabular-nums whitespace-nowrap">{formatIdr(breakdown.vatAmountIdr)}</dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2 font-semibold">
          <dt>Total ditagih ke pelanggan</dt>
          <dd className="text-right tabular-nums whitespace-nowrap">{formatIdr(breakdown.providerCodAmountIdr)}</dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2">
          <dt className="text-muted-foreground">Ongkir dasar pencairan Mengantar</dt>
          <dd className="text-right font-medium tabular-nums whitespace-nowrap">
            −{formatIdr(money.providerChargedShippingIdr)}
          </dd>
        </div>
        {money.mengantarCodFeeIdr === null ? null : (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2">
            <dt className="text-muted-foreground">Biaya COD Mengantar (3,33% dari total COD)</dt>
            <dd className="text-right font-medium tabular-nums whitespace-nowrap">
              −{formatIdr(money.mengantarCodFeeIdr)}
            </dd>
          </div>
        )}
        {money.estimatedSellerPayoutIdr === null ? null : (
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2 font-semibold"
            data-metric-id={DRAFT_MONEY_METRIC_IDS.sellerPayout}
          >
            <dt>Estimasi diterima penjual</dt>
            <dd className="text-right tabular-nums whitespace-nowrap">
              {formatIdr(money.estimatedSellerPayoutIdr)}
            </dd>
          </div>
        )}
      </dl>
      {money.estimatedSellerPayoutIdr === null ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Estimasi diterima penjual belum tersedia untuk kombinasi tarif ini: data ongkir
          dari penyedia tidak konsisten, jadi angka disembunyikan agar tidak menampilkan
          perkiraan yang salah.
        </p>
      ) : (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Biaya COD dan PPN-nya ditagih ke pelanggan, lalu dipotong Mengantar saat
          pencairan, sehingga estimasi ini sudah bersih dari biaya COD. Angka ini masih
          memuat selisih ongkir normal-spesial sebesar{" "}
          {formatIdr(money.shippingSpreadIdr)}.
        </p>
      )}
    </article>
  );
}
