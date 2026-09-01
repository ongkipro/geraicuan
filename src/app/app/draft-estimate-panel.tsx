"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, RefreshCw, Truck } from "lucide-react";

import {
  loadShipmentEstimate,
  type ShipmentEstimateActionState,
} from "@/app/app/estimate-actions";
import {
  DraftCodBreakdown,
  type DraftCodBreakdownValue,
} from "@/app/app/shipment-draft-experience";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  deliveryEstimate: string;
  providerService: string;
  shippingAmountIdr: number;
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
    <Button className="min-h-11" disabled={pending} type="submit">
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
  const visibleSnapshot = auditState === "error" && !auditRetryComplete ? null : snapshot;
  const visibleError = auditState === "error" && auditRetryComplete ? undefined : state.error;
  const services = visibleSnapshot?.services ?? [];
  const codUnavailable = isCod && services.length > 0 && services.every((service) => !service.codEligible);
  const codBreakdowns = isCod
    ? services.flatMap((service) =>
        service.codBreakdown
          ? [{
              breakdown: service.codBreakdown,
              providerService: service.providerService,
            }]
          : [])
    : [];

  return (
    <section aria-busy={false} className="grid gap-5 rounded-lg border bg-card p-4 sm:p-5" id="estimasi-draf">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-medium">Estimasi layanan</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Tarif berasal dari Mengantar untuk detail draf saat ini. Estimasi tidak menjamin penerbitan AWB.
          </p>
        </div>

      {auditState === "error" ? (
        <Button
          className="min-h-11"
          onClick={() => setAuditRetryComplete(true)}
          type="button"
        >
          <RefreshCw aria-hidden="true" />
          {auditRetryComplete ? "Estimasi audit dimuat" : "Coba lagi"}
        </Button>
      ) : state.unconfigured ? (
        null
      ) : (
        <form action={action}>
          <input name="shipmentId" type="hidden" value={draftId} />
          <EstimateButton hasSnapshot={snapshot !== null} />
        </form>
      )}
      </div>

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
          <div
            aria-label="Daftar estimasi layanan Mengantar"
            className="overflow-x-auto rounded-lg border"
            role="region"
            tabIndex={0}
          >
            <Table>
              <TableCaption className="sr-only">Tarif layanan Mengantar</TableCaption>
              <TableHeader>
                <tr>
                  <TableHead scope="col">Layanan</TableHead>
                  <TableHead scope="col">Estimasi tiba</TableHead>
                  <TableHead scope="col">COD</TableHead>
                  <TableHead className="text-right" scope="col">Ongkir</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {services.map((service) => (
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
                    <TableCell className="text-right font-mono tabular-nums">{formatIdr(service.shippingAmountIdr)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
                {codBreakdowns.map(({ breakdown, providerService }) => (
                  <DraftCodBreakdown
                    breakdown={breakdown}
                    key={providerService}
                    providerService={providerService}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
