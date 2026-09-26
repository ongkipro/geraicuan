"use client";

import { CircleAlert, Loader2, RefreshCw } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { loadShipmentEstimate, type ShipmentEstimateActionState } from "@/app/app/estimate-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * T-211 step 2 "Cek tarif": right after "Simpan & cek tarif" the saved draft asks Mengantar for
 * one estimate, once (spec 17 §UX-v3.4). Success redirects back here with the snapshot; failure
 * keeps the draft and offers "Coba lagi".
 */
export function EstimateLoader({ autoLoad, shipmentId }: { autoLoad: boolean; shipmentId: string }) {
  const [state, action, pending] = useActionState(loadShipmentEstimate, {} as ShipmentEstimateActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const requested = useRef(false);
  useEffect(() => {
    if (!autoLoad || requested.current) return;
    requested.current = true;
    formRef.current?.requestSubmit();
  }, [autoLoad]);
  const failed = Boolean(state.error || state.unconfigured);
  const loading = pending || (autoLoad && !failed);

  return (
    <form action={action} className="flex flex-col gap-4" ref={formRef}>
      <input name="shipmentId" type="hidden" value={shipmentId} />
      {failed ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Tarif belum dapat dimuat</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>{state.unconfigured ? "Koneksi Mengantar outlet ini belum siap. Hubungi pemilik gerai." : state.error} Draf tetap tersimpan.</span>
            <Button disabled={pending} type="submit" variant="outline">
              <RefreshCw aria-hidden="true" className={pending ? "animate-spin" : undefined} />
              {pending ? "Memuat tarif…" : "Coba lagi"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <div aria-busy="true" className="flex flex-col gap-3" role="status">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="size-4 animate-spin" />Memuat tarif Mengantar…</p>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-6">
            {Array.from({ length: 9 }, (_, index) => <Skeleton className="h-17 rounded-lg" key={index} />)}
          </div>
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ) : (
        <Button className="self-start" disabled={pending} type="submit" variant="outline">
          <RefreshCw aria-hidden="true" />Cek tarif
        </Button>
      )}
    </form>
  );
}

/** "Muat ulang tarif" beside the section 5 heading once services are shown. */
export function EstimateRefreshButton({ shipmentId }: { shipmentId: string }) {
  const [state, action, pending] = useActionState(loadShipmentEstimate, {} as ShipmentEstimateActionState);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input name="shipmentId" type="hidden" value={shipmentId} />
      <Button className="h-10 px-0 font-semibold max-md:h-11" disabled={pending} type="submit" variant="link">
        <RefreshCw aria-hidden="true" className={pending ? "animate-spin" : undefined} />
        {pending ? "Memuat tarif…" : "Muat ulang tarif"}
      </Button>
      {state.error || state.unconfigured ? (
        <p className="text-xs text-destructive" role="alert">{state.unconfigured ? "Koneksi Mengantar belum siap." : state.error}</p>
      ) : null}
    </form>
  );
}
