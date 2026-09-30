import { randomUUID } from "node:crypto";

import { ArrowLeft, CircleAlert, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GeraiBrandProvider } from "@/app/app/brand/gerai-brand";
import { awbBarcodeFits } from "@/app/app/label/[shipmentId]/label-barcode";
import { LabelPrintPanel } from "@/app/app/label/[shipmentId]/label-print-panel";
import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import { printEventOutcome } from "@/app/app/label/[shipmentId]/print-event";
import { requireTenantPrincipal } from "@/app/app/pengiriman/_list/tenant-page";
import { resolveShipmentRoute } from "@/app/app/shipment-route";
import { DataCard } from "@/components/app/data-card";
import { MoneyBreakdown, MoneyInconsistentAlert } from "@/components/app/money-breakdown";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { LabelUnavailableError, listPrintEvents, loadPrintableLabel } from "@/db/label-print-repository";
import { loadShipmentInvoice } from "@/db/shipment-invoice-repository";
import { withTenantContext } from "@/db/tenant-context";
import { loadPrintBrand, loadTenantLabelFields } from "@/db/tenant-settings-repository";
import { formatWibDateTime, recipientDensity } from "@/lib/label-format";

export const metadata: Metadata = { title: "Label kiriman", robots: { index: false } };

function BackToList() {
  return (
    <Link className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-primary hover:underline md:min-h-6" href="/app/label">
      <ArrowLeft aria-hidden="true" className="size-4" />
      Kembali ke daftar cetak resi
    </Link>
  );
}

