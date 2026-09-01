"use client";

import { CircleAlert, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  confirmShipmentIssuance,
  type ShipmentIssuanceActionState,
} from "@/app/app/pengiriman/[shipmentId]/actions";
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

type CodBreakdown = {
  goodsValueIdr: number;
  shippingAmountIdr: number;
  serviceFeeIdr: number;
  vatAmountIdr: number;
  providerCodAmountIdr: number;
};

export type ShipmentEstimateOption = {
  codBreakdown: CodBreakdown | null;
  codEligible: boolean;
  deliveryEstimate: string;
  estimateServiceId: string;
  insuranceAmountIdr: number | null;
  providerService: string;
  shippingAmountIdr: number;
};

type ShipmentIssuancePanelProps = {
  fixtureEnabled: boolean;
  isCod: boolean;
  options: ShipmentEstimateOption[];
  shipmentId: string;
  snapshotId: string;
};

const initialState: ShipmentIssuanceActionState = {};
const idr = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

const breakdownRows: readonly [keyof CodBreakdown, string][] = [
  ["goodsValueIdr", "Nilai barang dideklarasikan"],
  ["shippingAmountIdr", "Ongkir penyedia"],
  ["serviceFeeIdr", "Biaya layanan COD GeraiCUAN"],
  ["vatAmountIdr", "PPN biaya layanan"],
  ["providerCodAmountIdr", "Total ditagih ke pelanggan"],
];

export function ShipmentIssuancePanel({
  fixtureEnabled,
  isCod,
  options,
  shipmentId,
  snapshotId,
}: ShipmentIssuancePanelProps) {
  const [state, action, pending] = useActionState(confirmShipmentIssuance, initialState);
  const [selectedId, setSelectedId] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.estimateServiceId === selectedId);
  const eligibleOptions = options.filter((option) => !isCod || option.codEligible);

  useEffect(() => {
    if (state.error || state.issued) resultRef.current?.focus();
  }, [state]);

  return (
    <section
      aria-busy={pending}
      aria-labelledby="estimasi-heading"
      className="grid gap-5 rounded-lg border bg-card p-4 sm:p-5"
      id="konfirmasi-penerbitan-awb"
    >
      <div>
        <h2 className="font-medium" id="estimasi-heading">Pilih layanan dan terbitkan AWB</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Konfirmasi ini langsung memproses penerbitan satu kali. Periksa layanan dan nilai sebelum melanjutkan.
        </p>
      </div>

      {eligibleOptions.length === 0 ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Tidak ada layanan yang memenuhi syarat</AlertTitle>
          <AlertDescription>
            Estimasi terbaru tidak memiliki layanan yang mendukung{isCod ? " COD" : " kiriman ini"}.
          </AlertDescription>
        </Alert>
      ) : (
        <form action={action} className="grid gap-5">
          <input name="shipmentId" type="hidden" value={shipmentId} />
          <input name="estimateSnapshotId" type="hidden" value={snapshotId} />
          <fieldset className="grid gap-3" disabled={pending}>
            <legend className="text-sm font-medium">Layanan Mengantar yang tersimpan</legend>
            <div className="overflow-hidden rounded-lg border">
              <Table
                containerClassName="focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
                containerProps={{ "aria-label": "Pilihan estimasi layanan Mengantar", role: "region", tabIndex: 0 }}
              >
                <TableCaption className="sr-only">Pilihan layanan dari estimasi terbaru</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Pilih</TableHead>
                    <TableHead>Layanan</TableHead>
                    <TableHead className="text-right">Ongkir</TableHead>
                    <TableHead className="text-right">Asuransi</TableHead>
                    <TableHead>Estimasi tiba</TableHead>
                    <TableHead>COD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {options.map((option) => {
                    const eligible = !isCod || option.codEligible;
                    return (
                      <TableRow data-state={selectedId === option.estimateServiceId ? "selected" : undefined} key={option.estimateServiceId}>
                        <TableCell>
                          <label className="flex min-h-11 min-w-11 items-center justify-center sm:min-h-9" title={`Pilih ${option.providerService}`}>
                            <input
                              aria-label={`Pilih ${option.providerService}`}
                              className="size-4 accent-primary"
                              disabled={!eligible}
                              name="estimateServiceId"
                              onChange={() => setSelectedId(option.estimateServiceId)}
                              required
                              type="radio"
                              value={option.estimateServiceId}
                            />
                          </label>
                        </TableCell>
                        <TableCell className="font-medium">{option.providerService}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{idr.format(option.shippingAmountIdr)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {option.insuranceAmountIdr === null ? "—" : idr.format(option.insuranceAmountIdr)}
                        </TableCell>
                        <TableCell>{option.deliveryEstimate}</TableCell>
                        <TableCell><Badge variant={option.codEligible ? "secondary" : "outline"}>{option.codEligible ? "Didukung" : "Tidak"}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </fieldset>

          {selected?.codBreakdown ? (
            <div aria-label="Rincian nilai penagihan COD" className="overflow-hidden rounded-lg border" role="region">
              <Table>
                <TableCaption className="px-3 text-left">Rincian penagihan ke pelanggan</TableCaption>
                <TableBody>
                  {breakdownRows.map(([key, label]) => (
                    <TableRow key={key}>
                      <TableCell className={key === "providerCodAmountIdr" ? "font-medium" : undefined}>{label}</TableCell>
                      <TableCell className="text-right font-mono font-medium tabular-nums">{idr.format(selected.codBreakdown![key])}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : selected ? (
            <p className="text-sm text-muted-foreground">Kiriman non-COD tidak memiliki nilai penagihan ke penerima.</p>
          ) : (
            <p className="text-sm text-muted-foreground" role="status">Pilih layanan untuk meninjau nilai konfirmasi.</p>
          )}

          {!fixtureEnabled ? (
            <Alert id="fixture-issuance-status">
              <ShieldCheck aria-hidden="true" />
              <AlertTitle>Penerbitan dikunci</AlertTitle>
              <AlertDescription>Fitur hanya aktif dengan fixture non-produksi yang disetujui. Tidak ada panggilan penyedia dari kondisi ini.</AlertDescription>
            </Alert>
          ) : null}

          <label className="flex max-w-2xl items-start gap-3 text-sm leading-6">
            <input className="relative mt-1 size-4 shrink-0 accent-primary after:absolute after:-inset-3" disabled={!selected || !fixtureEnabled || pending} key={selectedId} name="confirmation" required type="checkbox" value="confirmed" />
            <span>Saya sudah memeriksa layanan dan nilai di atas, lalu mengonfirmasi penerbitan AWB satu kali.</span>
          </label>
          <Button className="min-h-11 w-fit sm:min-h-9" disabled={!selected || !fixtureEnabled || pending} type="submit">
            {pending ? "Menerbitkan AWB…" : "Konfirmasi dan terbitkan AWB"}
          </Button>
        </form>
      )}

      {state.error ? (
        <Alert aria-live="assertive" ref={resultRef} tabIndex={-1} variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Penerbitan tidak berhasil</AlertTitle>
          <AlertDescription>{state.error} Muat ulang halaman bila estimasi atau status sudah berubah.</AlertDescription>
        </Alert>
      ) : null}
      {state.issued ? (
        <Alert aria-live="polite" ref={resultRef} tabIndex={-1}>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>AWB {state.issued.awb} sudah tersimpan</AlertTitle>
          <AlertDescription>
            <Button asChild className="mt-2" size="sm" variant="outline">
              <Link href={state.issued.labelHref}>Buka label 100 × 150 mm <ExternalLink aria-hidden="true" /></Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
