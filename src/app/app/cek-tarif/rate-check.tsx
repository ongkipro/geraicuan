"use client";

import { Calculator, CircleAlert, Loader2, Settings, Truck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { DestinationAreaPicker, type DestinationAreaOutlet } from "@/app/app/_shared/destination-area-picker";
import { checkShippingRates, type ShippingRateActionState } from "@/app/app/cek-tarif/actions";
import { CourierLogo } from "@/components/app/courier-logo";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCharacterClass, CharacterClassHint } from "@/components/ui/character-class-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deliveryEstimateLabel, serviceDisplayName } from "@/lib/labels/courier";
import { areaDisplayCase, formatWeight, formatWibDateTime } from "@/lib/label-format";
import { courierDisplayName, mengantarCourierOfService } from "@/lib/mengantar-couriers";

export type RateQuote = NonNullable<ShippingRateActionState["quote"]>;
type RateService = RateQuote["services"][number];

/** The courier a quoted service belongs to, or the service itself when no known courier claims it. */
export function courierOf(providerService: string) {
  return mengantarCourierOfService(providerService) ?? providerService;
}

/** Couriers in first-quoted order, and the services left after the chip filter; cheapest first. */
export function rateView(services: RateService[], courier: string | null) {
  const couriers = [...new Set(services.map((service) => courierOf(service.providerService)))];
  const shown = (courier ? services.filter((service) => courierOf(service.providerService) === courier) : services)
    .slice().sort((a, b) => a.shippingAmountIdr - b.shippingAmountIdr);
  return { couriers, shown };
}

/**
 * Spec 17 `/app/cek-tarif` (ref cek-tarif.html): outlet, kecamatan tujuan and berat → the one primary
 * "Cek tarif" (`checkShippingRates`) → results with courier chips and service rows. Any change to
 * the route or weight hides the previous result until it is checked again.
 */
