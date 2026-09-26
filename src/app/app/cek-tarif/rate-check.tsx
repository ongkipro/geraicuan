"use client";

import { BadgePercent, Calculator, Check, CircleAlert, Info, Layers, Loader2, RotateCcw, Settings, Truck, Zap } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

import { DestinationAreaPicker, type DestinationAreaOutlet } from "@/app/app/_shared/destination-area-picker";
import { checkShippingRates, type ShippingRateActionState } from "@/app/app/cek-tarif/actions";
import { CourierLogo } from "@/components/app/courier-logo";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { useCharacterClass, CharacterClassHint } from "@/components/ui/character-class-input";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { deliveryEstimateLabel, serviceDisplayName } from "@/lib/labels/courier";
import { areaDisplayCase, formatWeight, formatWibDateTime } from "@/lib/label-format";
import { courierDisplayName, mengantarCourierOfService, mengantarOrderableService } from "@/lib/mengantar-couriers";
import { cn } from "@/lib/utils";

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

/** "1–2 hari" → [1, 2], "3 hari" → [3, 3]; an estimate that names no day count → null. */
export function estimateDays(deliveryEstimate: string): [number, number] | null {
  const match = /^(\d+)(?:–(\d+))? hari$/.exec(deliveryEstimateLabel(deliveryEstimate));
  if (!match) return null;
  const from = Number(match[1]);
  return [from, match[2] ? Number(match[2]) : from];
}

/**
 * The cheapest and the fastest quoted service (ties: the cheaper, then quote order). "Fastest" is
 * the smallest upper bound of the courier's own estimate, so it is null when no estimate names days.
 */
export function rateHighlights(services: RateService[]) {
  const cheapest = services.reduce<RateService | null>((best, service) => (!best || service.shippingAmountIdr < best.shippingAmountIdr ? service : best), null);
  let fastest: { days: [number, number]; service: RateService } | null = null;
  for (const service of services) {
    const days = estimateDays(service.deliveryEstimate);
    if (!days) continue;
    if (!fastest
      || days[1] < fastest.days[1]
      || (days[1] === fastest.days[1] && days[0] < fastest.days[0])
      || (days[1] === fastest.days[1] && days[0] === fastest.days[0] && service.shippingAmountIdr < fastest.service.shippingAmountIdr)) {
      fastest = { days, service };
    }
  }
  return { cheapest, fastest: fastest?.service ?? null };
}

/**
 * Spec 17 `/app/cek-tarif` (ref cek-tarif.html, T-242): outlet, kecamatan tujuan and berat → the
 * one primary "Cek tarif" (`checkShippingRates`) → results: highlights, courier chips and service
 * rows. Any change to the route or weight hides the previous result until it is checked again.
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
  const weightGrams = /^\d+$/.test(weight) ? Number(weight) : 0;

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
  const hadResult = Boolean(state.quote || state.error);
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
                aria-describedby="rate-weight-help rate-weight-error rate-weight-character-hint"
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
            <FieldDescription className="text-xs" id="rate-weight-help">
              {weightGrams > 0 ? `Setara ${formatWeight(weightGrams)}. Isi berat dalam gram.` : "Isi berat dalam gram, misalnya 1000 untuk 1 kg."}
            </FieldDescription>
            <CharacterClassHint hint={weightHint} id="rate-weight" />
            <div className="min-h-5"><FieldError id="rate-weight-error">{errors.weightGrams}</FieldError></div>
          </Field>
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Estimasi dari Mengantar; tidak membuat kiriman.
            </p>
            <Button disabled={pending} type="submit">
              {pending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Calculator aria-hidden="true" />}
              {pending ? "Memeriksa tarif…" : "Cek tarif"}
            </Button>
          </div>
        </form>
      </Card>

      <div aria-live="polite" className="min-w-0 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50" ref={outcomeRef} tabIndex={-1}>
        {pending ? <RateResultsSkeleton /> : null}
        {!pending && visible.error ? (
          <Alert role="alert" variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Tarif belum tersedia</AlertTitle>
            <AlertDescription className="grid gap-3">
              <span>{visible.error}</span>
              <div>
                <Button onClick={() => formRef.current?.requestSubmit()} type="button" variant="outline">
                  <RotateCcw aria-hidden="true" />Coba lagi
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {!pending && visible.quote ? <RateResults quote={visible.quote} /> : null}
        {!pending && !visible.error && !visible.quote ? (
          <Card className="border border-dashed border-input py-0 shadow-none">
            <EmptyState
              description={stale && hadResult
                ? "Rute atau berat berubah. Tekan Cek tarif untuk melihat tarif terbaru."
                : "Pilih kecamatan tujuan dan isi berat paket, lalu tekan Cek tarif."}
              icon={Calculator}
              title={stale && hadResult ? "Tarif perlu dicek ulang" : "Tarif muncul di sini"}
            />
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/** Pending check: the shape of the result card, so the page does not jump when it arrives. */
function RateResultsSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Memeriksa tarif" className="gap-0 py-0" role="status">
      <div className="grid gap-2 border-b p-6 max-md:p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <div className="grid gap-3 p-6 max-md:p-4 sm:grid-cols-3">
        {[0, 1, 2].map((key) => <Skeleton className="h-20 rounded-xl" key={key} />)}
      </div>
      <div className="grid gap-3 border-t p-6 max-md:p-4">
        {[0, 1, 2, 3].map((key) => <Skeleton className="h-10" key={key} />)}
      </div>
    </Card>
  );
}

