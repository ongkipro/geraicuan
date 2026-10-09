"use client";

import { CircleAlert, CircleCheck, Loader2, Printer, RotateCw, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";

import {
  cancelShipmentOnMengantar,
  type ShipmentCancelActionState,
} from "@/app/app/pengiriman/[shipmentId]/cancel-actions";
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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
      <AlertDescription>Belum diaktifkan di GeraiCuan, jadi tidak ada panggilan ke Mengantar. Hubungi admin GeraiCuan.</AlertDescription>
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
            {state.reconciled.awb ? `Resi ${state.reconciled.awb} tersimpan.` : "Muat ulang untuk tindakan berikutnya."}
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

/**
 * T-281 (D-42) "Batalkan kiriman": Tenant Admin only, on Resi terbit or Menunggu pembayaran
 * (the page decides; the action re-checks everything). Destructive outline at rest; the dialog
 * names the consequence and needs the checkbox. The outcome stays on screen after the page
 * re-renders as Dibatalkan (`cancellable` false then renders only the outcome).
 */
export function CancelShipmentAction({ cancellable, publicReference, shipmentId }: {
  cancellable: boolean;
  publicReference: string;
  shipmentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [consented, setConsented] = useState(false);
  // The dialog closes on the answer; the outcome is announced on the rail.
  const [state, action, pending] = useActionState(async (previous: ShipmentCancelActionState, formData: FormData) => {
    const next = await cancelShipmentOnMengantar(previous, formData);
    setOpen(false);
    setConsented(false);
    return next;
  }, {} as ShipmentCancelActionState);
  const id = useId();
  const resultRef = useFocusOnResult(state.error ?? state.cancelled);

  const outcome = state.cancelled ? (
    <Alert ref={resultRef} role="status" tabIndex={-1}>
      <CircleCheck aria-hidden="true" className="text-ok" />
      <AlertTitle>{state.cancelled.already ? "Kiriman sudah dibatalkan sebelumnya" : "Kiriman dibatalkan di Mengantar"}</AlertTitle>
      <AlertDescription>Label tidak dapat dicetak lagi. Invoice yang sudah terbit tetap tersimpan.</AlertDescription>
    </Alert>
  ) : state.error ? (
    <Alert ref={resultRef} tabIndex={-1} variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Kiriman belum dibatalkan</AlertTitle>
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  ) : null;
  if (!cancellable) return state.cancelled ? <div className="border-t pt-3">{outcome}</div> : null;

  return (
    <div className="flex flex-col gap-3 border-t pt-3" data-slot="cancel-shipment">
      <AlertDialog onOpenChange={(next) => { if (!pending) setOpen(next); }} open={open}>
        <AlertDialogTrigger asChild>
          {/* Destructive outline: quiet at rest, the consequence is named in the dialog. */}
          <Button
            className="w-full border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
            type="button"
            variant="outline"
          >
            <XCircle aria-hidden="true" />Batalkan kiriman
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan kiriman <span className="font-mono">{publicReference}</span>?</AlertDialogTitle>
            <AlertDialogDescription>
              Pesanan dibatalkan di Mengantar dan tidak dapat diurungkan. Resi tidak bisa dipakai lagi; untuk mengirim paket ini, buat kiriman baru.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={action} aria-busy={pending} className="flex flex-col gap-4">
            <input name="shipmentId" type="hidden" value={shipmentId} />
            <ConsentCheck disabled={pending} id={`${id}-consent`} onChange={setConsented}>
              Saya paham pembatalan di Mengantar tidak dapat diurungkan.
            </ConsentCheck>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
              <Button disabled={pending || !consented} type="submit" variant="destructive">
                {pending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <XCircle aria-hidden="true" />}
                {pending ? "Membatalkan…" : "Ya, batalkan kiriman"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      {outcome}
    </div>
  );
}
