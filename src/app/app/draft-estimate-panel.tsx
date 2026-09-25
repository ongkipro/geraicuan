"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, RefreshCw, Truck } from "lucide-react";

import {
  loadShipmentEstimate,
  type ShipmentEstimateActionState,
} from "@/app/app/estimate-actions";
import { CodOngkirCharge } from "@/app/app/cod-ongkir-charge";
import {
  deriveDraftProviderMoneyLines,
  DraftCodBreakdown,
  DRAFT_MONEY_METRIC_IDS,
  type DraftCodBreakdownValue,
} from "@/app/app/shipment-draft-experience";
import { ToneBadge } from "@/components/cms/shipment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deliveryEstimateLabel, serviceDisplayName } from "@/lib/labels/courier";
import { shippingMengantarDeductsIdr } from "@/lib/mengantar-cod-fee";
import type { PaymentMethod } from "@/lib/payment-method";

type EstimateService = {
  codBreakdown: DraftCodBreakdownValue | null;
  codEligible: boolean;
  codFeeIdr?: number | null;
  deliveryEstimate: string;
  discountIdr?: number | null;
  normalPriceIdr?: number | null;
  providerService: string;
  shippingAmountIdr: number;
  specialPriceIdr?: number | null;
};

type EstimateSnapshot = {
  retrievedAt: string;
  services: EstimateService[];
};

type DraftEstimatePanelProps = {
  auditState?: "error" | null;
  /** T-200: request the estimate once on arrival when none is stored yet. */
  autoLoad?: boolean;
  className?: string;
  draftId: string;
  isCod: boolean;
  /** T-186: defaults to what `isCod` implies for callers that predate COD Ongkir. */
  paymentMethod?: PaymentMethod;
  snapshot: EstimateSnapshot | null;
};

const initialState: ShipmentEstimateActionState = {};

