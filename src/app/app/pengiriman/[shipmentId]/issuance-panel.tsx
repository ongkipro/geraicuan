"use client";

import { CircleAlert, ExternalLink, MapPinCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  type DestinationAreaVerificationState,
  verifyShipmentDraftDestinationArea,
} from "@/app/app/actions";
import {
  confirmShipmentIssuance,
  type ShipmentIssuanceActionState,
} from "@/app/app/pengiriman/[shipmentId]/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodOngkirCharge } from "@/app/app/cod-ongkir-charge";
import { COD_ONGKIR_FIELD_NAME } from "@/app/app/shipment-draft-experience";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { COD_FORMULA_RETIRED_MESSAGE, codOngkirBreakEvenIdr, type CodChargeBreakdown } from "@/lib/mengantar-cod-fee";
import type { PaymentMethod } from "@/lib/payment-method";


export type ShipmentEstimateOption = {
  /** T-193: `codChargeBreakdown` of the amount confirmation would submit. */
  codBreakdown: CodChargeBreakdown | null;
  codEligible: boolean;
  deliveryEstimate: string;
  estimateServiceId: string;
  insuranceAmountIdr: number | null;
  providerService: string;
  shippingAmountIdr: number;
  /** T-186: the shipping Mengantar deducts, the COD Ongkir break-even basis. */
  shippingDeductedIdr?: number;
};

type ShipmentIssuancePanelProps = {
  /** T-199: the shipment holds a never-submitted version 1 COD row; confirmation is refused. */
  codFormulaRetired?: boolean;
  fixtureEnabled: boolean;
  isCod: boolean;
  options: ShipmentEstimateOption[];
  /** T-186: defaults to what `isCod` implies for callers that predate COD Ongkir. */
  paymentMethod?: PaymentMethod;
  shipmentId: string;
  snapshotId: string;
};

const initialState: ShipmentIssuanceActionState = {};
const initialVerificationState: DestinationAreaVerificationState = {};
const idr = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

// T-193: one Biaya COD (Mengantar's 3.33%, VAT inside), and the lines add up to the total.
function breakdownRows(breakdown: CodChargeBreakdown): readonly [string, string, number][] {
  return [
    ["goods", "Nilai barang dideklarasikan", breakdown.goodsValueIdr],
    ["shipping", "Ongkir penyedia", breakdown.shippingAmountIdr],
    ["fee", `Biaya COD Mengantar 3,33% (termasuk PPN ${idr.format(breakdown.codFeeVatIncludedIdr)})`, breakdown.codFeeIdr],
    ...(breakdown.roundingIdr > 0
      ? [["rounding", "Pembulatan ke rupiah", breakdown.roundingIdr] as [string, string, number]]
      : []),
    ["total", "Total ditagih ke pelanggan", breakdown.providerCodAmountIdr],
  ];
}

