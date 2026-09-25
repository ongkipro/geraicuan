"use client";

import { CircleAlert, ExternalLink, MapPinCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

import {
  type DestinationAreaVerificationState,
  verifyShipmentDraftDestinationArea,
} from "@/app/app/actions";
import {
  confirmShipmentIssuance,
  type ShipmentIssuanceActionState,
} from "@/app/app/pengiriman/[shipmentId]/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodOngkirCharge } from "@/app/app/cod-ongkir-charge";
import {
  COD_ONGKIR_FIELD_NAME,
  MENGANTAR_COD_FEE_RATE_LABEL,
  ShipmentFlowSummary,
} from "@/app/app/shipment-draft-experience";
import { FormLayout, PageAside } from "@/components/cms/cms-layouts";
import { CourierLogo } from "@/components/cms/courier-logo";
import { ToneBadge } from "@/components/cms/shipment-status-badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { deliveryEstimateLabel, serviceDisplayName } from "@/lib/labels/courier";
import { COD_FORMULA_RETIRED_MESSAGE, codOngkirBreakEvenIdr, type CodChargeBreakdown } from "@/lib/mengantar-cod-fee";
import { courierDisplayName, mengantarCourierOfService } from "@/lib/mengantar-couriers";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-method";
import { cn } from "@/lib/utils";


export type ShipmentEstimateOption = {
  /** T-193: `codChargeBreakdown` of the amount confirmation would submit. */
  codBreakdown: CodChargeBreakdown | null;
  codEligible: boolean;
  deliveryEstimate: string;
  estimateServiceId: string;
  insuranceAmountIdr: number | null;
  providerService: string;
  shippingAmountIdr: number;
  /** T-186: the shipping Mengantar deducts, the COD Ongkir break-even basis. */
  shippingDeductedIdr?: number;
};

/**
 * T-205: what the Buat kiriman rail shows beside the service choice. When given,
 * the panel lays itself out as the flow page (choice on the left, summary, the
 * physical-check consent and the one primary action on a sticky rail, a bottom bar
 * below the split). Without it the panel is the single card the detail page embeds.
 */
export type ShipmentIssuanceSummary = {
  declaredValueIdr: number;
  destination: string;
  /** Where "Simpan draf" leaves to: the draft is already stored, issuing can wait. */
  draftHref: string;
  origin: string;
  /** "1.000 g · 3 barang", named in the physical-check consent. */
  packageLabel: string;
  sender: string;
};

type ShipmentIssuancePanelProps = {
  className?: string;
  /** T-199: the shipment holds a never-submitted version 1 COD row; confirmation is refused. */
  codFormulaRetired?: boolean;
  fixtureEnabled: boolean;
  /** T-205: a control beside the service heading (the estimate refresh); rendered outside the issuance form. */
  headerAction?: ReactNode;
  isCod: boolean;
  options: ShipmentEstimateOption[];
  /** T-186: defaults to what `isCod` implies for callers that predate COD Ongkir. */
  paymentMethod?: PaymentMethod;
  shipmentId: string;
  snapshotId: string;
  summary?: ShipmentIssuanceSummary;
};

const FORM_ID = "shipment-issuance-form";
const initialState: ShipmentIssuanceActionState = {};
const initialVerificationState: DestinationAreaVerificationState = {};
const idr = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

// T-193: one Biaya COD (Mengantar's 3.33%, VAT inside), and the lines add up to the total.
function breakdownRows(breakdown: CodChargeBreakdown): readonly [string, string, number][] {
  return [
    ["goods", "Nilai barang dideklarasikan", breakdown.goodsValueIdr],
    ["shipping", "Ongkir penyedia", breakdown.shippingAmountIdr],
    ["fee", `Biaya COD Mengantar ${MENGANTAR_COD_FEE_RATE_LABEL} (termasuk PPN ${idr.format(breakdown.codFeeVatIncludedIdr)})`, breakdown.codFeeIdr],
    ...(breakdown.roundingIdr > 0
      ? [["rounding", "Pembulatan ke rupiah", breakdown.roundingIdr] as [string, string, number]]
      : []),
    ["total", "Total ditagih ke pelanggan", breakdown.providerCodAmountIdr],
  ];
}

/** The courier a service belongs to; a service no known courier claims is its own group. */
function courierOf(option: ShipmentEstimateOption) {
  return mengantarCourierOfService(option.providerService) ?? option.providerService;
}

/**
 * T-205: whether the issue button may be pressed, and the one sentence that says why
 * not. The consent tick is a client-side gate on top of the server's own
 * `confirmation=confirmed` requirement; every other refusal is the panel's existing one.
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
          ? "Periksa ongkir COD yang ditagih kurir."
          : !input.consented
            ? input.physicalCheck
              ? "Centang “Paket sudah dicek fisik” terlebih dahulu."
              : "Centang konfirmasi di atas terlebih dahulu."
            : null;
  return { confirmDisabled, message, submitDisabled: confirmDisabled || !input.consented };
}

type RailCharges = {
  note: string;
  rows: readonly [string, string][];
  total: { label: string; value: string } | null;
};

export function ShipmentIssuancePanel({
  className,
  codFormulaRetired = false,
  fixtureEnabled,
  headerAction,
  isCod,
  options,
  paymentMethod = isCod ? "COD" : "NON_COD",
  shipmentId,
  snapshotId,
  summary,
}: ShipmentIssuancePanelProps) {
  const [state, action, pending] = useActionState(confirmShipmentIssuance, initialState);
  const [verificationState, verifyAction, verifyPending] = useActionState(
    verifyShipmentDraftDestinationArea,
    initialVerificationState,
  );
  const [selectedId, setSelectedId] = useState("");
  const [activeCourier, setActiveCourier] = useState<string | null>(null);
  const [codOngkirValidity, setCodOngkirValidity] = useState<{ id: string; valid: boolean } | null>(null);
  const [codOngkirCharge, setCodOngkirCharge] = useState<{ id: string; chargeIdr: number | null } | null>(null);
  // T-205: the consent is ticked for one service; choosing another clears it, as the
  // uncontrolled checkbox's `key` did before.
  const [consentFor, setConsentFor] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.estimateServiceId === selectedId);
  const eligibleOptions = options.filter((option) => !isCod || option.codEligible);
  const codOngkirBasis = paymentMethod === "COD_ONGKIR" ? selected?.shippingDeductedIdr ?? null : null;
  // Refused inline first; the server refuses the same charge again.
  const codOngkirBlocked = paymentMethod === "COD_ONGKIR" && Boolean(selected) && (
    codOngkirBasis === null
    || (codOngkirValidity?.id === selectedId
      ? !codOngkirValidity.valid
      : codOngkirBreakEvenIdr(codOngkirBasis) === null)
  );
  const consented = Boolean(selected) && consentFor === selectedId;
  const { confirmDisabled, message: gateMessage, submitDisabled } = issuanceGate({
    codFormulaRetired,
    codOngkirBlocked,
    consented,
    fixtureEnabled,
    pending,
    // T-205 review: the physical check guards every issuance, on /baru and on the detail page alike.
    physicalCheck: true,
    selected: Boolean(selected),
  });

  const couriers = [...new Set(options.map(courierOf))];
  const shownCourier = activeCourier
    ?? (selected ? courierOf(selected) : null)
    ?? (eligibleOptions[0] ? courierOf(eligibleOptions[0]) : null)
    ?? couriers[0]
    ?? null;

  useEffect(() => {
    if (state.error || state.issued) resultRef.current?.focus();
  }, [state]);

  const codOngkirChargeIdr = codOngkirBasis === null
    ? null
    : codOngkirCharge?.id === selectedId
      ? codOngkirCharge.chargeIdr
      : codOngkirBreakEvenIdr(codOngkirBasis);

  function railCharges(): RailCharges | null {
    if (!summary || !selected) return null;
    if (paymentMethod === "COD") {
      if (!selected.codBreakdown) return null;
      const rows = breakdownRows(selected.codBreakdown);
      return {
        note: "Ditagih kurir ke penerima saat paket diserahkan.",
        rows: rows.filter(([key]) => key !== "total").map(([, label, amount]) => [label, idr.format(amount)]),
        total: { label: "Total ditagih ke pelanggan", value: idr.format(selected.codBreakdown.providerCodAmountIdr) },
      };
    }
    if (paymentMethod === "COD_ONGKIR") {
      return {
        note: "Barang sudah dibayar; kurir hanya menagih ongkir ini.",
        rows: [
          ["Nilai barang (sudah dibayar)", idr.format(summary.declaredValueIdr)],
          ...(codOngkirBasis === null ? [] : [["Ongkir dipotong Mengantar", idr.format(codOngkirBasis)] as [string, string]]),
        ],
        total: { label: "Ongkir ditagih kurir", value: codOngkirChargeIdr === null ? "—" : idr.format(codOngkirChargeIdr) },
      };
    }
    return {
      note: "Kurir tidak menagih apa pun ke penerima.",
      rows: [
        ["Nilai barang (asuransi)", idr.format(summary.declaredValueIdr)],
        ...(selected.insuranceAmountIdr === null ? [] : [["Asuransi (estimasi Mengantar)", idr.format(selected.insuranceAmountIdr)] as [string, string]]),
      ],
      total: { label: "Ongkir layanan", value: idr.format(selected.shippingAmountIdr) },
    };
  }
  const charges = railCharges();

  const consentField = (
    <Field className="max-w-2xl items-start" data-disabled={confirmDisabled} orientation="horizontal">
      <input
        aria-describedby="issuance-confirmation-hint"
        checked={consented}
        className="mt-1 size-4 shrink-0 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={confirmDisabled}
        form={FORM_ID}
        id="issuance-confirmation"
        name="confirmation"
        onChange={(event) => setConsentFor(event.target.checked ? selectedId : null)}
        required
        type="checkbox"
        value="confirmed"
      />
      <div className="grid gap-1">
        <FieldLabel className="leading-6" htmlFor="issuance-confirmation">Paket sudah dicek fisik</FieldLabel>
        <FieldDescription id="issuance-confirmation-hint">
          {summary ? `Berat dan jumlah sesuai (${summary.packageLabel}); layanan dan nilai sudah benar.` : "Berat, jumlah, layanan dan nilai sudah benar."} Resi diterbitkan satu kali.
        </FieldDescription>
      </div>
    </Field>
  );

  const submitLabel = summary
    ? pending ? "Menerbitkan resi…" : "Konfirmasi & terbitkan resi"
    : pending ? "Menerbitkan AWB…" : "Konfirmasi dan terbitkan AWB";

  const serviceCard = (
    <Card
      aria-busy={pending}
      aria-labelledby="estimasi-heading"
      className={summary ? undefined : className}
      id="konfirmasi-penerbitan-awb"
      role="region"
    >
      <CardHeader className="gap-3 md:flex md:items-start md:justify-between">
        <div className="grid gap-1">
          <CardTitle id="estimasi-heading">{summary ? "Pilih layanan ekspedisi" : "Pilih layanan dan terbitkan AWB"}</CardTitle>
          <CardDescription className="max-w-2xl leading-6">
            {summary
              ? "Tarif Mengantar untuk rute dan berat ini. Pilih kurir, lalu layanannya."
              : "Konfirmasi ini langsung memproses penerbitan satu kali. Periksa layanan dan nilai sebelum melanjutkan."}
          </CardDescription>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </CardHeader>

      <CardContent className="grid gap-5">

      {codFormulaRetired ? (
        <Alert id="cod-formula-retired" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Kiriman ini tidak dapat dikonfirmasi</AlertTitle>
          <AlertDescription className="grid gap-2">
            <p>{COD_FORMULA_RETIRED_MESSAGE}</p>
            <p><Link className="font-medium underline underline-offset-4" href="/app/pengiriman/baru">Buat kiriman baru</Link></p>
          </AlertDescription>
        </Alert>
      ) : null}

      {eligibleOptions.length === 0 ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Tidak ada layanan yang memenuhi syarat</AlertTitle>
          <AlertDescription>
            Estimasi terbaru tidak memiliki layanan yang mendukung{isCod ? " COD" : " kiriman ini"}.
          </AlertDescription>
        </Alert>
      ) : (
        <form action={action} className="grid gap-5" id={FORM_ID}>
          <input name="shipmentId" type="hidden" value={shipmentId} />
          <input name="estimateSnapshotId" type="hidden" value={snapshotId} />
          {/* T-199: nothing on a retired-formula shipment can be confirmed, so no service is choosable. */}
          <fieldset className="grid min-w-0 gap-4" disabled={pending || codFormulaRetired}>
            <legend className="sr-only">Layanan Mengantar yang tersimpan</legend>
            {couriers.length > 1 ? (
              // T-205: the courier row filters the cards below; it chooses nothing on its own.
              // Buttons with `aria-pressed`, not tabs: every service stays in the form, only
              // the other couriers' cards are hidden (a hidden checked radio still submits).
              <div className="grid gap-2">
                <p className="text-sm font-medium" id="courier-filter-label">Kurir</p>
                <ul aria-labelledby="courier-filter-label" className="flex flex-wrap gap-2">
                  {couriers.map((courier) => {
                    const courierOptions = options.filter((option) => courierOf(option) === courier);
                    const cheapest = Math.min(...courierOptions.map((option) => option.shippingAmountIdr));
                    const active = courier === shownCourier;
                    return (
                      <li key={courier}>
                        <button
                          aria-pressed={active}
                          className={cn(
                            "flex min-h-11 min-w-28 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                            active ? "border-primary bg-accent" : "bg-card hover:bg-muted",
                          )}
                          onClick={() => setActiveCourier(courier)}
                          type="button"
                        >
                          <span className="flex items-center gap-2">
                            {/* The visible name names the button; the logo beside it is decorative. */}
                            <CourierLogo className="h-5" courier={courier} decorative />
                            <span className={cn("text-sm font-semibold", active && "text-accent-foreground")}>{courierDisplayName(courier)}</span>
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">mulai {idr.format(cheapest)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {couriers.map((courier) => (
              <div
                aria-label={`Layanan ${courierDisplayName(courier)}`}
                className="grid gap-2"
                hidden={courier !== shownCourier}
                key={courier}
                role="radiogroup"
              >
                {options.filter((option) => courierOf(option) === courier).map((option) => {
                  const eligible = !isCod || option.codEligible;
                  const service = serviceDisplayName(option.providerService);
                  const detailId = `service-${option.estimateServiceId}-detail`;
                  return (
                    <label
                      className={cn(
                        "group flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted",
                        "has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring",
                        "has-disabled:cursor-not-allowed has-disabled:bg-muted has-disabled:hover:bg-muted",
                      )}
                      data-state={selectedId === option.estimateServiceId ? "selected" : undefined}
                      key={option.estimateServiceId}
                    >
                      <input
                        aria-describedby={detailId}
                        className="mt-1 size-4 shrink-0 accent-primary outline-none"
                        disabled={!eligible}
                        name="estimateServiceId"
                        onChange={() => {
                          setSelectedId(option.estimateServiceId);
                          setActiveCourier(courier);
                        }}
                        required
                        type="radio"
                        value={option.estimateServiceId}
                      />
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="text-base font-semibold wrap-anywhere group-has-checked:text-accent-foreground">{service}</span>
                        <span className="grid gap-1 text-sm text-muted-foreground" id={detailId}>
                          <span>
                            Estimasi tiba {deliveryEstimateLabel(option.deliveryEstimate)}
                            {option.insuranceAmountIdr === null ? null : <> · Asuransi <span className="tabular-nums">{idr.format(option.insuranceAmountIdr)}</span></>}
                          </span>
                          {paymentMethod === "NON_COD" ? null : (
                            <ToneBadge label={option.codEligible ? "COD didukung" : "COD tidak didukung"} tone={option.codEligible ? "ok" : "neutral"} />
                          )}
                        </span>
                      </span>
                      <span className="grid shrink-0 justify-items-end gap-0.5">
                        <span className="text-base font-semibold tabular-nums">{idr.format(option.shippingAmountIdr)}</span>
                        <span className="text-xs text-muted-foreground">Ongkir</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </fieldset>

          {paymentMethod === "COD_ONGKIR" && selected ? (
            codOngkirBasis === null ? (
              <p className="text-sm text-destructive" role="alert">Ongkir yang dipotong Mengantar untuk layanan ini tidak tersedia. Muat ulang estimasi.</p>
            ) : (
              <CodOngkirCharge
                idPrefix={`issuance-cod-ongkir-${selectedId}`}
                key={selectedId}
                name={COD_ONGKIR_FIELD_NAME}
                onChargeChange={(chargeIdr) => setCodOngkirCharge({ chargeIdr, id: selectedId })}
                onValidityChange={(valid) => setCodOngkirValidity({ id: selectedId, valid })}
                providerService={serviceDisplayName(selected.providerService)}
                shippingDeductedIdr={codOngkirBasis}
              />
            )
          ) : summary ? null : codFormulaRetired ? null : selected?.codBreakdown ? (
            <div aria-label="Rincian nilai penagihan COD" role="region">
              <Table>
                <TableCaption className="px-3 text-left">Rincian penagihan ke pelanggan</TableCaption>
                <TableBody>
                  {breakdownRows(selected.codBreakdown).map(([key, label, amount]) => (
                    <TableRow key={key}>
                      <TableCell className={key === "total" ? "font-medium" : undefined}>{label}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{idr.format(amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : selected ? (
            <p className="text-sm text-muted-foreground">Kiriman non-COD tidak memiliki nilai penagihan ke penerima.</p>
          ) : (
            <p className="text-sm text-muted-foreground" role="status">Pilih layanan untuk meninjau nilai konfirmasi.</p>
          )}

          {!fixtureEnabled ? (
            <Alert id="fixture-issuance-status">
              <ShieldCheck aria-hidden="true" />
              <AlertTitle>Penerbitan dikunci</AlertTitle>
              <AlertDescription>Fitur hanya aktif dengan data uji non-produksi yang disetujui. Tidak ada panggilan penyedia dari kondisi ini.</AlertDescription>
            </Alert>
          ) : null}

          {summary ? null : (
            <>
              {consentField}
              {/* Same reason line as the /baru rail, so a disabled button always says why. */}
              <div className="grid gap-2 border-t pt-4">
                <Button
                  aria-describedby={gateMessage ? "issuance-gate-detail" : undefined}
                  className="min-h-11 w-fit max-md:w-full"
                  disabled={submitDisabled}
                  type="submit"
                >
                  {submitLabel}
                </Button>
                {gateMessage ? <p className="text-xs text-muted-foreground" id="issuance-gate-detail">{gateMessage}</p> : null}
              </div>
            </>
          )}
        </form>
      )}

      {/* Once the destination is verified the earlier refusal is answered: keeping the
          destructive alert on screen beside "Tujuan sudah terverifikasi" would tell the
          operator two contradictory things at once. */}
      {state.error && !verificationState.verified ? (
        <Alert aria-live="assertive" ref={resultRef} tabIndex={-1} variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Penerbitan tidak berhasil</AlertTitle>
          <AlertDescription>{state.error} Muat ulang halaman bila estimasi atau status sudah berubah.</AlertDescription>
        </Alert>
      ) : null}
      {state.code === "ORDER_DESTINATION_AREA_UNVERIFIED" && !verificationState.verified ? (
        <Alert id="destination-area-verification">
          <MapPinCheck aria-hidden="true" />
          <AlertTitle>Verifikasi ulang tujuan diperlukan</AlertTitle>
          <AlertDescription className="grid gap-2">
            <p>Cek ulang area tujuan draf ini ke Mengantar sebelum mengonfirmasi lagi. Alamat tidak berubah, hanya diperiksa ulang.</p>
            <form action={verifyAction}>
              <input name="shipmentId" type="hidden" value={shipmentId} />
              <Button className="min-h-11 max-md:w-full md:min-h-10" disabled={verifyPending} size="sm" type="submit" variant="outline">
                {verifyPending ? "Memverifikasi tujuan…" : "Verifikasi ulang tujuan"}
              </Button>
            </form>
            {verificationState.error ? (
              <p aria-live="assertive" className="text-destructive">{verificationState.error}</p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {verificationState.verified ? (
        <Alert aria-live="polite" id="destination-area-verified">
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Tujuan sudah terverifikasi</AlertTitle>
          <AlertDescription>Silakan konfirmasi ulang penerbitan {summary ? "resi" : "AWB"}.</AlertDescription>
        </Alert>
      ) : null}
      {state.issued ? (
        <Alert aria-live="polite" ref={resultRef} tabIndex={-1}>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>AWB {state.issued.awb} sudah tersimpan</AlertTitle>
          <AlertDescription>
            <Button asChild className="mt-2 min-h-11 max-md:w-full md:min-h-10" size="sm" variant="outline">
              <Link href={state.issued.labelHref}>Buka label 10 × 15 cm <ExternalLink aria-hidden="true" /></Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      </CardContent>
    </Card>
  );

  if (!summary) return serviceCard;

  const serviceLine = selected
    ? `${serviceDisplayName(selected.providerService)} · ${deliveryEstimateLabel(selected.deliveryEstimate)}`
    : "Belum dipilih";
  const canIssue = eligibleOptions.length > 0 && !codFormulaRetired;

  return (
    <>
      <FormLayout
        aside={(
          <PageAside label="Ringkasan pembuatan kiriman">
            <Card>
              <CardHeader><CardTitle>Ringkasan kiriman</CardTitle></CardHeader>
              <CardContent className="grid gap-5">
                <ShipmentFlowSummary
                  destination={summary.destination}
                  origin={summary.origin}
                  rows={[
                    { label: "Pengirim di label", value: summary.sender },
                    { label: "Layanan", value: serviceLine },
                    { label: "Berat & jumlah", value: summary.packageLabel },
                    { label: "Pembayaran", value: PAYMENT_METHOD_LABELS[paymentMethod] },
                  ]}
                />
                {charges ? (
                  <section aria-label="Rincian biaya" className="grid gap-3 border-t pt-4 text-sm">
                    <dl className="grid gap-2">
                      {charges.rows.map(([label, value]) => (
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3" key={label}>
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="text-right font-medium tabular-nums whitespace-nowrap">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {charges.total ? (
                      <div className="grid gap-1 rounded-lg bg-accent p-3 text-accent-foreground" data-summary-total>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold">{charges.total.label}</span>
                          <span className="text-lg font-bold tabular-nums whitespace-nowrap">{charges.total.value}</span>
                        </div>
                        <p className="text-xs">{charges.note}</p>
                      </div>
                    ) : null}
                  </section>
                ) : (
                  <p className="border-t pt-4 text-sm text-muted-foreground">
                    {selected ? "Rincian biaya tidak tersedia untuk layanan ini." : "Pilih layanan untuk melihat rincian biaya dan total."}
                  </p>
                )}
                {canIssue ? (
                  <div className="grid gap-3 border-t pt-4">
                    {consentField}
                    {/* One primary per width: the rail's below the split is the bottom bar's. */}
                    <Button
                      aria-describedby={gateMessage ? "issuance-gate" : undefined}
                      className="hidden min-h-11 w-full @4xl/page:inline-flex"
                      disabled={submitDisabled}
                      form={FORM_ID}
                      type="submit"
                    >
                      {submitLabel}
                    </Button>
                    <p className="text-xs text-muted-foreground empty:hidden" id="issuance-gate">{gateMessage}</p>
                  </div>
                ) : null}
                <Button asChild className="min-h-11 w-full md:min-h-10" variant="outline">
                  <Link href={summary.draftHref}>Simpan draf, terbitkan nanti</Link>
                </Button>
              </CardContent>
            </Card>
          </PageAside>
        )}
      >
        {serviceCard}
      </FormLayout>

      {canIssue ? (
        // V-40: scale values only; the one arbitrary value is the documented safe-area
        // exception — the bar must clear the iOS home indicator, which no scale step expresses.
        <div className="sticky bottom-0 z-20 -mx-4 flex items-center gap-3 border-t bg-card px-4 pt-3 pb-[max(--spacing(3),env(safe-area-inset-bottom))] shadow-md sm:-mx-6 sm:px-6 @4xl/page:hidden">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <p className="truncate text-xs text-muted-foreground">{charges?.total?.label ?? "Langkah 3 dari 3 · Terbitkan resi"}</p>
            <p className="text-base font-bold tabular-nums">{charges?.total?.value ?? serviceLine}</p>
            {gateMessage ? <p className="text-xs text-muted-foreground">{gateMessage}</p> : null}
          </div>
          <Button className="min-h-11 shrink-0" disabled={submitDisabled} form={FORM_ID} type="submit">
            {submitLabel}
          </Button>
        </div>
      ) : null}
    </>
  );
}
