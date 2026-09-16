"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, RefreshCw, Truck } from "lucide-react";

import {
  loadShipmentEstimate,
  type ShipmentEstimateActionState,
} from "@/app/app/estimate-actions";
import {
  deriveDraftProviderMoneyLines,
  DraftCodBreakdown,
  DRAFT_MONEY_METRIC_IDS,
  type DraftCodBreakdownValue,
} from "@/app/app/shipment-draft-experience";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  draftId: string;
  isCod: boolean;
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

function EstimateButton({ hasSnapshot }: { hasSnapshot: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button className="min-h-11 max-md:w-full md:min-h-8" disabled={pending} type="submit">
      <RefreshCw aria-hidden="true" className={pending ? "animate-spin" : undefined} />
      {pending ? "Memuat estimasi…" : hasSnapshot ? "Muat ulang estimasi" : "Muat estimasi"}
    </Button>
  );
}

export function DraftEstimatePanel({ auditState = null, draftId, isCod, snapshot }: DraftEstimatePanelProps) {
  const [auditRetryComplete, setAuditRetryComplete] = useState(false);
  const [state, action] = useActionState(
    loadShipmentEstimate,
    auditState === "error"
      ? { error: "Estimasi audit tidak dapat dimuat. Tinjau draf lalu coba lagi." }
      : initialState,
  );
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
  const codBreakdowns = isCod
    ? services.flatMap((service) =>
        service.codBreakdown
          ? [{
              breakdown: service.codBreakdown,
              money: moneyLinesFor(service),
              providerService: service.providerService,
            }]
          : [])
    : [];

  return (
    <Card aria-busy={false} aria-labelledby="estimasi-draf-heading" id="estimasi-draf" role="region">
      <CardHeader className="gap-4 md:flex md:items-start md:justify-between">
        <div className="grid gap-1">
          <CardTitle id="estimasi-draf-heading">Estimasi layanan</CardTitle>
          <CardDescription className="max-w-2xl leading-6">
            Tarif berasal dari Mengantar untuk detail draf saat ini. Estimasi tidak menjamin penerbitan AWB.
          </CardDescription>
        </div>

      {auditState === "error" ? (
        <Button
          className="min-h-11 max-md:w-full md:min-h-8"
          onClick={() => setAuditRetryComplete(true)}
          type="button"
        >
          <RefreshCw aria-hidden="true" />
          {auditRetryComplete ? "Estimasi audit dimuat" : "Coba lagi"}
        </Button>
      ) : state.unconfigured ? (
        null
      ) : (
        <form action={action} className="shrink-0">
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
            containerClassName="rounded-md border"
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
                    <TableCell className="font-medium"><span className="flex items-center gap-2"><Truck aria-hidden="true" className="size-4 text-muted-foreground" />{service.providerService}</span></TableCell>
                    <TableCell>{service.deliveryEstimate}</TableCell>
                    <TableCell>
                      {service.codEligible ? (
                        <Badge variant="secondary">Tersedia</Badge>
                      ) : (
                        <Badge aria-label={`COD tidak tersedia untuk ${service.providerService}`} variant="outline">Tidak tersedia</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
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
                    <TableCell className="text-right font-mono tabular-nums">{formatIdr(service.shippingAmountIdr)}</TableCell>
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
                <h3 className="font-medium" id="draft-cod-explanation-title">
                  Rincian penagihan COD sebelum konfirmasi
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Nilai mengikuti layanan penyedia yang ditampilkan. Melihat rincian ini
                  belum mengonfirmasi layanan atau membuat pesanan ke penyedia.
                </p>
              </header>
              <div className="grid gap-3 md:grid-cols-2">
                {codBreakdowns.map(({ breakdown, money, providerService }) => (
                  <DraftCodBreakdown
                    breakdown={breakdown}
                    key={providerService}
                    money={money}
                    providerService={providerService}
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
