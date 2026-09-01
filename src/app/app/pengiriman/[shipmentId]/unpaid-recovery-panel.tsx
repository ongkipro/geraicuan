"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { CircleAlert, ShieldCheck } from "lucide-react";

import {
  recoverShipmentUnpaidPayment,
  type ShipmentUnpaidRecoveryActionState,
} from "@/app/app/pengiriman/[shipmentId]/unpaid-recovery-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type ShipmentUnpaidRecoveryPanelProps = {
  fixtureEnabled: boolean;
  shipmentId: string;
};

const initialState: ShipmentUnpaidRecoveryActionState = {};

export function ShipmentUnpaidRecoveryPanel({
  fixtureEnabled,
  shipmentId,
}: ShipmentUnpaidRecoveryPanelProps) {
  const [state, action, pending] = useActionState(
    recoverShipmentUnpaidPayment,
    initialState,
  );
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.error || state.recovered) resultRef.current?.focus();
  }, [state]);

  return (
    <section
      aria-busy={pending}
      aria-labelledby="pemulihan-pembayaran-heading"
      className="grid gap-5 rounded-lg border bg-card p-4 sm:p-5"
      id="pemulihan-pembayaran"
    >
      <div>
        <h2 className="font-medium" id="pemulihan-pembayaran-heading">Pulihkan pembayaran Mengantar</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Danai saldo terlebih dahulu, lalu pulihkan batch penyedia yang sudah tersimpan satu kali.
        </p>
      </div>

      {!fixtureEnabled ? (
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Pemulihan dikunci</AlertTitle>
          <AlertDescription>Pemulihan hanya aktif dengan fixture non-produksi yang disetujui. Tidak ada transport penyedia eksternal dari kondisi ini.</AlertDescription>
        </Alert>
      ) : null}

      <form action={action} className="grid gap-4">
        <input name="shipmentId" type="hidden" value={shipmentId} />
        <fieldset className="grid gap-3" disabled={pending}>
          <legend className="text-sm font-medium">Konfirmasi pemulihan satu kali</legend>
          <label className="flex max-w-2xl items-start gap-3 text-sm leading-6">
            <input className="relative mt-1 size-4 shrink-0 accent-primary after:absolute after:-inset-3"
              disabled={!fixtureEnabled || pending}
              name="confirmation"
              required
              type="checkbox"
              value="confirmed"
            />
            <span>Saya sudah mendanai saldo Mengantar, meninjau status menunggu pembayaran, dan memahami bahwa pemulihan ini hanya boleh dijalankan satu kali.</span>
          </label>
        </fieldset>
        <div>
          <Button
            className="min-h-11 sm:min-h-9"
            disabled={!fixtureEnabled || pending}
            type="submit"
          >
            {pending ? "Memulihkan pembayaran…" : "Konfirmasi dan pulihkan"}
          </Button>
        </div>
      </form>

      {state.error ? (
        <Alert aria-live="assertive" ref={resultRef} tabIndex={-1} variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Pemulihan tidak berhasil</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {state.recovered ? (
        <Alert aria-live="polite" ref={resultRef} tabIndex={-1}>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>
            {state.recovered.duplicate
              ? "Batch sudah dipulihkan sebelumnya; tidak ada pembayaran kedua."
              : "Pembayaran dipulihkan dan AWB penyedia sudah tersimpan."}
          </AlertTitle>
          <AlertDescription><ul className="mt-2 grid gap-2">
            {state.recovered.shipments.map((shipment) => (
              <li className="flex flex-wrap items-center gap-2" key={shipment.shipmentId}>
                <strong>AWB {shipment.awb}</strong>{" "}
                <Button asChild size="sm" variant="outline"><Link href={shipment.labelHref}>Buka label 100 × 150 mm</Link></Button>
              </li>
            ))}
          </ul></AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
