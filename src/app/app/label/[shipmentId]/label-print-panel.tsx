"use client";

import { CircleAlert, CircleCheck, FileText, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { InvoiceMediaCards, InvoicePreview } from "@/app/app/invoice/invoice-media";
import { DEFAULT_INVOICE_MEDIUM, INVOICE_MEDIA, InvoiceSheet, type InvoiceMedium } from "@/app/app/invoice/invoice-sheet";
import { IssueInvoiceButton } from "@/app/app/invoice/issue-invoice-button";
import { printGroup } from "@/app/app/invoice/print-group";
import { useGeraiBrand } from "@/app/app/brand/gerai-brand";
import { recordLabelPrint, type LabelPrintActionState } from "@/app/app/label/[shipmentId]/actions";
import { LabelPreviewFrame } from "@/app/app/label/[shipmentId]/label-preview-frame";
import { LabelPrintContext } from "@/app/app/label/[shipmentId]/label-print-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShipmentInvoice } from "@/db/shipment-invoice-repository";
import { formatWibDateTime } from "@/lib/label-format";
import { cn } from "@/lib/utils";
import { LABEL_SIZES, readStoredLabelSize, writeStoredLabelSize, type LabelSize } from "@/lib/label-size";

const browserStorage = () => (typeof window === "undefined" ? undefined : window.localStorage);
const subscribeToStorage = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

const SIZE_OPTIONS: { description: string; size: LabelSize }[] = [
  { description: "Label paket 10 × 10 cm dan bukti pengirim 10 × 5 cm, dipotong di garis putus-putus.", size: "10x15" },
  { description: "Label paket saja, tanpa bukti pengirim.", size: "10x10" },
];

function PrintButton({ outline, reprint, size }: { outline?: boolean; reprint: boolean; size: LabelSize }) {
  const { pending } = useFormStatus();
  return (
    <Button className="max-sm:w-full" disabled={pending} type="submit" variant={outline ? "outline" : "default"}>
      <Printer aria-hidden="true" />
      {pending ? "Menyiapkan cetak…" : `${reprint ? "Cetak ulang label" : "Cetak label"} ${LABEL_SIZES[size].name}`}
    </Button>
  );
}

/**
 * Spec 17 §UX-v3.6 `/app/label/[n]`: size cards + **Cetak label** + the print history on the
 * left, the sheet on the right. The preview is the print: the same `LabelSheet`, scaled to fit
 * the column on screen only (print resets the zoom to 1). A print is recorded first
 * (`recordLabelPrint`), then the browser's print dialog opens.
 *
 * `both` is **Cetak resi + invoice** (UX-v3.9). Before the invoice exists its primary issues
 * it (idempotent). Once it exists the label and the nota print as two ordered jobs because
 * their media differ: step 1 records and prints the label, step 2 prints the invoice; the
 * primary moves to step 2 once step 1 is recorded.
 */
export function LabelPrintPanel({
  children,
  both,
  history,
  initialAttemptId,
  lastPrintedAt,
  operatorId,
  printCount,
  shipmentId,
}: {
  /** The server-rendered `LabelSheet`; it reads the size and handover time from context. */
  children: ReactNode;
  both?: { invoice: ShipmentInvoice | null; shipmentNumber: string };
  history: ReactNode;
  initialAttemptId: string;
  lastPrintedAt: string | null;
  operatorId: string;
  printCount: number;
  shipmentId: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(recordLabelPrint, {} as LabelPrintActionState);
  // T-243: the gerai's default size (Informasi label) unless this operator chose one here.
  const { defaultLabelSize } = useGeraiBrand();
  const remembered = useSyncExternalStore(
    subscribeToStorage,
    () => readStoredLabelSize(browserStorage, operatorId, defaultLabelSize),
    () => defaultLabelSize,
  );
  const [chosen, setChosen] = useState<LabelSize | null>(null);
  const size = chosen ?? remembered;
  const lastPrintToken = useRef<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [medium, setMedium] = useState<InvoiceMedium>(DEFAULT_INVOICE_MEDIUM);

  useEffect(() => {
    if (state.printed || state.blocked || state.error) resultRef.current?.focus();
  }, [state]);

  useEffect(() => {
    const token = state.printed?.token;
    if (!token || lastPrintToken.current === token) return;
    lastPrintToken.current = token;
    printGroup("label");
    // The history card and the print count are server-rendered; re-read them.
    router.refresh();
  }, [router, state.printed?.token]);

  const recordedCount = state.printed ? Math.max(printCount, state.printed.sequence) : printCount;
  const recordedAt = state.printed?.printedAt ?? lastPrintedAt;
  const invoice = both?.invoice ?? null;
  const issuing = Boolean(both && !invoice);

  return (
    <div className="grid gap-6 print:block lg:grid-cols-3 lg:items-start">
      <div className="label-hide grid min-w-0 gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base font-semibold" id="ukuran-label">{invoice ? "Langkah 1 · Label termal" : "Ukuran label termal"}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <fieldset aria-labelledby="ukuran-label" className="grid gap-3 sm:grid-cols-2">
              {SIZE_OPTIONS.map((option) => (
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-4 has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring"
                  key={option.size}
                >
                  <span className="grid flex-1 gap-1">
                    <span className="text-sm font-bold">{LABEL_SIZES[option.size].name}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </span>
                  <input
                    checked={size === option.size}
                    className="mt-1 size-4 shrink-0 accent-primary"
                    name="label-size"
                    onChange={() => {
                      setChosen(option.size);
                      writeStoredLabelSize(browserStorage, operatorId, option.size);
                    }}
                    type="radio"
                    value={option.size}
                  />
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {issuing && both ? (
                <IssueInvoiceButton className="max-sm:w-full" icon={<Printer aria-hidden="true" />} shipmentNumber={both.shipmentNumber}>
                  Cetak resi + invoice
                </IssueInvoiceButton>
              ) : (
                <form action={action}>
                  <input name="shipmentId" type="hidden" value={shipmentId} />
                  <input name="attemptId" type="hidden" value={state.nextAttemptId ?? initialAttemptId} />
                  <PrintButton outline={Boolean(invoice && state.printed)} reprint={recordedCount > 0} size={size} />
                </form>
              )}
              <p className="text-xs text-muted-foreground">
                {recordedCount === 0
                  ? "Belum ada permintaan cetak."
                  : `${recordedCount}× dicetak${recordedAt ? ` · terakhir ${formatWibDateTime(recordedAt)}` : ""}`}
              </p>
            </div>
            {state.printed || state.blocked || state.error ? (
              <div ref={resultRef} tabIndex={-1}>
                {state.printed ? (
                  <Alert role="status">
                    <CircleCheck aria-hidden="true" />
                    <AlertTitle>Permintaan cetak ke-{state.printed.sequence} tercatat</AlertTitle>
                    <AlertDescription>Jika dialog cetak tidak terbuka, tekan Ctrl+P (⌘P) dengan kertas {LABEL_SIZES[size].name}.</AlertDescription>
                  </Alert>
                ) : state.blocked ? (
                  <Alert role="status">
                    <CircleAlert aria-hidden="true" />
                    <AlertTitle>{state.blocked === "CANCELLED"
                      ? "Kiriman dibatalkan — label tidak dapat dicetak"
                      : state.blocked === "AWAITING_UPSTREAM_PAYMENT" ? "Menunggu pelunasan Mengantar" : "Label belum tersedia"}</AlertTitle>
                    <AlertDescription>{state.blocked === "CANCELLED"
                      ? "Mengantar melaporkan pesanan ini dibatalkan."
                      : "Label dapat dicetak setelah Mengantar menerbitkan nomor resi."}</AlertDescription>
                  </Alert>
                ) : (
                  <Alert role="alert" variant="destructive">
                    <CircleAlert aria-hidden="true" />
                    <AlertTitle>Permintaan cetak tidak dapat dicatat</AlertTitle>
                    <AlertDescription>{state.error}</AlertDescription>
                  </Alert>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
        {invoice ? (
          <Card>
            <CardHeader>
              <CardTitle><h2 className="text-base font-semibold" id="media-invoice">Langkah 2 · Invoice</h2></CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <InvoiceMediaCards labelledBy="media-invoice" medium={medium} onChange={setMedium} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  className="max-sm:w-full"
                  onClick={() => printGroup("invoice")}
                  type="button"
                  variant={state.printed ? "default" : "outline"}
                >
                  <FileText aria-hidden="true" />
                  Cetak invoice {INVOICE_MEDIA[medium].name}
                </Button>
                <p className="font-mono text-xs text-muted-foreground">{invoice.invoiceNumber}</p>
              </div>
            </CardContent>
          </Card>
        ) : null}
        {history}
      </div>
      {/* T-243: a lone label preview stays beside the size cards while the history scrolls. */}
      <div className={cn("grid min-w-0 gap-6 print:static print:block", !invoice && "lg:sticky lg:top-20")}>
        <div className="label-print-group grid min-w-0 gap-2 print:block">
          <LabelPrintContext.Provider value={{ printedAt: state.printed?.printedAt ?? null, size }}>
            <LabelPreviewFrame
              label={`Pratinjau label ${LABEL_SIZES[size].name}, sama dengan hasil cetak`}
              size={size}
              title="Pratinjau kertas termal"
            >
              {children}
            </LabelPreviewFrame>
          </LabelPrintContext.Provider>
        </div>
        {invoice ? (
          <div className="invoice-print-group grid min-w-0 gap-2 print:block">
            <p aria-hidden="true" className="label-hide text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Pratinjau invoice {INVOICE_MEDIA[medium].name}
            </p>
            <InvoicePreview label={`Pratinjau invoice ${INVOICE_MEDIA[medium].name}, sama dengan hasil cetak`}>
              <InvoiceSheet invoice={invoice} medium={medium} />
            </InvoicePreview>
          </div>
        ) : null}
      </div>
    </div>
  );
}
