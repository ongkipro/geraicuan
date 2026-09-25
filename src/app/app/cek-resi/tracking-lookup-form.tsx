"use client";

import { Loader2, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { lookupShipmentTracking, type TrackingLookupState } from "@/app/app/cek-resi/actions";
import { MAX_TRACKING_KEY_LENGTH } from "@/app/app/cek-resi/lookup-key";
import { DefinitionGrid } from "@/components/cms/detail-section";
import { PaymentStack } from "@/components/cms/shipment-table-cells";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatWibDateTime } from "@/lib/label-format";
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
      <form action={action} aria-busy={pending} className="max-w-2xl">
        <FieldGroup>
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor="tracking-key">Nomor kiriman atau nomor resi</FieldLabel>
            <Input
              aria-describedby="tracking-key-hint tracking-key-error"
              aria-invalid={invalid}
              autoComplete="off"
              className="min-h-11 font-mono"
              defaultValue={state.kind === "idle" ? "" : state.query}
              disabled={pending}
              id="tracking-key"
              maxLength={MAX_TRACKING_KEY_LENGTH}
              name="trackingKey"
              ref={input}
              required
              spellCheck={false}
              type="text"
            />
            <FieldDescription id="tracking-key-hint">
              Hanya kiriman milik tenant ini yang dapat dilacak. Nomor resi kurir dari luar tenant tidak dikenali.
            </FieldDescription>
            <FieldError id="tracking-key-error">{invalid ? INVALID_MESSAGE : null}</FieldError>
          </Field>
          <Button className="ios-btn-primary min-h-11 w-full sm:w-fit" disabled={pending} type="submit">
            {pending
              ? <Loader2 aria-hidden="true" className="animate-spin" />
              : <ScanSearch aria-hidden="true" />}
            {pending ? "Mencari kiriman…" : "Cek resi"}
          </Button>
        </FieldGroup>
      </form>

      <div
        aria-live="polite"
        className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ref={outcome}
        tabIndex={-1}
      >
        {state.kind === "idle" ? (
          <p className="max-w-2xl rounded-lg border border-dashed bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            Belum ada pencarian. Masukkan nomor kiriman atau nomor resi untuk melihat status terakhirnya.
          </p>
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
    <Card aria-labelledby="hasil-cek-resi-heading" className="ios-glass-card rounded-2xl border-border/60 shadow-xs" role="region">
      <CardHeader>
        <CardTitle id="hasil-cek-resi-heading">
          Kiriman <span className="font-mono">{result.publicReference}</span>
        </CardTitle>
        <CardDescription className="leading-6">{status.guidance}</CardDescription>
        <CardAction><ShipmentStatusBadge label={status.label} tone={status.tone} /></CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <DefinitionGrid items={[
          {
            label: "Status penyedia terakhir",
            value: result.observation
              ? `${result.observation.providerStatus} · ${formatWibDateTime(result.observation.observedAtIso)}`
              : "Belum ada pembaruan status dari penyedia",
          },
          { label: "Area tujuan", value: result.destinationAreaLabel },
          {
            label: "Kurir / layanan",
            value: result.providerService
              ? `${result.courier ?? "—"} · ${result.providerService}`
              : "Belum ada layanan penyedia",
          },
          { label: "Nomor resi", value: result.awb ?? "Belum tersedia" },
          { label: "Pembayaran", value: <PaymentStack facts={result} /> },
          { label: "Aktivitas terakhir", value: formatWibDateTime(result.updatedAtIso) },
        ]} />
        <Button asChild className="min-h-11 w-full sm:w-fit md:min-h-8" size="sm" variant="outline">
          <Link href={shipmentDetailHref(result.publicReference)} prefetch={false}>
            Buka detail kiriman
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
