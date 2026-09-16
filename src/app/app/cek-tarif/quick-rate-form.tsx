"use client";

import { Calculator, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { checkShippingRates } from "@/app/app/cek-tarif/actions";
import { DestinationAreaSelector, type DestinationAreaOutlet } from "@/app/app/destination-area-selector";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldWidth } from "@/components/cms/cms-layouts";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIdr, formatWeight, formatWibDateTime } from "@/lib/label-format";

type RateState = Awaited<ReturnType<typeof checkShippingRates>>;

export function QuickRateForm({ outlets, canManageSettings, initialState = {}, initialStale = false }: { outlets: DestinationAreaOutlet[]; canManageSettings: boolean; initialState?: RateState; initialStale?: boolean }) {
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const [weight, setWeight] = useState("1000");
  const [stale, setStale] = useState(initialStale);
  const revision = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const outcome = useRef<HTMLDivElement>(null);
  const [state, action, pending] = useActionState(async (previous: RateState, data: FormData) => {
    const submittedRevision = revision.current;
    const result = await checkShippingRates(previous, data);
    if (submittedRevision !== revision.current) return {};
    setStale(false);
    return result;
  }, initialState);
  const visible = stale ? {} : state;
  function invalidate() { revision.current += 1; setStale(true); }
  useEffect(() => {
    if (state.quote || state.error) outcome.current?.focus();
    else if (state.fieldErrors) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  if (!outlets.length) return (
    <Alert>
      <AlertTitle>Siapkan outlet untuk cek tarif</AlertTitle>
      <AlertDescription className="grid gap-3">
        <p>{canManageSettings ? "Pilih pickup dan koneksi Mengantar di pengaturan outlet terlebih dahulu." : "Minta Tenant Admin menyiapkan pickup dan koneksi Mengantar outlet."}</p>
        {canManageSettings ? <Button asChild className="w-fit min-h-11" variant="outline"><Link href="/app/pengaturan/outlet">Buka pengaturan</Link></Button> : null}
      </AlertDescription>
    </Alert>
  );

  return (
    <div className="grid min-w-0 gap-6">
      <form ref={form} action={action} aria-busy={pending} className="max-w-2xl" onChange={invalidate}>
        <FieldGroup>
          <Field className={fieldWidth.lg} data-invalid={Boolean(visible.fieldErrors?.outletId)}>
            <FieldLabel htmlFor="rate-outlet">Outlet asal</FieldLabel>
            <Select disabled={pending} name="outletId" onValueChange={(value) => { setOutletId(value); invalidate(); }} value={outletId}>
              <SelectTrigger aria-describedby="rate-origin-hint" aria-invalid={Boolean(visible.fieldErrors?.outletId)} className="min-h-11 w-full" id="rate-outlet"><SelectValue /></SelectTrigger>
              <SelectContent>{outlets.map((outlet) => <SelectItem key={outlet.id} value={outlet.id}>{outlet.name}</SelectItem>)}</SelectContent>
            </Select>
            <FieldDescription id="rate-origin-hint">Area asal mengikuti pickup Mengantar pada outlet ini.</FieldDescription>
            <FieldError>{visible.fieldErrors?.outletId}</FieldError>
          </Field>
          <DestinationAreaSelector disabled={pending} error={visible.fieldErrors?.destinationAreaLabel} fixedOutletId={outletId} key={outletId} onSelectionChange={invalidate} outlets={outlets} required showSourceContext={false} />
          <Field className={fieldWidth.md} data-invalid={Boolean(visible.fieldErrors?.weightGrams)}>
            <FieldLabel htmlFor="rate-weight">Berat paket</FieldLabel>
            <div className="flex items-center gap-3">
              <Input aria-describedby="rate-weight-hint rate-weight-error" aria-invalid={Boolean(visible.fieldErrors?.weightGrams)} className="min-h-11" disabled={pending} id="rate-weight" inputMode="numeric" max={100000} min={1} name="weightGrams" onChange={(event) => setWeight(event.target.value)} required step={1} type="number" value={weight} />
              <span className="text-sm text-muted-foreground">gram</span>
            </div>
            <FieldDescription id="rate-weight-hint">1 kg = 1.000 gram. Maksimal 100 kg.</FieldDescription>
            <FieldError id="rate-weight-error">{visible.fieldErrors?.weightGrams}</FieldError>
          </Field>
          <Button className="min-h-11 w-full sm:w-fit" disabled={pending} type="submit">{pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Calculator aria-hidden="true" />}{pending ? "Memeriksa tarif…" : "Cek tarif"}</Button>
        </FieldGroup>
      </form>
      <div aria-live="polite" className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" ref={outcome} tabIndex={-1}>
        {stale && state.quote ? <p className="text-sm text-muted-foreground">Rute atau berat berubah. Cek tarif kembali untuk melihat estimasi terbaru.</p> : null}
        {visible.error ? <Alert variant="destructive"><AlertTitle>Tarif belum tersedia</AlertTitle><AlertDescription>{visible.error}</AlertDescription></Alert> : null}
        {visible.quote ? <QuickRateResults quote={visible.quote} /> : null}
      </div>
    </div>
  );
}

export function QuickRateResults({ quote }: { quote: NonNullable<RateState["quote"]> }) {
  return (
    <section aria-labelledby="rate-results-title" className="grid min-w-0 gap-3">
      <div>
        <h2 className="text-base font-semibold" id="rate-results-title">Estimasi ongkir</h2>
        <p className="mt-1 wrap-anywhere text-sm text-muted-foreground">{quote.originAreaLabel} → {quote.destinationAreaLabel} · {formatWeight(quote.weightGrams)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Diperiksa {formatWibDateTime(quote.retrievedAt)}</p>
      </div>
      {quote.services.length ? (
        <Table containerClassName="rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" containerProps={{ role: "region", tabIndex: 0, "aria-label": "Perbandingan estimasi ongkir" }}>
          <TableHeader><TableRow><TableHead>Layanan</TableHead><TableHead className="text-right">Estimasi ongkir</TableHead><TableHead>Estimasi tiba</TableHead><TableHead>COD</TableHead></TableRow></TableHeader>
          <TableBody>{quote.services.map((service) => <TableRow key={service.providerService}>
            <TableCell className="max-w-60 whitespace-normal break-words font-medium">{service.providerService}</TableCell>
            <TableCell className="text-right tabular-nums">{formatIdr(service.shippingAmountIdr)}</TableCell>
            <TableCell className="max-w-48 whitespace-normal wrap-anywhere">{service.deliveryEstimate || "Belum tersedia"}</TableCell>
            <TableCell><Badge variant="secondary">{service.codEligible ? "Tersedia" : "Tidak tersedia"}</Badge></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      ) : <Alert><AlertTitle>Belum ada layanan untuk rute ini</AlertTitle><AlertDescription>Coba area tujuan atau berat lain, lalu periksa kembali.</AlertDescription></Alert>}
      <p className="text-xs text-muted-foreground">Estimasi dari Mengantar. Biaya akhir mengikuti detail kiriman dan layanan yang dipilih.</p>
    </section>
  );
}
