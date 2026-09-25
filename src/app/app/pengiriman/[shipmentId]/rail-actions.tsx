"use client";

import { CircleAlert, CircleCheck, Printer, RotateCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";

import {
  reconcileShipmentUnknownSubmission,
  type ShipmentReconciliationActionState,
} from "@/app/app/pengiriman/[shipmentId]/reconciliation-actions";
import {
  checkStaleShipmentOperation,
  type ShipmentStaleOperationActionState,
} from "@/app/app/pengiriman/[shipmentId]/stale-operation-actions";
import {
  recoverShipmentUnpaidPayment,
  type ShipmentUnpaidRecoveryActionState,
} from "@/app/app/pengiriman/[shipmentId]/unpaid-recovery-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";

/**
 * T-213 rail actions for the provider-uncertain states. Each keeps its server action and guards
 * unchanged (spec 17 §UX-v3.6): the button is the page's one primary, the consent sits above it,
 * and the outcome is announced in place and focused.
 */

function ConsentCheck({ children, disabled, id, onChange }: {
  children: ReactNode;
  disabled: boolean;
  id: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        className="mt-1 size-4 shrink-0 accent-primary disabled:cursor-not-allowed"
        disabled={disabled}
        id={id}
        name="confirmation"
        onChange={(event) => onChange(event.target.checked)}
        required
        type="checkbox"
        value="confirmed"
      />
      <label className="text-xs text-muted-foreground" htmlFor={id}>{children}</label>
    </div>
  );
}

function LockedNote({ children }: { children: ReactNode }) {
  return (
    <Alert role="status">
      <ShieldCheck aria-hidden="true" />
      <AlertTitle>{children}</AlertTitle>
      <AlertDescription>Aktif hanya dengan data uji non-produksi yang disetujui. Tidak ada panggilan ke Mengantar.</AlertDescription>
    </Alert>
  );
}

function useFocusOnResult(trigger: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (trigger) ref.current?.focus();
  }, [trigger]);
  return ref;
}

export function UnpaidRecoveryAction({ fixtureEnabled, shipmentId }: { fixtureEnabled: boolean; shipmentId: string }) {
  const [state, action, pending] = useActionState(recoverShipmentUnpaidPayment, {} as ShipmentUnpaidRecoveryActionState);
  const [consented, setConsented] = useState(false);
  const id = useId();
  const resultRef = useFocusOnResult(state.error ?? state.recovered);
  const disabled = !fixtureEnabled || pending;
  return (
    <form action={action} aria-busy={pending} className="flex flex-col gap-3" id="pemulihan-pembayaran">
      <input name="shipmentId" type="hidden" value={shipmentId} />
      {!fixtureEnabled ? <LockedNote>Pemulihan dikunci</LockedNote> : null}
      <ConsentCheck disabled={disabled} id={`${id}-consent`} onChange={setConsented}>
        Saldo Mengantar sudah didanai dan status ditinjau. Pemulihan dijalankan satu kali.
      </ConsentCheck>
      <Button className="w-full" disabled={disabled || !consented} type="submit">
        <RotateCw aria-hidden="true" />
        {pending ? "Memulihkan pembayaran…" : "Pulihkan pembayaran"}
      </Button>
      {state.error ? (
        <Alert ref={resultRef} tabIndex={-1} variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Pemulihan tidak berhasil</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.recovered ? (
        <Alert ref={resultRef} role="status" tabIndex={-1}>
          <CircleCheck aria-hidden="true" className="text-ok" />
          <AlertTitle>
            {state.recovered.duplicate ? "Sudah dipulihkan sebelumnya; tidak ada pembayaran kedua" : "Pembayaran dipulihkan"}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            {state.recovered.shipments.map((shipment) => (
              <Button asChild className="w-full" key={shipment.shipmentId} variant="outline">
                <Link href={shipment.labelHref}><Printer aria-hidden="true" />Cetak label {shipment.awb}</Link>
              </Button>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

const RECONCILED_LABEL = {
  AWAITING_UPSTREAM_PAYMENT: SHIPMENT_STATUS_PRESENTATION.AWAITING_UPSTREAM_PAYMENT.label,
  FAILED: SHIPMENT_STATUS_PRESENTATION.FAILED.label,
  ISSUED: SHIPMENT_STATUS_PRESENTATION.ISSUED.label,
} as const;

export function ReconciliationAction({ fixtureEnabled, shipmentId }: { fixtureEnabled: boolean; shipmentId: string }) {
  const [state, action, pending] = useActionState(reconcileShipmentUnknownSubmission, {} as ShipmentReconciliationActionState);
  const [consented, setConsented] = useState(false);
  const id = useId();
  const resultRef = useFocusOnResult(state.error ?? state.reconciled);
  const disabled = !fixtureEnabled || pending;
  return (
    <form action={action} aria-busy={pending} className="flex flex-col gap-3" id="rekonsiliasi-pengiriman">
      <input name="shipmentId" type="hidden" value={shipmentId} />
      {!fixtureEnabled ? <LockedNote>Rekonsiliasi dikunci</LockedNote> : null}
      <ConsentCheck disabled={disabled} id={`${id}-consent`} onChange={setConsented}>
        Rekonsiliasi hanya mencocokkan hasil yang sudah ada; pesanan tidak dibuat atau dikirim ulang.
      </ConsentCheck>
      <Button className="w-full" disabled={disabled || !consented} type="submit">
        <ShieldCheck aria-hidden="true" />
        {pending ? "Merekonsiliasi…" : "Konfirmasi rekonsiliasi"}
      </Button>
      {state.error ? (
        <Alert ref={resultRef} tabIndex={-1} variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Rekonsiliasi tidak berhasil</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.reconciled ? (
        <Alert ref={resultRef} role="status" tabIndex={-1}>
          <CircleCheck aria-hidden="true" className="text-ok" />
          <AlertTitle>Hasil resmi: {RECONCILED_LABEL[state.reconciled.status]}</AlertTitle>
          <AlertDescription>
            {state.reconciled.awb ? `AWB ${state.reconciled.awb} tersimpan.` : "Muat ulang untuk tindakan berikutnya."}
          </AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

export function StaleCheckAction({ shipmentId }: { shipmentId: string }) {
  const [state, action, pending] = useActionState(checkStaleShipmentOperation, {} as ShipmentStaleOperationActionState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input name="shipmentId" type="hidden" value={shipmentId} />
      <Button className="w-full" disabled={pending} type="submit" variant="outline">
        <RotateCw aria-hidden="true" />
        {pending ? "Memeriksa…" : "Periksa upaya tersendat"}
      </Button>
      {state.message ? <p className="text-xs text-muted-foreground" role="status">{state.message}</p> : null}
      {state.error ? <p className="text-xs text-destructive" role="alert">{state.error}</p> : null}
    </form>
  );
}
