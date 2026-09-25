"use client";

import { ArrowRight, CircleAlert, Loader2, PackageSearch, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { lookupShipmentTracking, type TrackingLookupState } from "@/app/app/cek-resi/actions";
import { MAX_TRACKING_KEY_LENGTH } from "@/app/app/cek-resi/lookup-key";
import { trackingSummaryLine, trackingTimeline, type TrackingResult } from "@/app/app/cek-resi/tracking-result-model";
import { CourierLogo } from "@/components/app/courier-logo";
import { EmptyState } from "@/components/app/empty-state";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatWibDateTime } from "@/lib/label-format";
import { shipmentDetailHref } from "@/lib/shipment-number";
import { cn } from "@/lib/utils";

const INVALID_MESSAGE = "Masukkan nomor kiriman (contoh GC-10013) atau nomor resi kurir.";

/**
 * Spec 17 `/app/cek-resi` (ref cek-resi.html): one card with the field and the one primary
 * "Cek resi", then the outcome — result card, not found, or rate limited.
 */
export function TrackingLookup({ initialState = { kind: "idle" } }: { initialState?: TrackingLookupState }) {
  const [state, action, pending] = useActionState(lookupShipmentTracking, initialState);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const invalid = state.kind === "invalid";

  const shownState = useRef(state);
  useEffect(() => {
    // Only a lookup the user ran moves focus; the state the page arrived with does not.
    if (shownState.current === state) return;
    shownState.current = state;
    if (state.kind === "invalid") inputRef.current?.focus();
    else if (state.kind !== "idle") outcomeRef.current?.focus();
  }, [state]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Card className="px-6 max-md:px-4">
        <form action={action} aria-busy={pending} noValidate>
          <Field className="gap-2" data-invalid={invalid}>
            <FieldLabel className="font-semibold" htmlFor="tracking-key">Nomor kiriman atau nomor resi</FieldLabel>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                aria-describedby="tracking-key-error"
                aria-invalid={invalid}
                autoComplete="off"
                className="font-mono sm:flex-1"
                defaultValue={state.kind === "idle" ? "" : state.query}
                id="tracking-key"
                maxLength={MAX_TRACKING_KEY_LENGTH}
                name="trackingKey"
                placeholder="Contoh: GC-10058 atau 11LP1700187536"
                ref={inputRef}
                required
                spellCheck={false}
              />
              <Button disabled={pending} type="submit">
                {pending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <ScanSearch aria-hidden="true" />}
                {pending ? "Mencari…" : "Cek resi"}
              </Button>
            </div>
            <div className="min-h-5"><FieldError id="tracking-key-error">{invalid ? INVALID_MESSAGE : null}</FieldError></div>
          </Field>
        </form>
      </Card>

      <div aria-live="polite" className="min-w-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50" ref={outcomeRef} tabIndex={-1}>
        {state.kind === "found" ? <TrackingResultCard result={state.result} /> : null}
        {state.kind === "missing" ? (
          <Card className="py-0">
            <EmptyState
              action={<Button asChild variant="outline"><Link href="/app/pengiriman">Buka histori kiriman</Link></Button>}
              description={<>Tidak ada kiriman gerai ini dengan nomor <span className="font-mono">{state.query}</span>. Periksa kembali nomornya.</>}
              icon={PackageSearch}
              title="Kiriman tidak ditemukan"
            />
          </Card>
        ) : null}
        {state.kind === "limited" ? (
          <Alert role="alert" variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Terlalu banyak pencarian</AlertTitle>
            <AlertDescription>Pencarian dibatasi sementara. Tunggu beberapa menit, lalu coba lagi.</AlertDescription>
          </Alert>
        ) : null}
        {state.kind === "unavailable" ? (
          <Alert role="alert" variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Pencarian belum dapat dijalankan</AlertTitle>
            <AlertDescription>Akses gerai tidak tersedia. Muat ulang halaman, lalu coba lagi.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

export function TrackingResultCard({ result }: { result: TrackingResult }) {
  const timeline = trackingTimeline(result);
  return (
    <Card aria-labelledby="hasil-cek-resi" className="gap-0 py-0" role="region">
      <div className="flex flex-col gap-3 border-b p-6 max-md:p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-0.5">
          <p className="font-mono text-xs text-muted-foreground">{result.publicReference}</p>
          <h2 className="font-mono text-xl font-bold break-all" id="hasil-cek-resi">{result.awb ?? "Belum ada resi"}</h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {result.courier || result.providerService ? <CourierLogo className="h-5" courier={result.courier ?? result.providerService ?? ""} decorative /> : null}
            {trackingSummaryLine(result)}
          </p>
        </div>
        <ShipmentStatusBadge status={result.status} />
      </div>
      <div className="grid gap-4 p-6 max-md:p-4">
        <h3 className="text-sm font-semibold">Perjalanan paket</h3>
        <ol className="grid gap-5">
          {timeline.map((entry, index) => (
            <li className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3" key={`${entry.source}-${entry.at}`}>
              <span aria-hidden="true" className="flex flex-col items-center pt-0.5">
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border-2 bg-card", index === 0 ? "border-primary" : "border-input")}>
                  {index === 0 ? <span className="size-1.5 rounded-full bg-primary" /> : null}
                </span>
                {index < timeline.length - 1 ? <span className="-mb-5 mt-1 w-0.5 flex-1 bg-border" /> : null}
              </span>
              <div className="grid gap-0.5">
                <p className={cn("text-sm", index === 0 ? "font-semibold" : "font-medium")}>{entry.title}</p>
                <p className="text-xs text-muted-foreground">{formatWibDateTime(entry.at)} · {entry.source}</p>
                {entry.detail ? <p className="text-xs text-muted-foreground">{entry.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex justify-end border-t px-6 py-4 max-md:px-4">
        <Link className="inline-flex min-h-6 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline" href={shipmentDetailHref(result.publicReference)} prefetch={false}>
          Lihat rincian kiriman<ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </Card>
  );
}