export function RateCheck({ canManageSettings, initialState = {}, outlets }: {
  canManageSettings: boolean;
  initialState?: ShippingRateActionState;
  outlets: DestinationAreaOutlet[];
}) {
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const [weight, setWeight] = useState("1000");
  const { hint: weightHint, ...weightLock } = useCharacterClass<HTMLInputElement>("NUMERIC_INTEGER", {
    onChange: (event) => setWeight(event.target.value),
  });
  const [stale, setStale] = useState(false);
  const revision = useRef(0);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (previous: ShippingRateActionState, data: FormData) => {
    const submitted = revision.current;
    const result = await checkShippingRates(previous, data);
    if (submitted !== revision.current) return {};
    setStale(false);
    return result;
  }, initialState);
  const visible = stale ? {} : state;

  const shownState = useRef(state);
  useEffect(() => {
    // Only a check the user ran moves focus; the state the page arrived with does not.
    if (shownState.current === state) return;
    shownState.current = state;
    if (state.quote || state.error) outcomeRef.current?.focus();
    else if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  function invalidate() {
    revision.current += 1;
    setStale(true);
  }

  if (outlets.length === 0) {
    return (
      <Card className="py-0">
        <EmptyState
          action={canManageSettings ? <Button asChild variant="outline"><Link href="/app/pengaturan"><Settings aria-hidden="true" />Buka pengaturan</Link></Button> : undefined}
          description={canManageSettings
            ? "Lengkapi titik pickup dan koneksi Mengantar pada outlet terlebih dahulu."
            : "Minta pemilik gerai melengkapi titik pickup dan koneksi Mengantar outlet."}
          icon={Truck}
          title="Belum ada outlet yang siap"
        />
      </Card>
    );
  }

  const errors = visible.fieldErrors ?? {};
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Card className="px-6 max-md:px-4">
        <form action={action} aria-busy={pending} className="grid gap-2" noValidate ref={formRef}>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field className="gap-2" data-invalid={Boolean(errors.outletId)}>
              <FieldLabel htmlFor="rate-outlet">Outlet asal</FieldLabel>
              <Select
                disabled={pending}
                name="outletId"
                onValueChange={(value) => { setOutletId(value); invalidate(); }}
                value={outletId}
              >
                <SelectTrigger aria-describedby="rate-outlet-error" aria-invalid={Boolean(errors.outletId)} className="w-full" id="rate-outlet">
                  <SelectValue>{outlets.find((outlet) => outlet.id === outletId)?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((outlet) => <SelectItem key={outlet.id} value={outlet.id}>{outlet.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="min-h-5"><FieldError id="rate-outlet-error">{errors.outletId}</FieldError></div>
            </Field>
            <DestinationAreaPicker
              disabled={pending}
              error={errors.destinationAreaLabel}
              fixedOutletId={outletId}
              key={outletId}
              onSelectionChange={invalidate}
              outlets={outlets}
              submitOutletWithoutSelection
            />
          </div>
          <Field className="gap-2 sm:max-w-60" data-invalid={Boolean(errors.weightGrams)}>
            <FieldLabel htmlFor="rate-weight">Berat paket</FieldLabel>
            <div className="relative">
              <Input
                aria-describedby="rate-weight-error rate-weight-character-hint"
                aria-invalid={Boolean(errors.weightGrams)}
                className="pr-16 tabular-nums"
                data-character-class="NUMERIC_INTEGER"
                disabled={pending}
                id="rate-weight"
                maxLength={6}
                name="weightGrams"
                {...weightLock}
                onChange={(event) => { weightLock.onChange(event); invalidate(); }}
                required
                value={weight}
              />
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">gram</span>
            </div>
            <CharacterClassHint hint={weightHint} id="rate-weight" />
            <div className="min-h-5"><FieldError id="rate-weight-error">{errors.weightGrams}</FieldError></div>
          </Field>
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Estimasi dari Mengantar; tidak membuat kiriman.</p>
            <Button disabled={pending} type="submit">
              {pending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Calculator aria-hidden="true" />}
              {pending ? "Memeriksa tarif…" : "Cek tarif"}
            </Button>
          </div>
        </form>
      </Card>

      <div aria-live="polite" className="min-w-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50" ref={outcomeRef} tabIndex={-1}>
        {visible.error ? (
          <Alert role="alert" variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Tarif belum tersedia</AlertTitle>
            <AlertDescription>{visible.error}</AlertDescription>
          </Alert>
        ) : null}
        {visible.quote ? <RateResults quote={visible.quote} /> : null}
      </div>
    </div>
  );
}

function CodBadge({ eligible }: { eligible: boolean }) {
  return eligible ? <StatusBadge label="COD tersedia" tone="success" /> : <StatusBadge label="Tanpa COD" tone="neutral" />;
}

export function RateResults({ quote }: { quote: RateQuote }) {
  const [courier, setCourier] = useState<string | null>(null);
  const { couriers, shown } = rateView(quote.services, courier);
  return (
    <Card aria-labelledby="hasil-tarif" className="gap-0 py-0" role="region">
      <div className="grid gap-1 border-b p-6 max-md:p-4">
        <h2 className="text-base font-semibold" id="hasil-tarif">Estimasi ongkir</h2>
        <p className="text-sm text-muted-foreground wrap-anywhere">
          {areaDisplayCase(quote.originAreaLabel)} → {areaDisplayCase(quote.destinationAreaLabel)} · {formatWeight(quote.weightGrams)}
        </p>
        <p className="text-xs text-muted-foreground">Diperiksa {formatWibDateTime(quote.retrievedAt)}</p>
      </div>
      {quote.services.length === 0 ? (
        <EmptyState description="Coba kecamatan tujuan atau berat lain." icon={Truck} title="Belum ada layanan untuk rute ini" />
      ) : (
        <>
          {couriers.length > 1 ? (
            <div aria-label="Saring kurir" className="grid grid-cols-3 gap-2 border-b p-4 sm:grid-cols-5 md:px-6 lg:grid-cols-6" role="group">
              <CourierChip label="Semua" onClick={() => setCourier(null)} pressed={courier === null} />
              {couriers.map((key) => (
                <CourierChip courier={key} key={key} label={courierDisplayName(key)} onClick={() => setCourier(key)} pressed={courier === key} />
              ))}
            </div>
          ) : null}
          <div className="hidden md:block">
            <Table>
              <TableCaption className="sr-only">Perbandingan estimasi ongkir</TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Layanan</TableHead>
                  <TableHead className="text-right">Estimasi ongkir</TableHead>
                  <TableHead>Estimasi tiba</TableHead>
                  <TableHead className="pr-6">COD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((service) => (
                  <TableRow key={service.providerService}>
                    <TableCell className="pl-6">
                      <span className="flex items-center gap-3">
                        <span className="flex w-12 shrink-0 justify-center"><CourierLogo className="h-5 max-w-12" courier={service.providerService} decorative /></span>
                        <span className="font-semibold">{serviceDisplayName(service.providerService)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold"><Money amount={service.shippingAmountIdr} /></TableCell>
                    <TableCell>{deliveryEstimateLabel(service.deliveryEstimate)}</TableCell>
                    <TableCell className="pr-6"><CodBadge eligible={service.codEligible} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden">
            <RecordList label="Perbandingan estimasi ongkir">
              {shown.map((service) => (
                <RecordItem
                  key={service.providerService}
                  status={<CodBadge eligible={service.codEligible} />}
                  time={`Tiba ${deliveryEstimateLabel(service.deliveryEstimate)}`}
                  title={(
                    <span className="flex items-center gap-2">
                      <CourierLogo className="h-5 max-w-12" courier={service.providerService} decorative />
                      {serviceDisplayName(service.providerService)}
                    </span>
                  )}
                  value={<Money amount={service.shippingAmountIdr} />}
                />
              ))}
            </RecordList>
          </div>
        </>
      )}
    </Card>
  );
}

function CourierChip({ courier, label, onClick, pressed }: { courier?: string; label: string; onClick: () => void; pressed: boolean }) {
  return (
    <button
      aria-pressed={pressed}
      className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border bg-card p-2 text-xs font-medium transition-colors hover:border-input focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground"
      onClick={onClick}
      type="button"
    >
      {courier ? <CourierLogo className="h-5 max-w-14" courier={courier} decorative /> : <Truck aria-hidden="true" className="size-5 text-muted-foreground" />}
      <span className="w-full truncate text-center">{label}</span>
    </button>
  );
}
