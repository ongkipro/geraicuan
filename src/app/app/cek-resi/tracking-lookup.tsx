"use client";

import { ArrowRight, CircleAlert, Loader2, PackageSearch, Route, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { lookupShipmentTracking, type TrackingLookupState } from "@/app/app/cek-resi/actions";
import { MAX_TRACKING_KEY_LENGTH } from "@/app/app/cek-resi/lookup-key";
import { trackingTimeline, type TrackingResult } from "@/app/app/cek-resi/tracking-result-model";
import { CopyValueButton } from "@/app/app/pengiriman/[shipmentId]/copy-button";
import { CourierLogo } from "@/components/app/courier-logo";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { serviceDisplayName } from "@/lib/labels/courier";
import { areaDisplayCase, formatWibDateTime } from "@/lib/label-format";
import { presentShipmentPayment } from "@/lib/payment-method";
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
            <FieldLabel className="font-semibold" htmlFor="tracking-key">Nomor kiriman atau nomor resi (AWB)</FieldLabel>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative sm:flex-1">
                <PackageSearch aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-describedby="tracking-key-help tracking-key-error"
                  aria-invalid={invalid}
                  autoComplete="off"
                  className="pl-10 font-mono"
                  defaultValue={state.kind === "idle" ? "" : state.query}
                  disabled={pending}
                  id="tracking-key"
                  maxLength={MAX_TRACKING_KEY_LENGTH}
                  name="trackingKey"
                  placeholder="Contoh: GC-10058 atau 11LP1700187536"
                  ref={inputRef}
                  required
                  spellCheck={false}
                />
              </div>
              <Button disabled={pending} type="submit">
                {pending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <ScanSearch aria-hidden="true" />}
                {pending ? "Mencari…" : "Cek resi"}
              </Button>
            </div>
            <FieldDescription className="text-xs" id="tracking-key-help">Hanya kiriman milik gerai ini. Nomor tidak disimpan di alamat halaman.</FieldDescription>
            <div className="min-h-5"><FieldError id="tracking-key-error">{invalid ? INVALID_MESSAGE : null}</FieldError></div>
          </Field>
        </form>
      </Card>

      <div aria-live="polite" className="min-w-0 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50" ref={outcomeRef} tabIndex={-1}>
        {pending ? <TrackingResultSkeleton /> : null}
        {!pending && state.kind === "found" ? <TrackingResultCard result={state.result} /> : null}
        {!pending && state.kind === "missing" ? (
          <Card className="py-0">
            <EmptyState
              action={<Button asChild variant="outline"><Link href="/app/pengiriman">Buka histori kiriman</Link></Button>}
              description={<>Tidak ada kiriman gerai ini dengan nomor <span className="font-mono break-all">{state.query}</span>. Periksa kembali nomornya.</>}
              icon={PackageSearch}
              title="Kiriman tidak ditemukan"
            />
          </Card>
        ) : null}
        {!pending && state.kind === "limited" ? (
          <Alert role="alert" variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Terlalu banyak pencarian</AlertTitle>
            <AlertDescription>Pencarian dibatasi sementara. Tunggu beberapa menit, lalu coba lagi.</AlertDescription>
          </Alert>
        ) : null}
        {!pending && state.kind === "unavailable" ? (
          <Alert role="alert" variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Pencarian belum dapat dijalankan</AlertTitle>
            <AlertDescription>Akses gerai tidak tersedia. Muat ulang halaman, lalu coba lagi.</AlertDescription>
          </Alert>
        ) : null}
        {!pending && (state.kind === "idle" || state.kind === "invalid") ? (
          <Card className="border border-dashed border-input py-0 shadow-none">
            <EmptyState
              description="Masukkan nomor kiriman GeraiCUAN atau nomor resi kurir, lalu tekan Cek resi."
              icon={Route}
              title="Perjalanan paket muncul di sini"
            />
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/** Pending lookup: the shape of the result card, so the page does not jump when it arrives. */
function TrackingResultSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Mencari kiriman" className="gap-0 py-0" role="status">
      <div className="grid gap-2 border-b p-6 max-md:p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-64 max-w-full" />
      </div>
      <div className="grid gap-3 border-b p-6 max-md:p-4 sm:grid-cols-3">
        {[0, 1, 2].map((key) => <Skeleton className="h-16 rounded-xl" key={key} />)}
      </div>
      <div className="grid gap-4 p-6 max-md:p-4">
        {[0, 1, 2].map((key) => <Skeleton className="h-10" key={key} />)}
      </div>
    </Card>
  );
}

function Fact({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div className={cn("grid min-w-0 content-start gap-1 rounded-xl bg-tile p-4 max-sm:p-3", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-semibold text-foreground wrap-anywhere">{children}</dd>
    </div>
  );
}

export function TrackingResultCard({ result }: { result: TrackingResult }) {
  const timeline = trackingTimeline(result);
  const payment = presentShipmentPayment(result);
  const courier = result.courier ?? result.providerService;
  return (
    <Card aria-labelledby="hasil-cek-resi" className="gap-0 py-0" role="region">
      <div className="flex flex-col gap-3 border-b p-6 max-md:p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <p className="font-mono text-xs text-muted-foreground">{result.publicReference}</p>
          <div className="flex items-center gap-1">
            <h2 className="font-mono text-xl font-bold break-all" id="hasil-cek-resi">{result.awb ?? "Belum ada resi"}</h2>
            {result.awb ? <CopyValueButton label="nomor resi" value={result.awb} /> : null}
          </div>
          {result.returnAwb ? (
            <p className="text-sm text-muted-foreground">Resi retur <span className="font-mono font-semibold break-all text-foreground">{result.returnAwb}</span></p>
          ) : null}
        </div>
        <ShipmentStatusBadge className="self-start" status={result.status} />
      </div>
      <dl className="grid grid-cols-2 gap-3 border-b p-6 max-md:p-4 sm:grid-cols-3">
        <Fact label="Ekspedisi">
          <span className="flex flex-wrap items-center gap-2">
            {courier ? <CourierLogo className="h-5" courier={courier} decorative /> : null}
            {result.providerService ? serviceDisplayName(result.providerService) : "Belum ada layanan"}
          </span>
        </Fact>
        <Fact label="Pembayaran">
          <span className="flex flex-wrap items-baseline gap-x-2">
            {payment.label}
            {payment.amountIdr === null ? null : <Money amount={payment.amountIdr} />}
          </span>
          {payment.amountIdr === null ? null : <span className="block text-xs font-normal text-muted-foreground">{payment.amountLabel}</span>}
        </Fact>
        <Fact className="max-sm:col-span-2" label="Tujuan">{areaDisplayCase(result.destinationAreaLabel)}</Fact>
      </dl>
      <div className="grid gap-4 p-6 max-md:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-base font-semibold">Perjalanan paket</h3>
          <p className="text-xs text-muted-foreground">Terbaru di atas · waktu WIB</p>
        </div>
        <ol className="grid gap-5">
          {timeline.map((entry, index) => (
            <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3" key={`${entry.source}-${entry.at}-${index}`}>
              <span aria-hidden="true" className="flex flex-col items-center pt-0.5">
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 bg-card", index === 0 ? "border-primary ring-4 ring-accent" : "border-input")}>
                  {index === 0 ? <span className="size-2 rounded-full bg-primary" /> : null}
                </span>
                {index < timeline.length - 1 ? <span className="-mb-5 mt-1 w-0.5 flex-1 bg-border" /> : null}
              </span>
              <div className={cn("grid gap-0.5", index === 0 && "rounded-xl bg-tile-info p-3 -mt-2")}>
                <p className={cn("text-sm wrap-anywhere", index === 0 ? "font-semibold" : "font-medium")}>{entry.title}</p>
                <p className="text-xs text-muted-foreground">{formatWibDateTime(entry.at)} · {entry.source}</p>
                {entry.detail ? <p className="text-xs text-muted-foreground">{entry.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-2 border-t px-6 py-4 max-md:px-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Diperbarui {formatWibDateTime(result.updatedAtIso)}</p>
        <Link className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline max-md:min-h-11" href={shipmentDetailHref(result.publicReference)} prefetch={false}>
          Lihat rincian kiriman<ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </Card>
  );
}
