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

const lockedFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export function ShipmentPrefixUnlockControl({ initialAttemptId, state: prefixState, tenantId, tenantName }: {
  initialAttemptId: string;
  state: { prefix: string; lockedAt: Date | null } | null;
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
    <section aria-labelledby="shipment-prefix-unlock-title" className="grid gap-3">
      <div>
        <h2 className="font-semibold" id="shipment-prefix-unlock-title">Awalan nomor kiriman</h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Awalan dikunci sekali oleh tenant. Buka kunci hanya untuk memperbaiki kesalahan; tindakan tercatat di audit.</p>
      </div>
      <p className="text-sm" role="status">
        {prefixState === null
          ? "Status awalan tidak dapat dimuat."
          : prefixState.lockedAt
            ? <>Awalan saat ini <span className="font-mono font-semibold">{prefixState.prefix}-</span> · terkunci sejak {lockedFormatter.format(prefixState.lockedAt)} WIB</>
            : <>Awalan saat ini <span className="font-mono font-semibold">{prefixState.prefix}-</span> · belum terkunci; tenant masih dapat memilih.</>}
      </p>
      {state.message ? (
        <Alert ref={resultRef} role={state.outcome === "success" ? "status" : "alert"} tabIndex={-1} variant={state.outcome === "success" ? "default" : "destructive"}>
          <AlertTitle>{state.outcome === "success" ? "Kunci dibuka" : "Kunci belum dibuka"}</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <form action={action} ref={formRef}>
        <input name="tenantId" type="hidden" value={tenantId} />
        <input name="attemptId" type="hidden" value={state.resultToken ?? initialAttemptId} />
        <AlertDialog onOpenChange={setOpen} open={open}>
          <AlertDialogTrigger asChild>
            <Button className="min-h-11 md:min-h-10 w-fit" disabled={pending || !prefixState?.lockedAt} type="button" variant="outline">{pending ? "Memproses…" : "Buka kunci awalan"}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Buka kunci awalan {tenantName}?</AlertDialogTitle>
              <AlertDialogDescription>Tenant Admin dapat memilih awalan baru satu kali. Semua nomor kiriman tenant ini akan tampil dengan awalan baru, sehingga label yang sudah tercetak tidak lagi sama dengan layar.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11 md:min-h-10">Batal</AlertDialogCancel>
              <Button className="min-h-11 md:min-h-10" onClick={() => { setOpen(false); formRef.current?.requestSubmit(); }} type="button">Buka kunci</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </form>
    </section>
  );
}