function CodBadge({ eligible }: { eligible: boolean }) {
  return eligible ? <StatusBadge label="COD tersedia" tone="success" /> : <StatusBadge label="Tanpa COD" tone="neutral" />;
}

/** The notes under a service name: highlights, and T-237's "quotable, not orderable" (spx, paxel, SAPLite). */
function ServiceTags({ cheapest, fastest, service }: { cheapest: boolean; fastest: boolean; service: RateService }) {
  const orderable = mengantarOrderableService(service.providerService) !== null;
  if (!cheapest && !fastest && orderable) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {cheapest ? <StatusBadge icon={BadgePercent} label="Termurah" tone="success" /> : null}
      {fastest ? <StatusBadge icon={Zap} label="Tercepat" tone="info" /> : null}
      {orderable ? null : <span className="text-xs text-muted-foreground">Hanya cek tarif; belum bisa dipesan lewat API Mengantar</span>}
    </span>
  );
}

function Highlight({ children, className, icon: Icon, label, tint }: { children: ReactNode; className?: string; icon: typeof Zap; label: string; tint: string }) {
  return (
    <div className={cn("grid min-w-0 content-start gap-1 rounded-xl p-4 max-sm:p-3", tint, className)}>
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 text-primary" />
        {label}
      </p>
      {children}
    </div>
  );
}

