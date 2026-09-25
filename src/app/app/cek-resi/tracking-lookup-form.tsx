"use client";

import { Loader2, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { lookupShipmentTracking, type TrackingLookupState } from "@/app/app/cek-resi/actions";
import { MAX_TRACKING_KEY_LENGTH } from "@/app/app/cek-resi/lookup-key";
import { CourierLogo } from "@/components/cms/courier-logo";
import { DefinitionGrid } from "@/components/cms/detail-section";
import { PaymentStack } from "@/components/cms/shipment-table-cells";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { serviceDisplayName } from "@/lib/labels/courier";
import { providerOrderStatusLabel } from "@/lib/labels/finance";
import { areaDisplayCase, formatWibDateTime } from "@/lib/label-format";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import { shipmentDetailHref } from "@/lib/shipment-number";

const INVALID_MESSAGE =
  "Masukkan nomor kiriman GeraiCUAN (contoh 10013 atau GC-10013) atau nomor resi yang diterbitkan tenant ini.";

export function TrackingLookupForm({ initialState = { kind: "idle" } }: {
  initialState?: TrackingLookupState;
}) {
  const [state, action, pending] = useActionState(lookupShipmentTracking, initialState);
  const outcome = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const invalid = state.kind === "invalid";

  useEffect(() => {
    if (state.kind === "invalid") input.current?.focus();
    else if (state.kind !== "idle") outcome.current?.focus();
  }, [state]);

  return (
    <div className="grid min-w-0 gap-6">
      {/* T-206 (owner reference cek-resi.html): the lookup is one card — label, field and the one primary on a row. */}
      <Card>
        <CardContent>
          <form action={action} aria-busy={pending}>
            <Field data-invalid={invalid}>
              <FieldLabel htmlFor="tracking-key">Nomor kiriman atau nomor resi</FieldLabel>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  aria-describedby="tracking-key-hint tracking-key-error"
                  aria-invalid={invalid}
                  autoComplete="off"
                  className="min-h-11 flex-1 font-mono"
                  defaultValue={state.kind === "idle" ? "" : state.query}
                  disabled={pending}
                  id="tracking-key"
                  maxLength={MAX_TRACKING_KEY_LENGTH}
                  name="trackingKey"
                  placeholder="Contoh: GC-10013"
                  ref={input}
                  required
                  spellCheck={false}
                  type="text"
                />
                <Button className="min-h-11 w-full sm:w-fit" disabled={pending} type="submit">
                  {pending
                    ? <Loader2 aria-hidden="true" className="animate-spin" />
                    : <ScanSearch aria-hidden="true" />}
                  {pending ? "Mencari kiriman…" : "Cek resi"}
                </Button>
              </div>
              <FieldDescription id="tracking-key-hint">Hanya kiriman milik tenant ini yang dapat dilacak.</FieldDescription>
              <FieldError id="tracking-key-error">{invalid ? INVALID_MESSAGE : null}</FieldError>
            </Field>
          </form>
        </CardContent>
      </Card>

      <div
        aria-live="polite"
        className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ref={outcome}
        tabIndex={-1}
      >
        {state.kind === "idle" ? (
          <p className="text-sm text-muted-foreground">Belum ada pencarian.</p>
        ) : null}
        {state.kind === "missing" ? (
          <Alert>
            <AlertTitle>Kiriman tidak ditemukan</AlertTitle>
            <AlertDescription>
              Tidak ada kiriman tenant ini dengan nomor tersebut. Periksa kembali nomornya, atau cari lewat histori kiriman.
            </AlertDescription>
          </Alert>
        ) : null}
        {state.kind === "limited" ? (
          <Alert role="alert" variant="destructive">
            <AlertTitle>Terlalu banyak pencarian</AlertTitle>
            <AlertDescription>
              Pencarian dibatasi sementara. Tunggu beberapa menit lalu coba lagi.
            </AlertDescription>
          </Alert>
        ) : null}
        {state.kind === "unavailable" ? (
          <Alert role="alert" variant="destructive">
            <AlertTitle>Pencarian belum dapat dijalankan</AlertTitle>
            <AlertDescription>Akses tenant tidak tersedia. Muat ulang halaman lalu coba lagi.</AlertDescription>
          </Alert>
        ) : null}
        {state.kind === "found" ? <TrackingResult result={state.result} /> : null}
      </div>
    </div>
  );
}

function TrackingResult({ result }: { result: Extract<TrackingLookupState, { kind: "found" }>["result"] }) {
  const status = SHIPMENT_STATUS_PRESENTATION[result.status];
  return (
    // T-206 (owner reference): the resi leads the result — number, courier and status on one band.
    <Card aria-labelledby="hasil-cek-resi-heading" role="region">
      <CardHeader className="border-b">
        <CardTitle className="grid gap-1" id="hasil-cek-resi-heading">
          <span className="text-sm font-normal text-muted-foreground">Kiriman <span className="font-mono">{result.publicReference}</span></span>
          <span className="font-mono text-xl font-bold break-all">{result.awb ?? "Belum ada resi"}</span>
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          {result.providerService ? (
            <>
              <span aria-hidden="true" className="inline-flex"><CourierLogo className="h-5" courier={result.courier ?? result.providerService} /></span>
              {serviceDisplayName(result.providerService)}
            </>
          ) : "Belum ada layanan penyedia"}
        </CardDescription>
        <CardAction><ShipmentStatusBadge label={status.label} tone={status.tone} /></CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm font-medium leading-6">{status.guidance}</p>
        <DefinitionGrid items={[
          {
            label: "Status penyedia terakhir",
            value: result.observation
              ? `${providerOrderStatusLabel(result.observation.providerStatus)} · ${formatWibDateTime(result.observation.observedAtIso)}`
              : "Belum ada pembaruan status dari penyedia",
          },
          { label: "Area tujuan", value: areaDisplayCase(result.destinationAreaLabel) },
          { label: "Pembayaran", value: <PaymentStack facts={result} /> },
          { label: "Aktivitas terakhir", value: formatWibDateTime(result.updatedAtIso) },
        ]} />
        <Button asChild className="min-h-11 w-full sm:w-fit md:min-h-10" variant="outline">
          <Link href={shipmentDetailHref(result.publicReference)} prefetch={false}>
            Buka detail kiriman
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
