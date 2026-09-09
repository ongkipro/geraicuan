"use client";

import { useActionState } from "react";

import {
  checkStaleShipmentOperation,
  type ShipmentStaleOperationActionState,
} from "@/app/app/pengiriman/[shipmentId]/stale-operation-actions";
import { Button } from "@/components/ui/button";

const initialState: ShipmentStaleOperationActionState = {};

export function ShipmentStaleOperationPanel({ shipmentId }: { shipmentId: string }) {
  const [state, action, pending] = useActionState(checkStaleShipmentOperation, initialState);

  return (
    <form action={action} className="grid gap-3 rounded-lg border bg-muted/30 p-4" id="periksa-upaya-tersendat">
      <input name="shipmentId" type="hidden" value={shipmentId} />
      <div>
        <h2 className="font-medium">Periksa upaya tersendat</h2>
        <p className="max-w-2xl mt-1 text-sm leading-6 text-muted-foreground">Pemeriksaan ini hanya mengamankan state lokal yang melewati batas waktu. Tidak ada permintaan baru yang dikirim ke penyedia.</p>
      </div>
      <Button className="min-h-11 justify-self-start sm:min-h-9" disabled={pending} type="submit" variant="outline">
        {pending ? "Memeriksa…" : "Periksa status aman"}
      </Button>
      {state.message ? <p aria-live="polite" className="text-sm text-muted-foreground" role="status">{state.message}</p> : null}
      {state.error ? <p aria-live="assertive" className="text-sm text-destructive" role="alert">{state.error}</p> : null}
    </form>
  );
}
