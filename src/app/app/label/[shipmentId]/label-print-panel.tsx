"use client";

import { CircleAlert, CircleCheck, FileText, Printer } from "lucide-react";
import Link from "next/link";
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

/**
 * Below 1024px the preview fills the first screen, so the page's one primary print control is
 * pinned to the bottom of the viewport instead of being duplicated: the same element, restyled
 * (`max-lg:fixed`), keeps its place in the tab order after the size choice. It carries the 44px
 * target and the safe-area inset (the Buat kiriman bar's pattern), and never prints — the whole
 * card is `label-hide`, and the bar is `print:hidden` as well.
 */
const MOBILE_PRINT_BAR =
  "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:flex max-lg:flex-col max-lg:items-end max-lg:border-t max-lg:bg-card max-lg:px-4 max-lg:pt-3 max-lg:pb-[max(--spacing(3),env(safe-area-inset-bottom))] max-lg:shadow-lg max-sm:items-stretch print:hidden";
const BAR_BUTTON = "max-sm:w-full max-lg:h-11";

function PrintButton({ outline, reprint, size }: { outline?: boolean; reprint: boolean; size: LabelSize }) {
  const { pending } = useFormStatus();
  return (
    <Button className={BAR_BUTTON} disabled={pending} type="submit" variant={outline ? "outline" : "default"}>
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
 *
 * T-263: the preview comes first in the DOM, so a phone shows it before the print card (from
 * 1024px it still sits in the right column), and the page has one print button per job: the
 * invoice is a mode switch in the card (`invoiceToggle`), not a second print entry in the header.
 */
export function LabelPrintPanel({
  children,
  both,
  history,
  initialAttemptId,
  invoiceToggle,
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
  /** "Sertakan invoice" / "Tanpa invoice": the link between the two modes. */
  invoiceToggle: { href: string; label: string };
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
  // The one control the mobile bar pins: issue the invoice, else the label until it is recorded,
  // then (with an invoice) step 2's invoice print.
  const barHolder = issuing ? "issue" : invoice && state.printed ? "invoice" : "label";

  return (
    // max-lg:pb-24 keeps the page's last card clear of the fixed print bar.
    <div className="grid gap-6 print:block print:pb-0 max-lg:pb-24 lg:grid-cols-3 lg:items-start">
      {/* T-243: a lone label preview stays beside the size cards while the history scrolls. */}
      <div className={cn("grid min-w-0 gap-6 print:static print:block lg:col-start-3 lg:row-start-1", !invoice && "lg:sticky lg:top-20")}>
        <div className="label-print-group grid min-w-0 gap-2 print:block">
          <LabelPrintContext.Provider value={{ size }}>
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
      <div className="label-hide grid min-w-0 gap-6 lg:col-span-2 lg:col-start-1 lg:row-start-1">
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
                <div className={MOBILE_PRINT_BAR} data-slot="mobile-print-bar">
                  <IssueInvoiceButton className={BAR_BUTTON} icon={<Printer aria-hidden="true" />} shipmentNumber={both.shipmentNumber}>
                    Cetak resi + invoice
                  </IssueInvoiceButton>
                </div>
              ) : (
                <form
                  action={action}
                  className={barHolder === "label" ? MOBILE_PRINT_BAR : undefined}
                  data-slot={barHolder === "label" ? "mobile-print-bar" : undefined}
                >
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
            <Link
              className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-primary underline-offset-4 hover:underline md:min-h-6"
              href={invoiceToggle.href}
            >
              <FileText aria-hidden="true" className="size-4" />
              {invoiceToggle.label}
            </Link>
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
                <div
                  className={barHolder === "invoice" ? MOBILE_PRINT_BAR : undefined}
                  data-slot={barHolder === "invoice" ? "mobile-print-bar" : undefined}
                >
                  <Button
                    className={BAR_BUTTON}
                    onClick={() => printGroup("invoice")}
                    type="button"
                    variant={state.printed ? "default" : "outline"}
                  >
                    <FileText aria-hidden="true" />
                    Cetak invoice {INVOICE_MEDIA[medium].name}
                  </Button>
                </div>
                <p className="font-mono text-xs text-muted-foreground">{invoice.invoiceNumber}</p>
              </div>
            </CardContent>
          </Card>
        ) : null}
        {history}
      </div>
    </div>
  );
}
