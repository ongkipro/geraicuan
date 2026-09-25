"use client";

import { CircleAlert, CircleCheck, FileText, Printer } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";

import { InvoiceMediaCards, InvoicePreview } from "@/app/app/invoice/invoice-media";
import { DEFAULT_INVOICE_MEDIUM, INVOICE_MEDIA, InvoiceSheet, type InvoiceMedium } from "@/app/app/invoice/invoice-sheet";
import { printGroup } from "@/app/app/invoice/print-group";
import { LabelPrintContext } from "@/app/app/label/[shipmentId]/label-print-context";
import { recordBatchLabelPrints, type BatchLabelPrintResult } from "@/app/app/label/cetak/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShipmentInvoice } from "@/db/shipment-invoice-repository";
import { LABEL_SIZES, type LabelSize } from "@/lib/label-size";

/** `.label-sheet` is 100 mm wide at every size (label.css, T-176); CSS px are 96 per inch. */
const LABEL_SHEET_WIDTH_PX = (100 * 96) / 25.4;

/**
 * PR-87 batch print view. Labels (100 mm) and invoices (80 mm roll / A4) are different
 * media, so each is its own print job: step 1 records one print request per label
 * (`recordBatchLabelPrints` → `recordLabelPrint`) and prints the labels, step 2 prints
 * the invoices. The filled primary is the next step.
 */
export function BatchPrintPanel({
  attempts,
  invoices,
  labels,
  size,
}: {
  /** One attempt id per label shipment, generated on the server for this view. */
  attempts: { shipmentId: string; attemptId: string }[];
  invoices: ShipmentInvoice[];
  /** The server-rendered `LabelSheet`s, in order; they read the size from context. */
  labels: ReactNode | null;
  size: LabelSize;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BatchLabelPrintResult | null>(null);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [nextAttempts, setNextAttempts] = useState(attempts);
  const [medium, setMedium] = useState<InvoiceMedium>(DEFAULT_INVOICE_MEDIUM);
  const preview = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const hasLabels = attempts.length > 0;
  const hasInvoices = invoices.length > 0;
  const both = hasLabels && hasInvoices;
  const labelsDone = result !== null && result.failed === 0;

  useEffect(() => {
    const region = preview.current;
    if (!region) return;
    const fit = () => {
      const style = getComputedStyle(region);
      const available = region.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setZoom(Math.min(1, Math.max(available, 0) / LABEL_SHEET_WIDTH_PX));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(region);
    return () => observer.disconnect();
  }, []);

  function printLabels() {
    startTransition(async () => {
      setError(false);
      try {
        const outcome = await recordBatchLabelPrints(nextAttempts);
        setResult(outcome);
        setRecordedAt(new Date().toISOString());
        setNextAttempts(nextAttempts.map((entry) => ({ ...entry, attemptId: outcome.nextAttemptIds[entry.shipmentId] ?? entry.attemptId })));
        if (outcome.printed > 0) printGroup("label");
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="grid gap-6 print:block lg:grid-cols-3 lg:items-start">
      <div className="label-hide grid min-w-0 gap-6 lg:col-span-2">
        {hasLabels ? (
          <Card>
            <CardHeader>
              <CardTitle><h2 className="text-base font-semibold">{both ? "Langkah 1 · Label termal" : "Label termal"}</h2></CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm">{attempts.length} label · {LABEL_SIZES[size].name}</p>
              <div>
                <Button className="max-sm:w-full" disabled={pending} onClick={printLabels} type="button" variant={labelsDone && both ? "outline" : "default"}>
                  <Printer aria-hidden="true" />
                  {pending ? "Menyiapkan cetak…" : `${result ? "Cetak ulang" : "Cetak"} ${attempts.length} label`}
                </Button>
              </div>
              {result ? (
                <Alert role="status" variant={result.failed > 0 ? "destructive" : "default"}>
                  {result.failed > 0 ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                  <AlertTitle>{result.printed} permintaan cetak tercatat</AlertTitle>
                  <AlertDescription>
                    {result.blocked > 0 ? `${result.blocked} label diblokir karena resi belum terbit. ` : ""}
                    {result.failed > 0 ? `${result.failed} gagal dicatat; tekan Cetak ulang untuk mencoba lagi. ` : ""}
                    Jika dialog cetak tidak terbuka, tekan Ctrl+P (⌘P) dengan kertas {LABEL_SIZES[size].name}.
                  </AlertDescription>
                </Alert>
              ) : null}
              {error ? (
                <Alert role="alert" variant="destructive">
                  <CircleAlert aria-hidden="true" />
                  <AlertTitle>Permintaan cetak tidak dapat dicatat</AlertTitle>
                  <AlertDescription>Coba lagi. Label yang sudah tercatat tidak dicatat dua kali.</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {hasInvoices ? (
          <Card>
            <CardHeader>
              <CardTitle><h2 className="text-base font-semibold" id="media-invoice">{both ? "Langkah 2 · Invoice" : "Invoice"}</h2></CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <InvoiceMediaCards labelledBy="media-invoice" medium={medium} onChange={setMedium} />
              <div>
                <Button
                  className="max-sm:w-full"
                  onClick={() => printGroup("invoice")}
                  type="button"
                  variant={!both || labelsDone ? "default" : "outline"}
                >
                  <FileText aria-hidden="true" />
                  Cetak {invoices.length} invoice {INVOICE_MEDIA[medium].name}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-6 print:block">
        {hasLabels ? (
          <div className="label-print-group grid min-w-0 gap-2 print:block">
            <p aria-hidden="true" className="label-hide text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Pratinjau label {LABEL_SIZES[size].name}
            </p>
            <LabelPrintContext.Provider value={{ printedAt: recordedAt, size }}>
              <div
                aria-label={`Pratinjau ${attempts.length} label ${LABEL_SIZES[size].name}, sama dengan hasil cetak`}
                className="label-preview print-sequence [&>.label-sheet]:[zoom:var(--label-preview-zoom,1)] print:[&>.label-sheet]:[zoom:1]"
                ref={preview}
                role="region"
                style={{ "--label-preview-zoom": zoom } as CSSProperties}
              >
                {labels}
              </div>
            </LabelPrintContext.Provider>
          </div>
        ) : null}
        {hasInvoices ? (
          <div className="invoice-print-group grid min-w-0 gap-2 print:block">
            <p aria-hidden="true" className="label-hide text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Pratinjau invoice {INVOICE_MEDIA[medium].name}
            </p>
            <InvoicePreview label={`Pratinjau ${invoices.length} invoice ${INVOICE_MEDIA[medium].name}, sama dengan hasil cetak`}>
              {invoices.map((invoice) => <InvoiceSheet invoice={invoice} key={invoice.id} medium={medium} />)}
            </InvoicePreview>
          </div>
        ) : null}
      </div>
    </div>
  );
}
