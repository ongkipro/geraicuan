import { ArrowLeft, CircleAlert, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InvoicePrintPanel } from "@/app/app/invoice/[shipmentNumber]/invoice-print-panel";
import { IssueInvoiceButton } from "@/app/app/invoice/issue-invoice-button";
import { requireTenantPrincipal } from "@/app/app/pengiriman/_list/tenant-page";
import { DataCard } from "@/components/app/data-card";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { LabelUnavailableError, loadPrintableLabel } from "@/db/label-print-repository";
import { loadShipmentInvoice } from "@/db/shipment-invoice-repository";
import { resolveShipmentRouteKey } from "@/db/shipment-number-repository";
import { withTenantContext } from "@/db/tenant-context";
import { parseShipmentRouteKey } from "@/lib/shipment-number";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

function BackToDetail({ shipmentNumber }: { shipmentNumber: number }) {
  return (
    <Link className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-primary hover:underline md:min-h-6" href={`/app/pengiriman/${shipmentNumber}`}>
      <ArrowLeft aria-hidden="true" className="size-4" />
      Kembali ke detail kiriman
    </Link>
  );
}

export default async function InvoicePage({ params }: { params: Promise<{ shipmentNumber: string }> }) {
  const principal = await requireTenantPrincipal();
  const { shipmentNumber: routeKey } = await params;

  // PR-44, as `resolveShipmentRoute` does for detail and label: `GC-10013` or a UUID
  // redirects to `/app/invoice/10013`; unknown or another tenant's is 404.
  const key = parseShipmentRouteKey(routeKey);
  if (!key) notFound();
  const detail = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    const resolved = await resolveShipmentRouteKey(tx, context, key);
    if (!resolved) return { kind: "not-found" as const };
    if (key.kind !== "number" || !key.canonical) return { kind: "redirect" as const, tenantNumber: resolved.tenantNumber };
    const invoice = await loadShipmentInvoice(tx, context, resolved.shipmentId);
    if (invoice) return { invoice, kind: "issued" as const, tenantNumber: resolved.tenantNumber };
    try {
      const label = await loadPrintableLabel(tx, context, resolved.shipmentId);
      return { kind: "absent" as const, publicReference: label.publicReference, tenantNumber: resolved.tenantNumber };
    } catch (error) {
      if (!(error instanceof LabelUnavailableError)) throw error;
      if (error.reason === "NOT_FOUND") return { kind: "not-found" as const };
      return { kind: "not-issued" as const, tenantNumber: resolved.tenantNumber };
    }
  });
  if (detail.kind === "not-found") notFound();
  if (detail.kind === "redirect") redirect(`/app/invoice/${detail.tenantNumber}`);

  const back = <BackToDetail shipmentNumber={detail.tenantNumber} />;

  if (detail.kind === "not-issued") {
    return (
      <>
        <PageHeader back={back} eyebrow="Pengiriman" title="Invoice" />
        <Alert role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Invoice terbit setelah resi terbit</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>Kiriman ini belum punya nomor resi dari Mengantar.</p>
            <div>
              <Button asChild variant="outline">
                <Link href={`/app/pengiriman/${detail.tenantNumber}`}>Buka detail kiriman</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </>
    );
  }

  if (detail.kind === "absent") {
    return (
      <>
        <PageHeader
          back={back}
          description={<>Kiriman <span className="font-mono">{detail.publicReference}</span></>}
          eyebrow="Pengiriman"
          title="Invoice"
        />
        <DataCard title="Invoice belum diterbitkan">
          <p className="text-sm">Invoice dibuat sekali dari data resi ini dan dicetak ulang tanpa berubah.</p>
          <IssueInvoiceButton
            className="max-sm:w-full"
            icon={<FileText aria-hidden="true" />}
            shipmentNumber={String(detail.tenantNumber)}
          >
            Terbitkan invoice
          </IssueInvoiceButton>
        </DataCard>
      </>
    );
  }

  return (
    <>
      <div className="label-hide">
        <PageHeader
          back={back}
          eyebrow="Pengiriman"
          title={<>Invoice <span className="font-mono">{detail.invoice.invoiceNumber}</span></>}
        />
      </div>
      <InvoicePrintPanel invoice={detail.invoice} />
    </>
  );
}
