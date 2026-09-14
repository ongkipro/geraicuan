"use client";

import { useActionState } from "react";

import {
  checkStaleShipmentOperation,
  type ShipmentStaleOperationActionState,
} from "@/app/app/pengiriman/[shipmentId]/stale-operation-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const initialState: ShipmentStaleOperationActionState = {};

export function ShipmentStaleOperationPanel({ shipmentId }: { shipmentId: string }) {
  const [state, action, pending] = useActionState(checkStaleShipmentOperation, initialState);

  return (
    <Card>
      <form action={action} className="grid gap-4" id="periksa-upaya-tersendat">
        <input name="shipmentId" type="hidden" value={shipmentId} />
        <CardHeader>
          <CardTitle>Periksa upaya tersendat</CardTitle>
          <CardDescription className="max-w-2xl leading-6">Pemeriksaan ini hanya mengamankan state lokal yang melewati batas waktu. Tidak ada permintaan baru yang dikirim ke penyedia.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button className="min-h-11 justify-self-start max-md:w-full md:min-h-8" disabled={pending} type="submit" variant="outline">
            {pending ? "Memeriksa…" : "Periksa status aman"}
          </Button>
          {state.message ? <p aria-live="polite" className="text-sm text-muted-foreground" role="status">{state.message}</p> : null}
          {state.error ? <p aria-live="assertive" className="text-sm text-destructive" role="alert">{state.error}</p> : null}
        </CardContent>
      </form>
    </Card>
  );
}
