"use client";

import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { issueShipmentInvoice, previewShipmentInvoice } from "@/app/app/invoice/actions";
import { InvoiceSheet } from "@/app/app/invoice/invoice-sheet";
import type { IssueShipmentInvoiceResult } from "@/db/shipment-invoice-repository";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

/** A refusal code in words; a switch rather than a status-keyed map (the one status-label map lives in shipment-queue). */
function refusalMessage(code: Extract<IssueShipmentInvoiceResult, { ok: false }>["code"]) {
  switch (code) {
    case "CANCELLED": return "Mengantar melaporkan kiriman ini dibatalkan, jadi invoice tidak diterbitkan.";
    case "NOT_FOUND": return "Kiriman tidak ditemukan.";
    case "NOT_ISSUED": return "Invoice terbit setelah resi terbit.";
  }
}

type Preview =
  | { kind: "loading" }
  | { kind: "ready"; result: IssueShipmentInvoiceResult }
  | { kind: "failed" };

/**
 * PR-76: issues the shipment's one invoice (the action returns the existing one on a
 * repeat), then re-reads the server-rendered page. A retry after an error is safe.
 *
 * R6-X (critique 2026-09-30T19-21-59Z #7): an invoice cannot be changed once issued, so the
 * button first opens a confirmation with the nota exactly as it will be issued (a rolled-back dry
 * run of the same statement, `previewShipmentInvoice`); only "Terbitkan invoice" there issues it.
 */
export function IssueInvoiceButton({
  children,
  className,
  icon,
  shipmentNumber,
}: {
  children: string;
  className?: string;
  icon?: ReactNode;
  shipmentNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview>({ kind: "loading" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const loadPreview = () => {
    setPreview({ kind: "loading" });
    previewShipmentInvoice(shipmentNumber)
      .then((result) => setPreview({ kind: "ready", result }))
      .catch(() => setPreview({ kind: "failed" }));
  };

  const issue = () => startTransition(async () => {
    setError(null);
    try {
      const result = await issueShipmentInvoice(shipmentNumber);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(refusalMessage(result.code));
      }
    } catch {
      setError("Invoice belum dapat diterbitkan. Coba lagi.");
    }
  });

  const refusal = preview.kind === "ready" && !preview.result.ok ? refusalMessage(preview.result.code) : null;
  const ready = preview.kind === "ready" && preview.result.ok ? preview.result.invoice : null;

  return (
    <Dialog
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) { setError(null); loadPreview(); }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button className={className} type="button">
          {icon}
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-6 p-6 sm:max-w-lg" onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Terbitkan invoice?</DialogTitle>
          <DialogDescription>
            Periksa nota di bawah. Setelah terbit, invoice tidak dapat diubah atau dihapus; cetak ulang selalu sama.
          </DialogDescription>
        </DialogHeader>
        <div aria-busy={preview.kind === "loading" || undefined} aria-label="Pratinjau invoice" className="invoice-preview" role="region">
          {preview.kind === "loading" ? (
            <div className="grid gap-2" data-slot="invoice-preview-loading">
              <span className="sr-only">Menyiapkan pratinjau…</span>
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : ready ? (
            <InvoiceSheet invoice={ready} medium="80mm" />
          ) : (
            <p className="text-sm">{refusal ?? "Pratinjau belum dapat dibuat. Tutup lalu coba lagi."}</p>
          )}
        </div>
        {error ? (
          <Alert role="alert" variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Invoice belum terbit</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter className="-mx-6 -mb-6 -bottom-6 px-6">
          <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">Batal</Button>
          <Button disabled={!ready || pending} onClick={issue} type="button">
            {pending ? "Menerbitkan invoice…" : "Terbitkan invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
