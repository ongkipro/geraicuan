"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  COD_ONGKIR_METRIC_IDS,
  evaluateCodOngkirCharge,
  formatDraftIdr as formatIdr,
} from "@/app/app/shipment-draft-experience";
import { CharacterClassHint, useCharacterClass } from "@/components/ui/character-class-input";
import { codOngkirBreakEvenIdr } from "@/lib/mengantar-cod-fee";

/** How long the charge must stay unchanged before its results are announced. */
const SETTLE_MS = 900;

type CodOngkirChargeProps = {
  /** Unique per rendered service, so labels and messages stay paired. */
  idPrefix: string;
  /** Submitted under this name when set; a preview leaves it unset. */
  name?: string;
  onValidityChange?: (valid: boolean) => void;
  providerService: string;
  shippingDeductedIdr: number;
};

/**
 * T-186 / PR-64 COD Ongkir charge: starts at break-even, refuses anything lower
 * inline with the exact figure, and states what the seller keeps as the
 * operator types. The courier collects this charge only — never the goods.
 *
 * T-199 announcements: the refusal stays visible and linked through
 * `aria-describedby`, but is not an alert, so typing digits is never
 * interrupted. It is announced once, politely, when the field loses focus or its
 * form is submitted; the fee and seller difference are announced only after the
 * charge has settled for `SETTLE_MS`.
 */
export function CodOngkirCharge({
  idPrefix,
  name,
  onValidityChange,
  providerService,
  shippingDeductedIdr,
}: CodOngkirChargeProps) {
  const breakEvenIdr = codOngkirBreakEvenIdr(shippingDeductedIdr);
  const [value, setValue] = useState(breakEvenIdr === null ? "" : String(breakEvenIdr));
  const state = evaluateCodOngkirCharge(value, shippingDeductedIdr);
  const inputId = `${idPrefix}-charge`;
  const errorId = `${idPrefix}-charge-error`;
  const hintId = `${idPrefix}-charge-hint`;
  const [touched, setTouched] = useState(false);
  // T-196: whole rupiah is typed as digits only.
  const { hint: chargeHint, ...chargeLock } = useCharacterClass<HTMLInputElement>("RUPIAH", {
    onChange: (event) => {
      setTouched(true);
      setValue(event.target.value);
      onValidityChange?.(evaluateCodOngkirCharge(event.target.value, shippingDeductedIdr).kind === "valid");
    },
  });
  const [refusalAnnouncement, setRefusalAnnouncement] = useState("");
  const [settledAnnouncement, setSettledAnnouncement] = useState("");
  // The starting break-even is read with the card; only a changed charge is announced.
  const settledMessage = touched && state.kind === "valid"
    ? `Biaya COD Mengantar ${formatIdr(state.mengantarCodFeeIdr)}. Selisih diterima penjual ${formatIdr(state.sellerDifferenceIdr)}.`
    : "";
  useEffect(() => {
    const timer = setTimeout(() => setSettledAnnouncement(settledMessage), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [settledMessage]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(announceTimer.current), []);
  const announceRefusal = useCallback(() => {
    const element = inputRef.current;
    if (!element) return;
    const current = evaluateCodOngkirCharge(element.value, shippingDeductedIdr);
    // Cleared first, so the same refusal on a later blur is spoken again.
    setRefusalAnnouncement("");
    clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(
      () => setRefusalAnnouncement(current.kind === "invalid" ? current.message : ""),
      50,
    );
  }, [shippingDeductedIdr]);
  const { ref: lockRef } = chargeLock;
  const inputRefs = useCallback((element: HTMLInputElement | null) => {
    inputRef.current = element;
    const unlock = lockRef(element);
    const form = element?.form;
    form?.addEventListener("submit", announceRefusal);
    return () => {
      unlock?.();
      form?.removeEventListener("submit", announceRefusal);
      inputRef.current = null;
    };
  }, [announceRefusal, lockRef]);

  return (
    <article aria-labelledby={`${idPrefix}-title`} className="grid min-w-0 gap-3 rounded-lg border bg-card p-4">
      <h4 className="wrap-anywhere text-sm font-medium" id={`${idPrefix}-title`}>{providerService}</h4>
      <dl className="text-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-2" data-metric-id={COD_ONGKIR_METRIC_IDS.shippingDeducted}>
          <dt className="text-muted-foreground">Ongkir dipotong Mengantar</dt>
          <dd className="text-right font-medium tabular-nums whitespace-nowrap">{formatIdr(shippingDeductedIdr)}</dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2" data-metric-id={COD_ONGKIR_METRIC_IDS.breakEven}>
          <dt className="text-muted-foreground">Titik impas (ongkir minimal)</dt>
          <dd className="text-right font-medium tabular-nums whitespace-nowrap">{breakEvenIdr === null ? "—" : formatIdr(breakEvenIdr)}</dd>
        </div>
      </dl>
      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor={inputId}>Ongkir ditagih kurir ke penerima (Rp)</label>
        <input
          aria-describedby={state.kind === "invalid" ? `${hintId} ${errorId}` : hintId}
          aria-invalid={state.kind === "invalid"}
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive sm:max-w-56 md:min-h-9"
          data-metric-id={COD_ONGKIR_METRIC_IDS.charge}
          id={inputId}
          data-character-class="RUPIAH"
          name={name}
          {...chargeLock}
          onBlur={announceRefusal}
          ref={inputRefs}
          type="text"
          value={value}
        />
        <CharacterClassHint hint={chargeHint} id={inputId} />
        <p className="text-xs leading-5 text-muted-foreground" id={hintId}>
          Kurir hanya menagih ongkir ini; barang sudah dibayar. Boleh dinaikkan dari titik impas, tidak boleh diturunkan.
        </p>
        {state.kind === "invalid" ? (
          <p className="text-sm leading-5 text-destructive" id={errorId}>{state.message}</p>
        ) : null}
        <p aria-live="polite" className="sr-only" data-cod-ongkir-announcement="refusal">{refusalAnnouncement}</p>
        <p aria-live="polite" className="sr-only" data-cod-ongkir-announcement="settled">{settledAnnouncement}</p>
      </div>
      <dl className="text-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2" data-metric-id={COD_ONGKIR_METRIC_IDS.mengantarFee}>
          <dt className="text-muted-foreground">Biaya COD Mengantar (3,33% dari ongkir ditagih)</dt>
          <dd className="text-right font-medium tabular-nums whitespace-nowrap">
            {state.kind === "valid" ? `−${formatIdr(state.mengantarCodFeeIdr)}` : "—"}
          </dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t py-2 font-semibold" data-metric-id={COD_ONGKIR_METRIC_IDS.sellerDifference}>
          <dt>Selisih diterima penjual</dt>
          <dd className="text-right tabular-nums whitespace-nowrap">
            {state.kind === "valid" ? formatIdr(state.sellerDifferenceIdr) : "—"}
          </dd>
        </div>
      </dl>
    </article>
  );
}
