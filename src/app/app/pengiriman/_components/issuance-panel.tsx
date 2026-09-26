"use client";

import { CircleAlert, CircleCheck, MapPinCheck, Printer, ShieldCheck } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  type DestinationAreaVerificationState,
  verifyShipmentDraftDestinationArea,
} from "@/app/app/actions";
import {
  confirmShipmentIssuance,
  type ShipmentIssuanceActionState,
} from "@/app/app/pengiriman/[shipmentId]/actions";
import { CourierLogo } from "@/components/app/courier-logo";
import { formatIdr } from "@/components/app/money";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { deliveryEstimateLabel, serviceDisplayName } from "@/lib/labels/courier";
import { COD_FORMULA_RETIRED_MESSAGE } from "@/lib/mengantar-cod-fee";
import { courierDisplayName, mengantarCourierOfService } from "@/lib/mengantar-couriers";
import type { PaymentMethod } from "@/lib/payment-method";
import {
  codOngkirAmount,
  issuanceCharges,
  MENGANTAR_COD_FEE_RATE_LABEL,
  issuanceGate,
  type IssuanceCharges,
} from "@/lib/shipment-draft-logic";
import type { ShipmentEstimateOption } from "@/lib/shipment-estimate-options";
import { cn } from "@/lib/utils";

/**
 * T-211: the one issuance step ("Pilih layanan & terbitkan"), shared by Buat kiriman and the
 * shipment detail (T-213). `IssuanceProvider` owns the server action, the chosen service and
 * the physical-check consent (the COD Ongkir amount is computed, D-28); the pieces below read it and may be laid
 * out anywhere (a section card, a rail, a bottom bar) because every control submits through the
 * provider's form by its `form` attribute. Field names are the action's own, so server
 * validation is unchanged.
 */

type IssuanceContextValue = {
  charges: IssuanceCharges | null;
  codFormulaRetired: boolean;
  codOngkir: ReturnType<typeof codOngkirAmount>;
  confirmDisabled: boolean;
  consented: boolean;
  eligibleCount: number;
  fixtureEnabled: boolean;
  formId: string;
  gateMessage: string | null;
  isCod: boolean;
  options: ShipmentEstimateOption[];
  paymentMethod: PaymentMethod;
  pending: boolean;
  selected: ShipmentEstimateOption | null;
  selectService: (id: string) => void;
  setConsented: (value: boolean) => void;
  shipmentId: string;
  state: ShipmentIssuanceActionState;
  submitDisabled: boolean;
  verification: DestinationAreaVerificationState;
  verifyAction: (formData: FormData) => void;
  verifyPending: boolean;
};

const IssuanceContext = createContext<IssuanceContextValue | null>(null);

export function useIssuance() {
  const value = useContext(IssuanceContext);
  if (!value) throw new Error("useIssuance must be used inside <IssuanceProvider>.");
  return value;
}

/** The courier a service belongs to; a service no known courier claims is its own group. */
export function courierOfOption(option: Pick<ShipmentEstimateOption, "providerService">) {
  return mengantarCourierOfService(option.providerService) ?? option.providerService;
}

