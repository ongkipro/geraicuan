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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
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
    <Card aria-busy={pending} aria-labelledby="rekonsiliasi-pengiriman-heading" id="rekonsiliasi-pengiriman" role="region">
      <CardHeader>
        <CardTitle id="rekonsiliasi-pengiriman-heading">Rekonsiliasi hasil penyedia</CardTitle>
        <CardDescription className="max-w-2xl leading-6">Periksa hasil authoritative berdasarkan identifier yang sudah tersimpan. Tindakan ini tidak mengirim ulang pesanan.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {!fixtureEnabled ? <Alert><ShieldCheck aria-hidden="true" /><AlertTitle>Rekonsiliasi dikunci</AlertTitle><AlertDescription>Hanya fixture non-produksi yang disetujui dapat menjalankan pencocokan saat ini. Tidak ada transport penyedia eksternal dari kondisi ini.</AlertDescription></Alert> : null}
        <form action={action} className="grid gap-4">
          <input name="shipmentId" type="hidden" value={shipmentId} />
          <Field className="max-w-2xl items-start" data-disabled={!fixtureEnabled || pending} orientation="horizontal">
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" disabled={!fixtureEnabled || pending} id="reconciliation-confirmation" name="confirmation" required value="confirmed" />
            <FieldLabel className="font-normal leading-6" htmlFor="reconciliation-confirmation">Saya memahami rekonsiliasi hanya mencocokkan hasil yang sudah ada dan tidak boleh membuat atau mengirim ulang pesanan.</FieldLabel>
          </Field>
          <div className="flex border-t pt-4">
            <Button className="min-h-11 max-md:w-full md:min-h-8" disabled={!fixtureEnabled || pending} type="submit">{pending ? "Merekonsiliasi…" : "Konfirmasi rekonsiliasi"}</Button>
          </div>
        </form>
        {state.error ? <Alert aria-live="assertive" ref={resultRef} tabIndex={-1} variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Rekonsiliasi tidak berhasil</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert> : null}
        {state.reconciled ? <Alert aria-live="polite" ref={resultRef} tabIndex={-1}><ShieldCheck aria-hidden="true" /><AlertTitle>Hasil authoritative tersimpan: {resultLabel[state.reconciled.status]}</AlertTitle><AlertDescription>{state.reconciled.awb ? <>AWB {state.reconciled.awb} sudah tersimpan.{state.reconciled.labelHref ? <Button asChild className="mt-3 min-h-11 max-md:w-full md:min-h-8" size="sm" variant="outline"><Link href={state.reconciled.labelHref}>Buka label 100 × 150 mm</Link></Button> : null}</> : "Muat ulang detail untuk mengikuti tindakan lifecycle berikutnya."}</AlertDescription></Alert> : null}
      </CardContent>
    </Card>
  );
}
