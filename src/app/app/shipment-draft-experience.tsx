import type { ShipmentContactSelection } from "@/app/app/actions";

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
  providerService: string;
};

function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function DraftCodBreakdown({
  breakdown,
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
          <dt className="text-muted-foreground">Biaya layanan COD GeraiCUAN</dt>
          <dd className="text-right font-medium tabular-nums whitespace-nowrap">{formatIdr(breakdown.serviceFeeIdr)}</dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2">
          <dt className="text-muted-foreground">PPN biaya layanan</dt>
          <dd className="text-right font-medium tabular-nums whitespace-nowrap">{formatIdr(breakdown.vatAmountIdr)}</dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2 font-semibold">
          <dt>Total ditagih ke pelanggan</dt>
          <dd className="text-right tabular-nums whitespace-nowrap">{formatIdr(breakdown.providerCodAmountIdr)}</dd>
        </div>
      </dl>
    </article>
  );
}