export function RateResults({ quote }: { quote: RateQuote }) {
  const [courier, setCourier] = useState<string | null>(null);
  const { couriers, shown } = rateView(quote.services, courier);
  const { cheapest, fastest } = rateHighlights(quote.services);
  const codCount = quote.services.filter((service) => service.codEligible).length;
  const countOf = (key: string) => quote.services.filter((service) => courierOf(service.providerService) === key).length;
  const tagsFor = (service: RateService) => (
    <ServiceTags
      cheapest={quote.services.length > 1 && service === cheapest}
      fastest={quote.services.length > 1 && service === fastest && fastest !== cheapest}
      service={service}
    />
  );

  return (
    <Card aria-labelledby="hasil-tarif" className="gap-0 py-0" role="region">
      <div className="flex flex-col gap-3 border-b p-6 max-md:p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <h2 className="text-lg font-bold" id="hasil-tarif">Hasil perbandingan ongkir</h2>
          <p className="text-sm text-muted-foreground wrap-anywhere">
            {areaDisplayCase(quote.originAreaLabel)} → {areaDisplayCase(quote.destinationAreaLabel)} · {formatWeight(quote.weightGrams)}
          </p>
          <p className="text-xs text-muted-foreground">Diperiksa {formatWibDateTime(quote.retrievedAt)}</p>
        </div>
        <StatusBadge className="self-start" icon={Calculator} label="Estimasi" tone="info" />
      </div>
      {quote.services.length === 0 ? (
        <EmptyState description="Coba kecamatan tujuan atau berat lain." icon={Truck} title="Belum ada layanan untuk rute ini" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 border-b p-6 max-md:p-4 sm:grid-cols-3">
            {cheapest ? (
              <Highlight icon={BadgePercent} label="Termurah" tint="bg-tile-ok">
                <p className="text-2xl font-bold text-foreground max-sm:text-xl"><Money amount={cheapest.shippingAmountIdr} /></p>
                <p className="truncate text-xs text-muted-foreground">{serviceDisplayName(cheapest.providerService)} · {deliveryEstimateLabel(cheapest.deliveryEstimate)}</p>
              </Highlight>
            ) : null}
            {fastest ? (
              <Highlight icon={Zap} label="Tercepat" tint="bg-tile-info">
                <p className="text-2xl font-bold text-foreground max-sm:text-xl">{deliveryEstimateLabel(fastest.deliveryEstimate)}</p>
                <p className="truncate text-xs text-muted-foreground">{serviceDisplayName(fastest.providerService)} · <Money amount={fastest.shippingAmountIdr} /></p>
              </Highlight>
            ) : null}
            <Highlight className="max-sm:col-span-2" icon={Layers} label="Pilihan" tint="bg-tile">
              <p className="text-2xl font-bold text-foreground max-sm:text-xl tabular-nums">{quote.services.length} layanan</p>
              <p className="text-xs text-muted-foreground">{couriers.length} kurir · {codCount} bisa COD</p>
            </Highlight>
          </div>
          {couriers.length > 1 ? (
            <div className="grid gap-3 border-b p-6 max-md:p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-semibold" id="saring-kurir">Pilih kurir</h3>
                <p className="text-xs text-muted-foreground">Pilih logo kurir untuk menyaring tarif.</p>
              </div>
              <div aria-label="Saring kurir" className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2" role="group">
                <CourierChip count={quote.services.length} label="Semua" onSelect={() => setCourier(null)} pressed={courier === null} />
                {couriers.map((key) => (
                  <CourierChip count={countOf(key)} courier={key} key={key} label={courierDisplayName(key)} onSelect={() => setCourier(key)} pressed={courier === key} />
                ))}
              </div>
            </div>
          ) : null}
          <div className="hidden md:block">
            <Table>
              <TableCaption className="sr-only">Perbandingan estimasi ongkir</TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Layanan</TableHead>
                  <TableHead>Estimasi tiba</TableHead>
                  <TableHead>COD</TableHead>
                  <TableHead className="pr-6 text-right">Estimasi ongkir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((service) => (
                  <TableRow className="h-16" key={service.providerService}>
                    <TableCell className="pl-6 whitespace-normal">
                      <span className="flex items-center gap-3">
                        <span className="flex h-8 w-14 shrink-0 items-center justify-center rounded-md bg-tile"><CourierLogo className="h-5 max-w-12" courier={service.providerService} decorative /></span>
                        <span className="grid gap-1">
                          <span className="font-semibold">{serviceDisplayName(service.providerService)}</span>
                          {tagsFor(service)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>{deliveryEstimateLabel(service.deliveryEstimate)}</TableCell>
                    <TableCell><CodBadge eligible={service.codEligible} /></TableCell>
                    <TableCell className="pr-6 text-right text-base font-bold"><Money amount={service.shippingAmountIdr} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden">
            <RecordList label="Perbandingan estimasi ongkir">
              {shown.map((service) => (
                <RecordItem
                  detail={tagsFor(service)}
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
          <CardFooter className="flex-col items-start gap-1 px-6 py-4 text-xs text-muted-foreground max-md:px-4 sm:flex-row sm:items-center sm:justify-between">
            <p>Menampilkan {shown.length} dari {quote.services.length} layanan, termurah dulu.</p>
            <p>Tarif resmi tercatat saat resi diterbitkan.</p>
          </CardFooter>
        </>
      )}
    </Card>
  );
}

/** Spec 10 option-card look (1px input; selected = accent + 2px primary + check), as a shadcn Toggle. */
function CourierChip({ count, courier, label, onSelect, pressed }: { count: number; courier?: string; label: string; onSelect: () => void; pressed: boolean }) {
  return (
    <Toggle
      className="relative h-auto min-h-20 w-full min-w-0 flex-col gap-1 rounded-lg border border-input bg-card p-2 text-xs font-medium whitespace-normal hover:border-primary hover:bg-card aria-pressed:border-2 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground data-[state=on]:bg-accent"
      onPressedChange={(next) => { if (next) onSelect(); }}
      pressed={pressed}
    >
      {pressed ? (
        <span aria-hidden="true" className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </span>
      ) : null}
      <span aria-hidden="true" className="flex h-6 items-center justify-center">
        {courier ? <CourierLogo className="h-5 max-w-14" courier={courier} decorative /> : <Truck className="size-5 text-muted-foreground" />}
      </span>
      <span className="w-full text-center leading-tight text-balance wrap-anywhere">{label}</span>
      <span className="text-xs font-normal text-muted-foreground tabular-nums">{count} layanan</span>
    </Toggle>
  );
}
