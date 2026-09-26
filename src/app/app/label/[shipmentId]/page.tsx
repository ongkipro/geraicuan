import { randomUUID } from "node:crypto";

import { ArrowLeft, CircleAlert, FileText, Printer, Tag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { awbBarcodeFits } from "@/app/app/label/[shipmentId]/label-barcode";
import { LabelPrintPanel } from "@/app/app/label/[shipmentId]/label-print-panel";
import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import { printEventOutcome } from "@/app/app/label/[shipmentId]/print-event";
import { requireTenantPrincipal } from "@/app/app/pengiriman/_list/tenant-page";
import { resolveShipmentRoute } from "@/app/app/shipment-route";
import { DataCard } from "@/components/app/data-card";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { LabelUnavailableError, listPrintEvents, loadPrintableLabel } from "@/db/label-print-repository";
import { loadShipmentInvoice } from "@/db/shipment-invoice-repository";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantLabelFields } from "@/db/tenant-settings-repository";
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
  // UX-v3.9 "Cetak resi + invoice": `?invoice=1` (from the detail rail) adds the nota.
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
      return { events, fields, invoice, kind: "ready" as const, label };
    } catch (error) {
      if (!(error instanceof LabelUnavailableError)) throw error;
      if (error.reason === "NOT_FOUND") return { kind: "not-found" as const };
      return { kind: "blocked" as const, reason: error.reason };
    }
  });
  if (detail.kind === "not-found") notFound();

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

  const { events, fields, invoice, label } = detail;
  const labelHref = `/app/label/${routeKey}`;
  const recipientLayout = recipientDensity({
    addressLength: label.recipient.address.length,
    areaLabelLength: label.destinationAreaLabel.length,
    nameLength: label.recipient.name.length,
  });

  return (
    <>
      <div className="label-hide">
        <PageHeader
          back={<BackToList />}
          actions={withInvoice ? (
            <>
              <Button asChild variant="outline">
                <Link href={labelHref}><Tag aria-hidden="true" />Cetak label saja</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/app/invoice/${routeKey}`}><FileText aria-hidden="true" />Cetak invoice saja</Link>
              </Button>
            </>
          ) : (
            <Button asChild variant="outline">
              <Link href={`${labelHref}?invoice=1`}><Printer aria-hidden="true" />Cetak resi + invoice</Link>
            </Button>
          )}
          description={withInvoice ? "Cetak label, lalu invoice." : "Pilih ukuran label, periksa pratinjau, lalu cetak."}
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
      {label.isCod && !label.codBreakdown ? (
        <Alert className="label-hide" role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Rincian COD tidak konsisten</AlertTitle>
          <AlertDescription>Total COD dari Mengantar tetap dicetak, rinciannya disembunyikan. Periksa kiriman sebelum menyerahkan paket.</AlertDescription>
        </Alert>
      ) : null}
      {awbBarcodeFits(label.awb) ? null : (
        <Alert className="label-hide" role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Barcode resi tidak dicetak</AlertTitle>
          <AlertDescription>Nomor resi terlalu panjang untuk barcode selebar 10 cm; hanya teksnya yang dicetak.</AlertDescription>
        </Alert>
      )}

      <LabelPrintPanel
        both={withInvoice ? { invoice, shipmentNumber: routeKey } : undefined}
        history={
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
                        {event.actorRole === "TENANT_ADMIN" ? "Tenant Admin" : "Operator"} · {event.actorNameMasked}
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
        }
        initialAttemptId={randomUUID()}
        lastPrintedAt={label.lastPrintedAt?.toISOString() ?? null}
        operatorId={principal.userId}
        printCount={label.printCount}
        shipmentId={label.shipmentId}
      >
        <LabelSheet fields={fields} label={label} />
      </LabelPrintPanel>
    </>
  );
}