export default async function LabelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ shipmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireTenantPrincipal();
  const { shipmentId: routeKey } = await params;
  // UX-v3.9: `?invoice=1` (the detail rail's "Cetak resi + invoice", or "Sertakan invoice" here) adds the nota.
  const withInvoice = (await searchParams).invoice === "1";
  // PR-44: a UUID or `GC-10013` redirects to `/app/label/10013`; unknown or foreign is 404.
  const shipmentId = await resolveShipmentRoute(principal, routeKey, "/app/label");

  const detail = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    try {
      const label = await loadPrintableLabel(tx, context, shipmentId);
      const events = await listPrintEvents(tx, context, shipmentId);
      const invoice = withInvoice ? await loadShipmentInvoice(tx, context, shipmentId) : null;
      // PR-86: the gerai's Informasi label choice, per size; the sheet applies the chosen size's.
      const fields = await loadTenantLabelFields(tx, context);
      // T-243: gerai logo, catatan resi and default size for the sheet and the nota.
      const brand = await loadPrintBrand(tx, context);
      return { brand, events, fields, invoice, kind: "ready" as const, label };
    } catch (error) {
      if (!(error instanceof LabelUnavailableError)) throw error;
      if (error.reason === "NOT_FOUND") return { kind: "not-found" as const };
      return { kind: "blocked" as const, reason: error.reason };
    }
  });
  if (detail.kind === "not-found") notFound();

  if (detail.kind === "blocked" && detail.reason === "CANCELLED") {
    // T-238 (owner): Mengantar cancelled the order; the print action refuses it too.
    return (
      <>
        <PageHeader back={<BackToList />} eyebrow="Pengiriman" title="Label kiriman" />
        <Alert role="alert" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Kiriman dibatalkan — label tidak dapat dicetak</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>Mengantar melaporkan pesanan ini dibatalkan. Invoice yang sudah terbit tetap dapat dibuka.</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href={`/app/pengiriman/${routeKey}`}>Buka detail kiriman</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/app/invoice/${routeKey}`}><FileText aria-hidden="true" />Invoice</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </>
    );
  }

  if (detail.kind === "blocked") {
    const awaiting = detail.reason === "AWAITING_UPSTREAM_PAYMENT";
    return (
      <>
        <PageHeader back={<BackToList />} eyebrow="Pengiriman" title="Label kiriman" />
        <Alert role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{awaiting ? "Menunggu pelunasan Mengantar" : "Label belum tersedia"}</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>{awaiting
              ? "Kiriman non-COD ini belum lunas di Mengantar, jadi belum punya nomor resi."
              : "Label dapat dicetak setelah Mengantar menerbitkan nomor resi."}</p>
            <div>
              <Button asChild variant="outline">
                <Link href={`/app/pengiriman/${routeKey}`}>Buka detail kiriman</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </>
    );
  }

  // T-269: `money` and the label's seller-side fields were decided by role in `loadPrintableLabel`.
  const { brand, events, fields, invoice, label: { money, ...label } } = detail;
  const labelHref = `/app/label/${routeKey}`;
  const recipientLayout = recipientDensity({
    addressLength: label.recipient.address.length,
    areaLabelLength: label.destinationAreaLabel.length,
    nameLength: label.recipient.name.length,
  });

  return (
    <>
      <div className="label-hide">
        {/* T-263: no print action in the header — the card below holds the page's one print button
            per job, and the invoice is a mode switch there ("Sertakan invoice" / "Tanpa invoice"). */}
        <PageHeader
          back={<BackToList />}
          description={withInvoice ? "Periksa pratinjau, cetak label, lalu invoice." : "Periksa pratinjau, pilih ukuran, lalu cetak."}
          eyebrow="Pengiriman"
          title={<>Label <span className="font-mono">{label.awb}</span></>}
        />
      </div>

      {recipientLayout.overCapacity ? (
        <Alert className="label-hide" role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Alamat melebihi kapasitas label</AlertTitle>
          <AlertDescription>
            <p>Sebagian alamat penerima ({label.recipient.address.length} karakter) tidak tercetak. Periksa alamat sebelum menyerahkan paket.</p>
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-2 font-medium">Lihat alamat lengkap</summary>
              <p className="wrap-anywhere whitespace-pre-wrap">{label.recipient.address}</p>
            </details>
          </AlertDescription>
        </Alert>
      ) : null}
      {/* A COD label whose breakdown does not add up still prints the Mengantar total and hides
          the lines (label-sheet.tsx); this warning is advisory and never blocks the print. */}
      {money.kind === "inconsistent" ? (
        <MoneyInconsistentAlert
          amountIdr={money.collect.amountIdr}
          checkHref={`/app/pengiriman/${routeKey}`}
          className="label-hide"
          method={money.method}
        />
      ) : null}
      {awbBarcodeFits(label.awb) ? null : (
        <Alert className="label-hide" role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Barcode resi tidak dicetak</AlertTitle>
          <AlertDescription>Nomor resi terlalu panjang untuk barcode selebar 10 cm; hanya teksnya yang dicetak.</AlertDescription>
        </Alert>
      )}

      <GeraiBrandProvider value={brand}>
      <LabelPrintPanel
        both={withInvoice ? { invoice, shipmentNumber: routeKey } : undefined}
        history={
          <>
          {money.kind === "inconsistent" ? null : (
            <DataCard title="Rincian uang">
              <MoneyBreakdown money={money} />
            </DataCard>
          )}
          <DataCard title="Riwayat permintaan cetak">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada riwayat cetak.</p>
            ) : (
              <ol className="divide-y">
                {events.map((event, index) => (
                  <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0" key={`${event.printedAt.toISOString()}-${index}`}>
                    <span className="grid gap-0.5">
                      <span className="text-sm font-semibold tabular-nums">
                        {event.sequence ? `Cetak ke-${event.sequence}` : "Tidak dicetak"} · {printEventOutcome(event)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {event.actorRole === "TENANT_ADMIN" ? "Pemilik gerai" : "Operator"} · {event.actorNameMasked}
                      </span>
                    </span>
                    <time className="text-xs text-muted-foreground tabular-nums" dateTime={event.printedAt.toISOString()}>
                      {formatWibDateTime(event.printedAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </DataCard>
          </>
        }
        initialAttemptId={randomUUID()}
        invoiceToggle={withInvoice ? { href: labelHref, label: "Tanpa invoice" } : { href: `${labelHref}?invoice=1`, label: "Sertakan invoice" }}
        lastPrintedAt={label.lastPrintedAt?.toISOString() ?? null}
        operatorId={principal.userId}
        printCount={label.printCount}
        shipmentId={label.shipmentId}
      >
        <LabelSheet fields={fields} label={label} />
      </LabelPrintPanel>
      </GeraiBrandProvider>
    </>
  );
}
