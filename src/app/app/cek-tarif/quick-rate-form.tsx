"use client";

import { Calculator, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { checkShippingRates } from "@/app/app/cek-tarif/actions";
import { DestinationAreaSelector, type DestinationAreaOutlet } from "@/app/app/destination-area-selector";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldWidth, FieldRow } from "@/components/cms/cms-layouts";
import { CourierLogo } from "@/components/cms/courier-logo";
import { ToneBadge } from "@/components/cms/shipment-status-badge";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { CharacterClassHint, useCharacterClass } from "@/components/ui/character-class-input";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deliveryEstimateLabel, serviceDisplayName } from "@/lib/labels/courier";
import { courierDisplayName, mengantarCourierOfService } from "@/lib/mengantar-couriers";
import { areaDisplayCase, formatIdr, formatWeight, formatWibDateTime } from "@/lib/label-format";

type RateState = Awaited<ReturnType<typeof checkShippingRates>>;

export function QuickRateForm({ outlets, canManageSettings, initialState = {}, initialStale = false }: { outlets: DestinationAreaOutlet[]; canManageSettings: boolean; initialState?: RateState; initialStale?: boolean }) {
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const [weight, setWeight] = useState("1000");
  // T-196: grams are typed as digits only.
  const { hint: weightHint, ...weightLock } = useCharacterClass<HTMLInputElement>("NUMERIC_INTEGER", {
    onChange: (event) => setWeight(event.target.value),
  });
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
      {/* T-206 (owner reference cek-tarif.html): the route and weight form is one card; its footer holds the one primary. */}
      <Card>
        <CardContent>
      <form ref={form} action={action} aria-busy={pending} onChange={invalidate}>
        <FieldGroup>
          <FieldRow>
          <Field className={fieldWidth.lg} data-invalid={Boolean(visible.fieldErrors?.outletId)}>
            <FieldLabel htmlFor="rate-outlet">Outlet asal</FieldLabel>
            <Select disabled={pending} name="outletId" onValueChange={(value) => { setOutletId(value); invalidate(); }} value={outletId}>
              <SelectTrigger aria-describedby="rate-origin-hint" aria-invalid={Boolean(visible.fieldErrors?.outletId)} className="min-h-11 w-full" id="rate-outlet"><SelectValue /></SelectTrigger>
              <SelectContent>{outlets.map((outlet) => <SelectItem key={outlet.id} value={outlet.id}>{outlet.name}</SelectItem>)}</SelectContent>
            </Select>
            <FieldDescription id="rate-origin-hint">Area asal mengikuti pickup Mengantar pada outlet ini.</FieldDescription>
            <FieldError>{visible.fieldErrors?.outletId}</FieldError>
          </Field>
          <Field className={fieldWidth.md} data-invalid={Boolean(visible.fieldErrors?.weightGrams)}>
            <FieldLabel htmlFor="rate-weight">Berat paket</FieldLabel>
            <div className="flex items-center gap-3">
              <Input aria-describedby="rate-weight-hint rate-weight-error" aria-invalid={Boolean(visible.fieldErrors?.weightGrams)} className="min-h-11" data-character-class="NUMERIC_INTEGER" disabled={pending} id="rate-weight" name="weightGrams" {...weightLock} required type="text" value={weight} />
              <span className="text-sm text-muted-foreground">gram</span>
            </div>
            <CharacterClassHint hint={weightHint} id="rate-weight" />
            <FieldDescription id="rate-weight-hint">1 kg = 1.000 gram. Maksimal 100 kg.</FieldDescription>
            <FieldError id="rate-weight-error">{visible.fieldErrors?.weightGrams}</FieldError>
          </Field>
          </FieldRow>
          <DestinationAreaSelector disabled={pending} error={visible.fieldErrors?.destinationAreaLabel} fixedOutletId={outletId} key={outletId} onSelectionChange={invalidate} outlets={outlets} required showSourceContext={false} />
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Estimasi dari Mengantar; tidak membuat kiriman.</p>
            <Button className="min-h-11 w-full sm:w-fit" disabled={pending} type="submit">{pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Calculator aria-hidden="true" />}{pending ? "Memeriksa tarif…" : "Cek tarif"}</Button>
          </div>
        </FieldGroup>
      </form>
        </CardContent>
      </Card>
      <div aria-live="polite" className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" ref={outcome} tabIndex={-1}>
        {stale && state.quote ? <p className="text-sm text-muted-foreground">Rute atau berat berubah. Cek tarif kembali untuk melihat estimasi terbaru.</p> : null}
        {visible.error ? <Alert variant="destructive"><AlertTitle>Tarif belum tersedia</AlertTitle><AlertDescription>{visible.error}</AlertDescription></Alert> : null}
        {visible.quote ? <QuickRateResults quote={visible.quote} /> : null}
      </div>
    </div>
  );
}

