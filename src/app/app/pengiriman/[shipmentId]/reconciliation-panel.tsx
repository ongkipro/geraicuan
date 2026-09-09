"use client";

import { CircleAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import {
  reconcileShipmentUnknownSubmission,
  type ShipmentReconciliationActionState,
} from "@/app/app/pengiriman/[shipmentId]/reconciliation-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";

const initialState: ShipmentReconciliationActionState = {};
// Reconciliation reports the lifecycle status the provider resolved to, so it
// reads from the shared presentation rather than a sixth private copy.
const resultLabel = {
  AWAITING_UPSTREAM_PAYMENT: SHIPMENT_STATUS_PRESENTATION.AWAITING_UPSTREAM_PAYMENT.label,
  FAILED: SHIPMENT_STATUS_PRESENTATION.FAILED.label,
  ISSUED: SHIPMENT_STATUS_PRESENTATION.ISSUED.label,
} as const;

export function ShipmentReconciliationPanel({ fixtureEnabled, shipmentId }: { fixtureEnabled: boolean; shipmentId: string }) {
  const [state, action, pending] = useActionState(reconcileShipmentUnknownSubmission, initialState);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.error || state.reconciled) resultRef.current?.focus();
  }, [state]);

  return (
    <section aria-busy={pending} aria-labelledby="rekonsiliasi-pengiriman-heading" className="grid gap-5 rounded-lg border bg-card p-4 sm:p-5" id="rekonsiliasi-pengiriman">
      <div><h2 className="font-medium" id="rekonsiliasi-pengiriman-heading">Rekonsiliasi hasil penyedia</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Periksa hasil authoritative berdasarkan identifier yang sudah tersimpan. Tindakan ini tidak mengirim ulang pesanan.</p></div>
      {!fixtureEnabled ? <Alert><ShieldCheck aria-hidden="true" /><AlertTitle>Rekonsiliasi dikunci</AlertTitle><AlertDescription>Hanya fixture non-produksi yang disetujui dapat menjalankan pencocokan saat ini. Tidak ada transport penyedia eksternal dari kondisi ini.</AlertDescription></Alert> : null}
      <form action={action} className="grid gap-4">
        <input name="shipmentId" type="hidden" value={shipmentId} />
        <label className="flex max-w-2xl items-start gap-3 text-sm leading-6">
          <input className="relative mt-1 size-4 shrink-0 accent-primary after:absolute after:-inset-3" disabled={!fixtureEnabled || pending} name="confirmation" required type="checkbox" value="confirmed" />
          <span>Saya memahami rekonsiliasi hanya mencocokkan hasil yang sudah ada dan tidak boleh membuat atau mengirim ulang pesanan.</span>
        </label>
        <Button className="min-h-11 w-fit sm:min-h-9" disabled={!fixtureEnabled || pending} type="submit">{pending ? "Merekonsiliasi…" : "Konfirmasi rekonsiliasi"}</Button>
      </form>
      {state.error ? <Alert aria-live="assertive" ref={resultRef} tabIndex={-1} variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Rekonsiliasi tidak berhasil</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      {state.reconciled ? <Alert aria-live="polite" ref={resultRef} tabIndex={-1}><ShieldCheck aria-hidden="true" /><AlertTitle>Hasil authoritative tersimpan: {resultLabel[state.reconciled.status]}</AlertTitle><AlertDescription>{state.reconciled.awb ? <>AWB {state.reconciled.awb} sudah tersimpan.{state.reconciled.labelHref ? <Button asChild className="mt-3" size="sm" variant="outline"><Link href={state.reconciled.labelHref}>Buka label 100 × 150 mm</Link></Button> : null}</> : "Muat ulang detail untuk mengikuti tindakan lifecycle berikutnya."}</AlertDescription></Alert> : null}
    </section>
  );
}
