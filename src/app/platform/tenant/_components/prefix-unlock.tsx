"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { unlockShipmentPrefix, type ShipmentPrefixUnlockState } from "@/app/platform/tenant/shipment-prefix-actions";
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

/** Opens a locked shipment-number prefix once, behind a dialog that names the tenant and consequence. */
export function PrefixUnlock({ initialAttemptId, locked, tenantId, tenantName }: {
  initialAttemptId: string;
  locked: boolean;
  tenantId: string;
  tenantName: string;
}) {
  const [state, action, pending] = useActionState<ShipmentPrefixUnlockState, FormData>(unlockShipmentPrefix, {});
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.resultToken) resultRef.current?.focus();
  }, [state.resultToken]);

  return (
    <div className="flex flex-col gap-3">
      {state.message ? (
        <div className="outline-none" ref={resultRef} tabIndex={-1}>
          <Alert role={state.outcome === "success" ? "status" : "alert"} variant={state.outcome === "success" ? "default" : "destructive"}>
            <AlertTitle>{state.outcome === "success" ? "Kunci awalan dibuka" : "Kunci awalan belum dibuka"}</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <form action={action} ref={formRef}>
        <input name="tenantId" type="hidden" value={tenantId} />
        <input name="attemptId" type="hidden" value={state.resultToken ?? initialAttemptId} />
      </form>
      <AlertDialog onOpenChange={(next) => { if (!pending) setOpen(next); }} open={open}>
        <AlertDialogTrigger asChild>
          <Button className="w-fit" disabled={pending || !locked} type="button" variant="outline">
            {pending ? "Memproses…" : "Buka kunci awalan"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buka kunci awalan {tenantName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tenant Admin dapat memilih awalan baru satu kali. Semua nomor kiriman tenant ini akan tampil dengan awalan baru,
              sehingga label yang sudah tercetak tidak lagi sama dengan layar. Tindakan ini tercatat di jejak audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <Button onClick={() => { setOpen(false); formRef.current?.requestSubmit(); }} type="button">Buka kunci</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