export function IssuanceProvider({
  children,
  codFormulaRetired = false,
  declaredValueIdr,
  fixtureEnabled,
  options,
  paymentMethod,
  shipmentId,
  snapshotId,
}: {
  children: ReactNode;
  /** T-199: a never-submitted version 1 COD row; nothing can be confirmed. */
  codFormulaRetired?: boolean;
  declaredValueIdr: number;
  fixtureEnabled: boolean;
  options: ShipmentEstimateOption[];
  paymentMethod: PaymentMethod;
  shipmentId: string;
  snapshotId: string;
}) {
  const formId = `issuance-${useId().replace(/:/g, "")}`;
  const [state, action, pending] = useActionState(confirmShipmentIssuance, {} as ShipmentIssuanceActionState);
  const [verification, verifyAction, verifyPending] = useActionState(
    verifyShipmentDraftDestinationArea,
    {} as DestinationAreaVerificationState,
  );
  const [selectedId, setSelectedId] = useState("");
  // The consent belongs to one service; choosing another resets it.
  const [consentFor, setConsentFor] = useState<string | null>(null);
  const isCod = paymentMethod !== "NON_COD";
  const selected = options.find((option) => option.estimateServiceId === selectedId) ?? null;
  const eligibleCount = options.filter((option) => !isCod || option.codEligible).length;
  // D-28: ongkir + biaya COD, computed from the chosen service; the server records the same figure.
  const codOngkir = paymentMethod === "COD_ONGKIR" ? codOngkirAmount(selected?.shippingDeductedIdr) : null;
  const codOngkirBlocked = paymentMethod === "COD_ONGKIR" && selected !== null && codOngkir === null;
  const consented = selected !== null && consentFor === selectedId;
  const gate = issuanceGate({
    codFormulaRetired,
    codOngkirBlocked,
    consented,
    fixtureEnabled,
    pending,
    physicalCheck: true,
    selected: selected !== null,
  });
  const charges = issuanceCharges({
    declaredValueIdr,
    option: selected,
    paymentMethod,
  });

  const value: IssuanceContextValue = {
    charges,
    codFormulaRetired,
    codOngkir,
    confirmDisabled: gate.confirmDisabled,
    consented,
    eligibleCount,
    fixtureEnabled,
    formId,
    gateMessage: gate.message,
    isCod,
    options,
    paymentMethod,
    pending,
    selected,
    selectService: setSelectedId,
    setConsented: (checked) => setConsentFor(checked ? selectedId : null),
    shipmentId,
    state,
    submitDisabled: gate.submitDisabled,
    verification,
    verifyAction,
    verifyPending,
  };

  return (
    <IssuanceContext.Provider value={value}>
      <form action={action} aria-busy={pending} id={formId}>
        <input name="shipmentId" type="hidden" value={shipmentId} />
        <input name="estimateSnapshotId" type="hidden" value={snapshotId} />
      </form>
      {children}
    </IssuanceContext.Provider>
  );
}