/** The courier a quoted service belongs to, or the service itself when no known courier claims it. */
function courierOf(providerService: string) {
  return mengantarCourierOfService(providerService) ?? providerService;
}

export function QuickRateResults({ quote }: { quote: NonNullable<RateState["quote"]> }) {
  // T-206 (owner reference komponen-kurir.html): courier chips narrow the comparison on this
  // page only; the quote itself is unchanged. Chips appear only when more than one courier answered.
  const couriers = [...new Set(quote.services.map((service) => courierOf(service.providerService)))];
  const [courier, setCourier] = useState<string | null>(null);
  const shown = courier ? quote.services.filter((service) => courierOf(service.providerService) === courier) : quote.services;
  const chip = "h-auto min-h-11 flex-col gap-1 px-3 py-2 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground";
  return (
    <Card aria-labelledby="rate-results-title" role="region">
      <CardHeader className="border-b">
        <CardTitle id="rate-results-title">Estimasi ongkir</CardTitle>
        <CardDescription className="grid gap-1">
          <span className="wrap-anywhere">{areaDisplayCase(quote.originAreaLabel)} → {areaDisplayCase(quote.destinationAreaLabel)} · {formatWeight(quote.weightGrams)}</span>
          <span className="text-xs">Diperiksa {formatWibDateTime(quote.retrievedAt)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
      {couriers.length > 1 ? (
        <div aria-label="Saring kurir" className="flex flex-wrap gap-2" role="group">
          <Button aria-pressed={courier === null} className={chip} onClick={() => setCourier(null)} type="button" variant="outline">Semua kurir</Button>
          {couriers.map((key) => (
            <Button aria-pressed={courier === key} className={chip} key={key} onClick={() => setCourier(key)} type="button" variant="outline">
              <span aria-hidden="true" className="inline-flex"><CourierLogo className="h-5" courier={key} /></span>
              {courierDisplayName(key)}
            </Button>
          ))}
        </div>
      ) : null}
      {quote.services.length ? (
        <Table containerClassName="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" containerProps={{ role: "region", tabIndex: 0, "aria-label": "Perbandingan estimasi ongkir" }}>
          <TableHeader><TableRow><TableHead>Layanan</TableHead><TableHead className="text-right">Estimasi ongkir</TableHead><TableHead>Estimasi tiba</TableHead><TableHead>COD</TableHead></TableRow></TableHeader>
          <TableBody>{shown.map((service) => <TableRow key={service.providerService}>
            <TableCell className="max-w-60 whitespace-normal break-words font-medium">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-flex w-12 shrink-0 justify-center"><CourierLogo className="h-5 max-w-12" courier={service.providerService} /></span>
                {serviceDisplayName(service.providerService)}
              </span>
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{formatIdr(service.shippingAmountIdr)}</TableCell>
            <TableCell className="max-w-48 whitespace-normal wrap-anywhere">{service.deliveryEstimate ? deliveryEstimateLabel(service.deliveryEstimate) : "Belum tersedia"}</TableCell>
            <TableCell><ToneBadge label={service.codEligible ? "Tersedia" : "Tidak tersedia"} tone={service.codEligible ? "ok" : "neutral"} /></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      ) : <Alert><AlertTitle>Belum ada layanan untuk rute ini</AlertTitle><AlertDescription>Coba area tujuan atau berat lain, lalu periksa kembali.</AlertDescription></Alert>}
      </CardContent>
    </Card>
  );
}
