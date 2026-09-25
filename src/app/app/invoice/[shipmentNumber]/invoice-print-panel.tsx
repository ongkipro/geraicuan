"use client";

import { Printer } from "lucide-react";
import { useState } from "react";

import { InvoiceMediaCards, InvoicePreview } from "@/app/app/invoice/invoice-media";
import { DEFAULT_INVOICE_MEDIUM, INVOICE_MEDIA, InvoiceSheet, type InvoiceMedium } from "@/app/app/invoice/invoice-sheet";
import { printGroup } from "@/app/app/invoice/print-group";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShipmentInvoice } from "@/db/shipment-invoice-repository";
import { formatWibDateTime } from "@/lib/label-format";

/**
 * Spec 17 `/app/invoice/[n]`: media cards + **Cetak invoice** on the left, the stored
 * nota on the right. A reprint renders the snapshot only; nothing is issued again.
 */
export function InvoicePrintPanel({ invoice }: { invoice: ShipmentInvoice }) {
  const [medium, setMedium] = useState<InvoiceMedium>(DEFAULT_INVOICE_MEDIUM);

  return (
    <div className="grid gap-6 print:block lg:grid-cols-3 lg:items-start">
      <div className="label-hide grid min-w-0 gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle><h2 className="text-base font-semibold" id="media-invoice">Media cetak</h2></CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <InvoiceMediaCards labelledBy="media-invoice" medium={medium} onChange={setMedium} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button className="max-sm:w-full" onClick={() => printGroup("invoice")} type="button">
                <Printer aria-hidden="true" />
                Cetak invoice
              </Button>
              <p className="text-xs text-muted-foreground">Terbit {formatWibDateTime(invoice.issuedAt)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="grid min-w-0 gap-2 print:block">
        <p aria-hidden="true" className="label-hide text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Pratinjau {INVOICE_MEDIA[medium].name}
        </p>
        <InvoicePreview label={`Pratinjau invoice ${INVOICE_MEDIA[medium].name}, sama dengan hasil cetak`}>
          <InvoiceSheet invoice={invoice} medium={medium} />
        </InvoicePreview>
      </div>
    </div>
  );
}
