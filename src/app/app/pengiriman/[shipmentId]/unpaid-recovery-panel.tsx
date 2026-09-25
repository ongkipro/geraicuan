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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";

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
    <Card
      aria-busy={pending}
      aria-labelledby="pemulihan-pembayaran-heading"
      id="pemulihan-pembayaran"
      role="region"
    >
      <CardHeader>
        <CardTitle id="pemulihan-pembayaran-heading">Pulihkan pembayaran Mengantar</CardTitle>
        <CardDescription className="max-w-2xl leading-6">
          Danai saldo terlebih dahulu, lalu pulihkan batch penyedia yang sudah tersimpan satu kali.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-5">
        {!fixtureEnabled ? (
          <Alert>
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>Pemulihan dikunci</AlertTitle>
            <AlertDescription>Pemulihan hanya aktif dengan fixture non-produksi yang disetujui. Tidak ada transport penyedia eksternal dari kondisi ini.</AlertDescription>
          </Alert>
        ) : null}

        <form action={action} className="grid gap-4">
          <input name="shipmentId" type="hidden" value={shipmentId} />
          <FieldSet disabled={pending}>
            <FieldLegend variant="label">Konfirmasi pemulihan satu kali</FieldLegend>
            <Field className="max-w-2xl items-start" data-disabled={!fixtureEnabled || pending} orientation="horizontal">
              <input type="checkbox"
                className="mt-1 size-4 shrink-0 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!fixtureEnabled || pending}
                id="unpaid-recovery-confirmation"
                name="confirmation"
                required
                value="confirmed"
              />
              <FieldLabel className="font-normal leading-6" htmlFor="unpaid-recovery-confirmation">Saya sudah mendanai saldo Mengantar, meninjau status menunggu pembayaran, dan memahami bahwa pemulihan ini hanya boleh dijalankan satu kali.</FieldLabel>
            </Field>
          </FieldSet>
          <div className="flex border-t pt-4">
            <Button
              className="min-h-11 max-md:w-full md:min-h-8"
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
                  <Button asChild className="min-h-11 max-md:w-full md:min-h-8" size="sm" variant="outline"><Link href={shipment.labelHref}>Buka label 10 × 15 atau 10 × 10 cm</Link></Button>
                </li>
              ))}
            </ul></AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