function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatRetrievedAt(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function EstimateButton({ hasSnapshot, variant }: { hasSnapshot: boolean; variant?: "outline" }) {
  const { pending } = useFormStatus();
  return (
    <Button className="min-h-11 max-md:w-full md:min-h-10" disabled={pending} type="submit" variant={variant}>
      <RefreshCw aria-hidden="true" className={pending ? "animate-spin" : undefined} />
      {pending ? "Memuat estimasi…" : hasSnapshot ? "Muat ulang estimasi" : "Muat estimasi"}
    </Button>
  );
}

/**
 * T-200: the one-page flow shows the service choice itself, so it only needs the
 * action that refreshes the stored estimate. Same action, same limits, same redirect.
 */
export function EstimateRefreshForm({ draftId }: { draftId: string }) {
  const [state, action] = useActionState(loadShipmentEstimate, initialState);
  return (
    <form action={action} className="grid gap-2">
      <input name="shipmentId" type="hidden" value={draftId} />
      <EstimateButton hasSnapshot variant="outline" />
      {state.unconfigured ? (
        <p className="text-sm text-destructive" role="alert">Konfigurasi Mengantar belum tersedia. Hubungi Tenant Admin.</p>
      ) : state.error ? (
        <p className="text-sm text-destructive" role="alert">{state.error}</p>
      ) : null}
    </form>
  );
}

export function DraftEstimatePanel({ auditState = null, autoLoad = false, className, draftId, isCod, paymentMethod = isCod ? "COD" : "NON_COD", snapshot }: DraftEstimatePanelProps) {
  const [auditRetryComplete, setAuditRetryComplete] = useState(false);
  const [state, action] = useActionState(
    loadShipmentEstimate,
    auditState === "error"
      ? { error: "Estimasi audit tidak dapat dimuat. Tinjau draf lalu coba lagi." }
      : initialState,
  );
  const autoFormRef = useRef<HTMLFormElement>(null);
  const autoRequested = useRef(false);
  useEffect(() => {
    // Once per mount: a failure shows its message and waits for the button, never a retry loop.
    if (!autoLoad || snapshot || auditState || autoRequested.current) return;
    autoRequested.current = true;
    autoFormRef.current?.requestSubmit();
  }, [auditState, autoLoad, snapshot]);
  const visibleSnapshot = snapshot;
  const visibleError = auditState === "error" && auditRetryComplete ? undefined : state.error;
  const services = visibleSnapshot?.services ?? [];
  const codUnavailable = isCod && services.length > 0 && services.every((service) => !service.codEligible);
  const moneyLinesFor = (service: EstimateService) => deriveDraftProviderMoneyLines(
    {
      codFeeIdr: service.codFeeIdr ?? null,
      discountIdr: service.discountIdr ?? null,
      normalPriceIdr: service.normalPriceIdr ?? null,
      shippingAmountIdr: service.shippingAmountIdr,
      specialPriceIdr: service.specialPriceIdr ?? null,
    },
    service.codBreakdown?.providerCodAmountIdr ?? null,
  );
  const codOngkirServices = paymentMethod === "COD_ONGKIR"
    ? services.filter((service) => service.codEligible)
    : [];
  const codBreakdowns = paymentMethod === "COD"
    ? services.flatMap((service) =>
        service.codBreakdown
          ? [{
              breakdown: service.codBreakdown,
              money: moneyLinesFor(service),
              providerService: service.providerService,
              serviceName: serviceDisplayName(service.providerService),
            }]
          : [])
    : [];

  return (
    <Card aria-busy={false} aria-labelledby="estimasi-draf-heading" className={className} id="estimasi-draf" role="region">
      <CardHeader className="gap-4 md:flex md:items-start md:justify-between">
        <div className="grid gap-1">
          <CardTitle id="estimasi-draf-heading">Estimasi layanan</CardTitle>
          <CardDescription className="max-w-2xl leading-6">
            Tarif berasal dari Mengantar untuk detail draf saat ini. Estimasi tidak menjamin penerbitan AWB.
          </CardDescription>
        </div>

      {auditState === "error" ? (
        <Button
          className="min-h-11 max-md:w-full md:min-h-10"
          onClick={() => setAuditRetryComplete(true)}
          type="button"
        >
          <RefreshCw aria-hidden="true" />
          {auditRetryComplete ? "Estimasi audit dimuat" : "Coba lagi"}
        </Button>
      ) : state.unconfigured ? (
        null
      ) : (
        <form action={action} className="shrink-0" ref={autoFormRef}>
          <input name="shipmentId" type="hidden" value={draftId} />
          <EstimateButton hasSnapshot={snapshot !== null} />
        </form>
      )}
      </CardHeader>

      <CardContent className="grid gap-5">
      {state.unconfigured ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Konfigurasi Mengantar belum tersedia</AlertTitle>
          <AlertDescription>Hubungi Tenant Admin untuk melengkapi konfigurasi outlet.</AlertDescription>
        </Alert>
      ) : null}

      {visibleError ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Estimasi tidak dapat dimuat</AlertTitle>
          <AlertDescription>{visibleError}</AlertDescription>
        </Alert>
      ) : null}

      {visibleSnapshot && services.length > 0 ? (
        <>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            Diperbarui {formatRetrievedAt(visibleSnapshot.retrievedAt)} WIB
          </p>
          {codUnavailable ? (
            <Alert>
              <CircleAlert aria-hidden="true" />
              <AlertTitle>COD tidak tersedia</AlertTitle>
              <AlertDescription>Tidak ada layanan yang mendukung COD untuk rute ini.</AlertDescription>
            </Alert>
          ) : null}
          {/* The label, the role and the tab stop belong on the element that
              actually scrolls. Wrapping `Table` in a second div left the outer
              one labelled and static while `Table`'s own container scrolled
              unlabelled and unreachable — browser screening caught it at
              390px. `containerProps` puts them on the real one, the way the
              shipment and return queues already do. */}
          <Table
            containerClassName="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            containerProps={{
              "aria-label": "Daftar estimasi layanan Mengantar",
              role: "region",
              tabIndex: 0,
            }}
          >
              <TableCaption className="sr-only">Tarif layanan Mengantar</TableCaption>
              <TableHeader>
                <tr>
                  <TableHead scope="col">Layanan</TableHead>
                  <TableHead scope="col">Estimasi tiba</TableHead>
                  <TableHead scope="col">COD</TableHead>
                  <TableHead className="text-right" scope="col">Harga Mengantar</TableHead>
                  <TableHead className="text-right" scope="col">Ongkir</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {services.map((service) => {
                  const money = moneyLinesFor(service);
                  return (
                  <TableRow key={service.providerService}>
                    <TableCell className="font-medium"><span className="flex items-center gap-2"><Truck aria-hidden="true" className="size-4 text-muted-foreground" />{serviceDisplayName(service.providerService)}</span></TableCell>
                    <TableCell>{deliveryEstimateLabel(service.deliveryEstimate)}</TableCell>
                    <TableCell>
                      <ToneBadge label={service.codEligible ? "Tersedia" : "Tidak tersedia"} tone={service.codEligible ? "ok" : "neutral"} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="grid justify-items-end gap-0.5">
                        <span data-metric-id={DRAFT_MONEY_METRIC_IDS.normalPrice}>
                          Normal {formatIdr(money.normalPriceIdr)}
                        </span>
                        {money.specialPriceIdr === null ? null : (
                          <span
                            className="text-xs text-muted-foreground"
                            data-metric-id={DRAFT_MONEY_METRIC_IDS.specialPrice}
                          >
                            Spesial {formatIdr(money.specialPriceIdr)}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatIdr(service.shippingAmountIdr)}</TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          {codBreakdowns.length > 0 ? (
            <section
              aria-labelledby="draft-cod-explanation-title"
              className="grid gap-4 border-t pt-5"
            >
              <header>
                <h3 className="text-base font-semibold" id="draft-cod-explanation-title">
                  Rincian penagihan COD sebelum konfirmasi
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Nilai mengikuti layanan penyedia yang ditampilkan. Melihat rincian ini
                  belum mengonfirmasi layanan atau membuat pesanan ke penyedia.
                </p>
              </header>
              <div className="grid gap-3 md:grid-cols-2">
                {codBreakdowns.map(({ breakdown, money, providerService, serviceName }) => (
                  <DraftCodBreakdown
                    breakdown={breakdown}
                    key={providerService}
                    money={money}
                    providerService={serviceName}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {codOngkirServices.length > 0 ? (
            <section
              aria-labelledby="draft-cod-ongkir-title"
              className="@container grid gap-4 border-t pt-5"
            >
              <header>
                <h3 className="text-base font-semibold" id="draft-cod-ongkir-title">
                  Ongkir COD yang ditagih kurir
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Barang sudah dibayar, jadi kurir hanya menagih ongkir. Coba nilai ongkir
                  per layanan di sini; nilai final dipilih bersama layanannya saat konfirmasi
                  penerbitan AWB.
                </p>
              </header>
              {/* The panel sits in the 22rem form rail. A viewport breakpoint
                  (`md:grid-cols-2`) put two service cards side by side in 352px,
                  about 160px each, so "Ongkir dipotong Mengantar" ran into its
                  own amount and the refusal message was cut off. The columns
                  follow the panel's own width instead. */}
              <div className="grid gap-6 @xl:grid-cols-2">
                {codOngkirServices.map((service, index) => (
                  <CodOngkirCharge
                    idPrefix={`draft-cod-ongkir-${index}`}
                    key={service.providerService}
                    providerService={serviceDisplayName(service.providerService)}
                    shippingDeductedIdr={shippingMengantarDeductsIdr({
                      normalPriceIdr: service.normalPriceIdr ?? null,
                      shippingAmountIdr: service.shippingAmountIdr,
                      specialPriceIdr: service.specialPriceIdr ?? null,
                    })}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
      </CardContent>
    </Card>
  );
}