/** Courier logo grid → the chosen courier's services (spec 17 §UX-v3.6 section 5). */
export function IssuanceServiceChooser({ context }: {
  /** One muted line beside the service heading, e.g. "Tujuan: Coblong, Bandung · Berat: 2 kg". */
  context?: ReactNode;
}) {
  const issuance = useIssuance();
  const { options, isCod, selected, paymentMethod } = issuance;
  const couriers = [...new Set(options.map(courierOfOption))];
  const firstEligible = options.find((option) => !isCod || option.codEligible);
  const [activeCourier, setActiveCourier] = useState<string | null>(null);
  const shownCourier = activeCourier
    ?? (selected ? courierOfOption(selected) : null)
    ?? (firstEligible ? courierOfOption(firstEligible) : null)
    ?? couriers[0]
    ?? null;
  const headingId = useId();

  if (issuance.eligibleCount === 0) {
    return (
      <Alert role="status">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Tidak ada layanan yang bisa dipilih</AlertTitle>
        <AlertDescription>
          {isCod ? "Tidak ada layanan yang mendukung COD untuk rute ini." : "Tarif terbaru tidak memuat layanan untuk kiriman ini."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {issuance.codFormulaRetired ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Kiriman ini tidak dapat dikonfirmasi</AlertTitle>
          <AlertDescription>{COD_FORMULA_RETIRED_MESSAGE}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold tracking-wide text-foreground uppercase" id={`${headingId}-couriers`}>Pilih kurir</p>
        <ul aria-labelledby={`${headingId}-couriers`} className="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-6">
          {couriers.map((courier) => {
            const active = courier === shownCourier;
            return (
              <li key={courier}>
                <button
                  aria-pressed={active}
                  className={cn(
                    "relative flex h-17 w-full flex-col items-center justify-center gap-1 rounded-lg border bg-card p-2 text-center transition-colors outline-none hover:border-input focus-visible:ring-3 focus-visible:ring-ring/50",
                    active && "border-2 border-primary bg-accent hover:border-primary",
                  )}
                  onClick={() => setActiveCourier(courier)}
                  type="button"
                >
                  {active ? <CircleCheck aria-hidden="true" className="absolute -top-2 -right-1.5 size-4 rounded-full bg-card text-ok" /> : null}
                  <CourierLogo className="h-5 max-w-full" courier={courier} decorative />
                  <span className={cn("w-full truncate text-xs", active ? "font-bold text-accent-foreground" : "font-medium text-foreground")}>
                    {courierDisplayName(courier)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
          <p className="flex items-center gap-2 text-sm font-bold" id={`${headingId}-services`}>
            Pilihan layanan:
            <span className="rounded-sm bg-accent px-2.5 py-0.5 text-accent-foreground">{shownCourier ? courierDisplayName(shownCourier) : "—"}</span>
          </p>
          {context ? <p className="text-xs text-muted-foreground">{context}</p> : null}
        </div>
        <div className="overflow-hidden rounded-lg border">
          <div aria-hidden="true" className="hidden grid-cols-12 gap-3 border-b bg-muted px-3 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:grid">
            <span className="col-span-1 text-center">Pilih</span>
            <span className="col-span-4">Layanan</span>
            <span className="col-span-2 text-right">Ongkir</span>
            <span className="col-span-2 text-right">Asuransi</span>
            <span className="col-span-2">Estimasi tiba</span>
            <span className="col-span-1 text-center">COD</span>
          </div>
          {couriers.map((courier) => (
            <div
              aria-labelledby={`${headingId}-services`}
              className="divide-y"
              hidden={courier !== shownCourier}
              key={courier}
              role="radiogroup"
            >
              {options.filter((option) => courierOfOption(option) === courier).map((option) => {
                const eligible = !isCod || option.codEligible;
                const checked = selected?.estimateServiceId === option.estimateServiceId;
                return (
                  <label
                    className={cn(
                      "grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-3 transition-colors hover:bg-muted md:grid-cols-12",
                      checked && "bg-accent hover:bg-accent",
                      !eligible && "cursor-not-allowed opacity-60 hover:bg-card",
                    )}
                    key={option.estimateServiceId}
                  >
                    <span className="flex justify-center md:col-span-1">
                      <input
                        checked={checked}
                        className="size-4 accent-primary"
                        disabled={!eligible || issuance.pending || issuance.codFormulaRetired}
                        form={issuance.formId}
                        name="estimateServiceId"
                        onChange={() => {
                          issuance.selectService(option.estimateServiceId);
                          setActiveCourier(courier);
                        }}
                        type="radio"
                        value={option.estimateServiceId}
                      />
                    </span>
                    <span className="flex min-w-0 flex-col md:col-span-4">
                      <span className={cn("text-sm wrap-anywhere", checked ? "font-bold text-accent-foreground" : "font-medium")}>
                        {serviceDisplayName(option.providerService)}
                      </span>
                      <span className="text-xs text-muted-foreground md:hidden">
                        {deliveryEstimateLabel(option.deliveryEstimate)}
                        {option.insuranceAmountIdr === null ? null : ` · Asuransi ${formatIdr(option.insuranceAmountIdr)}`}
                        {isCod ? (eligible ? " · COD didukung" : " · COD tidak didukung") : null}
                      </span>
                    </span>
                    <span className="text-right text-sm font-bold tabular-nums md:col-span-2">{formatIdr(option.shippingAmountIdr)}</span>
                    <span className="hidden text-right text-sm text-muted-foreground tabular-nums md:col-span-2 md:block">
                      {option.insuranceAmountIdr === null ? "—" : formatIdr(option.insuranceAmountIdr)}
                    </span>
                    <span className="hidden text-sm font-medium md:col-span-2 md:block">{deliveryEstimateLabel(option.deliveryEstimate)}</span>
                    <span className="hidden justify-center md:col-span-1 md:flex">
                      {paymentMethod === "NON_COD" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : option.codEligible ? (
                        <span className="rounded-sm border border-ok bg-ok-surface px-1.5 text-xs font-semibold text-ok">Ya</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Tidak</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {paymentMethod === "COD_ONGKIR" && selected ? <CodOngkirAmountRow /> : null}
    </div>
  );
}

/** D-28: the COD Ongkir amount — ongkir + biaya COD, computed and read-only. */
function CodOngkirAmountRow() {
  const { codOngkir } = useIssuance();
  const id = useId();
  if (codOngkir === null) {
    return <p className="text-sm text-destructive" role="alert">Ongkir yang dipotong Mengantar untuk layanan ini tidak tersedia. Muat ulang tarif.</p>;
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted p-4">
      <p className="text-sm font-medium" id={`${id}-label`}>Nilai COD Ongkir ditagih kurir ke penerima</p>
      <output aria-describedby={`${id}-hint`} aria-labelledby={`${id}-label`} className="text-base font-bold tabular-nums">
        {formatIdr(codOngkir.chargeIdr)}
      </output>
      <p className="text-xs text-muted-foreground" id={`${id}-hint`}>
        Dihitung otomatis: ongkir dipotong Mengantar {formatIdr(codOngkir.shippingIdr)} + biaya COD {MENGANTAR_COD_FEE_RATE_LABEL} {formatIdr(codOngkir.codFeeIdr)}
        {codOngkir.roundingIdr > 0 ? ` + pembulatan ${formatIdr(codOngkir.roundingIdr)}` : ""}
      </p>
    </div>
  );
}

/** "Paket sudah dicek fisik" — the consent every issuance needs (T-205 review). */
export function IssuanceConsent({ packageLabel }: { packageLabel?: string }) {
  const issuance = useIssuance();
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        aria-describedby={`${id}-hint`}
        checked={issuance.consented}
        className="mt-1 size-4 shrink-0 accent-primary disabled:cursor-not-allowed"
        disabled={issuance.confirmDisabled}
        form={issuance.formId}
        id={`${id}-check`}
        name="confirmation"
        onChange={(event) => issuance.setConsented(event.target.checked)}
        type="checkbox"
        value="confirmed"
      />
      <div className="flex flex-col gap-0.5">
        <label className="text-sm font-medium" htmlFor={`${id}-check`}>Paket sudah dicek fisik</label>
        <p className="text-xs text-muted-foreground" id={`${id}-hint`}>
          {packageLabel ? `Berat dan jumlah sesuai (${packageLabel}); layanan dan nilai sudah benar.` : "Berat, jumlah, layanan dan nilai sudah benar."} Resi terbit satu kali.
        </p>
      </div>
    </div>
  );
}

/** The primary "Konfirmasi & terbitkan AWB"; its unmet guard is one line beside it (spec 10 §4.11). */
export function IssuanceSubmitButton({ className, label = "Konfirmasi & terbitkan AWB", showGate = true }: {
  className?: string;
  label?: string;
  showGate?: boolean;
}) {
  const issuance = useIssuance();
  const gateId = useId();
  if (issuance.eligibleCount === 0 || issuance.codFormulaRetired) return null;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Button
        aria-describedby={showGate && issuance.gateMessage ? gateId : undefined}
        className="w-full"
        disabled={issuance.submitDisabled}
        form={issuance.formId}
        size="lg"
        type="submit"
      >
        <ShieldCheck aria-hidden="true" />
        {issuance.pending ? "Menerbitkan AWB…" : label}
      </Button>
      {showGate && issuance.gateMessage ? <p className="text-center text-xs text-muted-foreground" id={gateId}>{issuance.gateMessage}</p> : null}
    </div>
  );
}

/** Outcomes: refusal (+ destination re-verification), fixture lock, issued resi with "Cetak label". */
export function IssuanceOutcome() {
  const issuance = useIssuance();
  const { state, verification } = issuance;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error || state.issued) ref.current?.focus();
  }, [state]);

  return (
    <>
      {!issuance.fixtureEnabled ? (
        <Alert role="status">
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Penerbitan dikunci</AlertTitle>
          <AlertDescription>Penerbitan hanya aktif dengan data uji non-produksi yang disetujui. Tidak ada panggilan ke Mengantar.</AlertDescription>
        </Alert>
      ) : null}
      {state.error && !verification.verified ? (
        <Alert ref={ref} tabIndex={-1} variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Penerbitan tidak berhasil</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.code === "ORDER_DESTINATION_AREA_UNVERIFIED" && !verification.verified ? (
        <Alert role="status">
          <MapPinCheck aria-hidden="true" />
          <AlertTitle>Verifikasi ulang tujuan</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <form action={issuance.verifyAction}>
              <input name="shipmentId" type="hidden" value={issuance.shipmentId} />
              <Button disabled={issuance.verifyPending} type="submit" variant="outline">
                {issuance.verifyPending ? "Memverifikasi tujuan…" : "Verifikasi ulang tujuan"}
              </Button>
            </form>
            {verification.error ? <span className="text-destructive">{verification.error}</span> : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {verification.verified ? (
        <Alert role="status">
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Tujuan sudah terverifikasi</AlertTitle>
          <AlertDescription>Konfirmasi ulang penerbitan AWB.</AlertDescription>
        </Alert>
      ) : null}
      {state.issued ? (
        <Alert className="border-ok" ref={ref} role="status" tabIndex={-1}>
          <CircleCheck aria-hidden="true" className="text-ok" />
          <AlertTitle>Resi {state.issued.awb} terbit</AlertTitle>
          <AlertDescription>
            <Button asChild className="mt-2" variant="outline">
              <Link href={state.issued.labelHref}><Printer aria-hidden="true" />Cetak label</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