export function ShipmentIssuancePanel({
  codFormulaRetired = false,
  fixtureEnabled,
  isCod,
  options,
  paymentMethod = isCod ? "COD" : "NON_COD",
  shipmentId,
  snapshotId,
}: ShipmentIssuancePanelProps) {
  const [state, action, pending] = useActionState(confirmShipmentIssuance, initialState);
  const [verificationState, verifyAction, verifyPending] = useActionState(
    verifyShipmentDraftDestinationArea,
    initialVerificationState,
  );
  const [selectedId, setSelectedId] = useState("");
  const [codOngkirValidity, setCodOngkirValidity] = useState<{ id: string; valid: boolean } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.estimateServiceId === selectedId);
  const eligibleOptions = options.filter((option) => !isCod || option.codEligible);
  const codOngkirBasis = paymentMethod === "COD_ONGKIR" ? selected?.shippingDeductedIdr ?? null : null;
  // Refused inline first; the server refuses the same charge again.
  const codOngkirBlocked = paymentMethod === "COD_ONGKIR" && Boolean(selected) && (
    codOngkirBasis === null
    || (codOngkirValidity?.id === selectedId
      ? !codOngkirValidity.valid
      : codOngkirBreakEvenIdr(codOngkirBasis) === null)
  );
  const confirmDisabled = codFormulaRetired || !selected || !fixtureEnabled || pending || codOngkirBlocked;

  useEffect(() => {
    if (state.error || state.issued) resultRef.current?.focus();
  }, [state]);

  return (
    <Card
      aria-busy={pending}
      aria-labelledby="estimasi-heading"
      id="konfirmasi-penerbitan-awb"
      role="region"
    >
      <CardHeader>
        <CardTitle id="estimasi-heading">Pilih layanan dan terbitkan AWB</CardTitle>
        <CardDescription className="max-w-2xl leading-6">
          Konfirmasi ini langsung memproses penerbitan satu kali. Periksa layanan dan nilai sebelum melanjutkan.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-5">

      {codFormulaRetired ? (
        <Alert id="cod-formula-retired" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Kiriman ini tidak dapat dikonfirmasi</AlertTitle>
          <AlertDescription className="grid gap-2">
            <p>{COD_FORMULA_RETIRED_MESSAGE}</p>
            <p><Link className="font-medium underline underline-offset-4" href="/app/pengiriman/baru">Buat kiriman baru</Link></p>
          </AlertDescription>
        </Alert>
      ) : null}

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
          {/* T-199: nothing on a retired-formula shipment can be confirmed, so no service is choosable. */}
          <fieldset className="grid gap-3" disabled={pending || codFormulaRetired}>
            <legend className="text-sm font-medium">Layanan Mengantar yang tersimpan</legend>
            <div className="overflow-hidden rounded-md border">
              <Table
                containerClassName="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
                          <label className="flex min-h-11 min-w-11 items-center justify-center md:min-h-9" title={`Pilih ${option.providerService}`}>
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

          {paymentMethod === "COD_ONGKIR" && selected ? (
            codOngkirBasis === null ? (
              <p className="text-sm text-destructive" role="alert">Ongkir yang dipotong Mengantar untuk layanan ini tidak tersedia. Muat ulang estimasi.</p>
            ) : (
              <CodOngkirCharge
                idPrefix={`issuance-cod-ongkir-${selectedId}`}
                key={selectedId}
                name={COD_ONGKIR_FIELD_NAME}
                onValidityChange={(valid) => setCodOngkirValidity({ id: selectedId, valid })}
                providerService={selected.providerService}
                shippingDeductedIdr={codOngkirBasis}
              />
            )
          ) : codFormulaRetired ? null : selected?.codBreakdown ? (
            <div aria-label="Rincian nilai penagihan COD" className="overflow-hidden rounded-md border" role="region">
              <Table>
                <TableCaption className="px-3 text-left">Rincian penagihan ke pelanggan</TableCaption>
                <TableBody>
                  {breakdownRows(selected.codBreakdown).map(([key, label, amount]) => (
                    <TableRow key={key}>
                      <TableCell className={key === "total" ? "font-medium" : undefined}>{label}</TableCell>
                      <TableCell className="text-right font-mono font-medium tabular-nums">{idr.format(amount)}</TableCell>
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

          <Field className="max-w-2xl items-start" data-disabled={confirmDisabled} orientation="horizontal">
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" disabled={confirmDisabled} id="issuance-confirmation" key={selectedId} name="confirmation" required value="confirmed" />
            <FieldLabel className="font-normal leading-6" htmlFor="issuance-confirmation">Saya sudah memeriksa layanan dan nilai di atas, lalu mengonfirmasi penerbitan AWB satu kali.</FieldLabel>
          </Field>
          <div className="flex border-t pt-4">
            <Button className="min-h-11 max-md:w-full md:min-h-8" disabled={confirmDisabled} type="submit">
              {pending ? "Menerbitkan AWB…" : "Konfirmasi dan terbitkan AWB"}
            </Button>
          </div>
        </form>
      )}

      {/* Once the destination is verified the earlier refusal is answered: keeping the
          destructive alert on screen beside "Tujuan sudah terverifikasi" would tell the
          operator two contradictory things at once. */}
      {state.error && !verificationState.verified ? (
        <Alert aria-live="assertive" ref={resultRef} tabIndex={-1} variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Penerbitan tidak berhasil</AlertTitle>
          <AlertDescription>{state.error} Muat ulang halaman bila estimasi atau status sudah berubah.</AlertDescription>
        </Alert>
      ) : null}
      {state.code === "ORDER_DESTINATION_AREA_UNVERIFIED" && !verificationState.verified ? (
        <Alert id="destination-area-verification">
          <MapPinCheck aria-hidden="true" />
          <AlertTitle>Verifikasi ulang tujuan diperlukan</AlertTitle>
          <AlertDescription className="grid gap-2">
            <p>Cek ulang area tujuan draf ini ke Mengantar sebelum mengonfirmasi lagi. Alamat tidak berubah, hanya diperiksa ulang.</p>
            <form action={verifyAction}>
              <input name="shipmentId" type="hidden" value={shipmentId} />
              <Button className="min-h-11 max-md:w-full md:min-h-8" disabled={verifyPending} size="sm" type="submit" variant="outline">
                {verifyPending ? "Memverifikasi tujuan…" : "Verifikasi ulang tujuan"}
              </Button>
            </form>
            {verificationState.error ? (
              <p aria-live="assertive" className="text-destructive">{verificationState.error}</p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {verificationState.verified ? (
        <Alert aria-live="polite" id="destination-area-verified">
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Tujuan sudah terverifikasi</AlertTitle>
          <AlertDescription>Silakan konfirmasi ulang penerbitan AWB di atas.</AlertDescription>
        </Alert>
      ) : null}
      {state.issued ? (
        <Alert aria-live="polite" ref={resultRef} tabIndex={-1}>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>AWB {state.issued.awb} sudah tersimpan</AlertTitle>
          <AlertDescription>
            <Button asChild className="mt-2 min-h-11 max-md:w-full md:min-h-8" size="sm" variant="outline">
              <Link href={state.issued.labelHref}>Buka label 100 × 150 mm <ExternalLink aria-hidden="true" /></Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      </CardContent>
    </Card>
  );
}
