import { FilePen, FileText, PenLine, Plus, Printer, Tag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  IssuanceConsent,
  IssuanceOutcome,
  IssuanceProvider,
  IssuanceServiceChooser,
  IssuanceSubmitButton,
} from "@/app/app/pengiriman/_components/issuance-panel";
import { handoverSummary } from "@/app/app/pengiriman/baru/saved-draft-sections";
import { resolveShipmentRoute } from "@/app/app/shipment-route";
import { CourierLogo } from "@/components/app/courier-logo";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantDisabledCouriers } from "@/db/tenant-settings-repository";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { formatDimensions, formatWibDateTime } from "@/lib/label-format";
import { deliveryEstimateLabel, serviceDisplayName } from "@/lib/labels/courier";
import { providerResponseLabel } from "@/lib/labels/provider";
import { mengantarCodFeeIdr } from "@/lib/mengantar-cod-fee";
import { PAYMENT_AMOUNT_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/payment-method";
import { isSanctionedOrderFixtureEnabled } from "@/lib/sanctioned-order-fixture";
import { isSanctionedReconciliationFixtureEnabled } from "@/lib/sanctioned-reconciliation-fixture";
import { isSanctionedUnpaidRecoveryFixtureEnabled } from "@/lib/sanctioned-unpaid-recovery-fixture";
import { gramsToKilogramLabel, MENGANTAR_COD_FEE_RATE_LABEL } from "@/lib/shipment-draft-logic";
import { filterTenantCourierServices } from "@/lib/gerai-settings";
import { buildShipmentEstimateOptions } from "@/lib/shipment-estimate-options";
import { shipmentNumberFromReference } from "@/lib/shipment-number";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";

import { loadShipmentDetailView, type ShipmentDetailView } from "./detail-data";
import {
  attentionSignals,
  buildTrackingTimeline,
  codNetAmountIdr,
  detailNextStep,
  queueBackHref,
  staleCheckAvailable,
  type DetailNextStep,
} from "./detail-model";
import { AttentionSignals, BackToQueue, DefinitionGrid, DetailCard, IdentityStrip, RouteHeader, TrackingTimeline, type DefinitionItem } from "./detail-parts";
import { ReconciliationAction, StaleCheckAction, UnpaidRecoveryAction } from "./rail-actions";

export const metadata: Metadata = { title: "Detail kiriman", robots: { index: false } };

type PageProps = {
  params: Promise<{ shipmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function requireTenantPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  return principal;
}

/** "Kecamatan, Kota" from the stored full area label. */
function districtCity(areaLabel: string) {
  return areaLabel.split(",").slice(0, 2).map((part) => part.trim()).filter(Boolean).join(", ");
}

export default async function ShipmentDetailPage({ params, searchParams }: PageProps) {
  const principal = await requireTenantPrincipal();
  const { shipmentId: routeKey } = await params;
  const backHref = queueBackHref(await searchParams);
  const shipmentId = await resolveShipmentRoute(principal, routeKey, "/app/pengiriman");
  const view = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    loadShipmentDetailView(tx, context, shipmentId));
  if (!view) notFound();

  const { detail, draft } = view;
  const shipmentNumber = shipmentNumberFromReference(detail.publicReference);
  const provider = detail.provider;
  const awb = provider?.awb ?? null;
  const step = detailNextStep({
    batchStatus: provider?.batchStatus ?? null,
    hasAwb: Boolean(awb),
    hasEstimate: Boolean(detail.estimate),
    recoveryStatus: provider?.recoveryStatus ?? null,
    role: principal.role,
    shipmentId: detail.shipmentId,
    shipmentNumber,
    status: detail.status,
  });
  const staleCheck = staleCheckAvailable({
    batchStatus: provider?.batchStatus ?? null,
    recoveryStatus: provider?.recoveryStatus ?? null,
    role: principal.role,
  });

  // The service the order was placed with (or, before issuance, nothing chosen yet).
  const orderedService = detail.estimate?.services.find((service) => service.estimateServiceId === view.order?.estimateServiceId)
    ?? (provider ? detail.estimate?.services.find((service) => service.providerService === provider.providerService) : undefined)
    ?? null;
  const estimateLabel = orderedService ? deliveryEstimateLabel(orderedService.deliveryEstimate) : null;
  const courierKey = provider?.courier ?? provider?.providerService ?? null;

  const header = (
    <PageHeader
      back={<BackToQueue href={backHref} />}
      eyebrow="Pengiriman"
      title={<>Kiriman <span className="font-mono">{detail.publicReference}</span></>}
    />
  );

  const issuance = step.kind === "issue" && detail.estimate;
  // T-243: Mitra kurir — the gerai's switched-off couriers are never offered.
  const disabledCouriers = issuance
    ? await withTenantContext(db, principal.userId, principal.tenantId, loadTenantDisabledCouriers)
    : [];
  const main = (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 lg:order-1">
      <IdentityStrip
        items={[
          { copy: detail.publicReference, label: "Nomor kiriman", mono: true, value: detail.publicReference },
          awb ? { copy: awb, label: "Resi", mono: true, value: awb } : { label: "Resi", value: "Belum ada resi" },
          // T-238: Mengantar `cnote_no_rts`, once a status pull has seen one.
          ...(view.order?.returnCnoteNo
            ? [{ copy: view.order.returnCnoteNo, label: "Resi retur", mono: true, value: view.order.returnCnoteNo }]
            : []),
          detail.recipient ? { copy: detail.recipient.name, label: "Penerima", value: detail.recipient.name } : { label: "Penerima", value: "—" },
          detail.recipient ? { copy: detail.recipient.phone, label: "Telepon", value: detail.recipient.phone } : { label: "Telepon", value: "—" },
        ]}
      />

      <RouteHeader
        courier={provider
          ? {
              title: (
                <span className="flex flex-col items-center gap-1 sm:flex-row sm:gap-2">
                  {courierKey ? <CourierLogo className="h-5" courier={courierKey} decorative /> : null}
                  {serviceDisplayName(provider.providerService)}
                </span>
              ),
            }
          : { title: "Belum dipilih" }}
        estimate={provider ? estimateLabel : null}
        recipient={{ detail: districtCity(detail.destinationAreaLabel), title: detail.recipient?.name ?? "—" }}
        sender={{ detail: view.pickupPoint?.originAreaLabel ? districtCity(view.pickupPoint.originAreaLabel) : detail.outlet.name, title: detail.sender?.name ?? "—" }}
      />

      {issuance ? (
        <DetailCard id="konfirmasi-penerbitan-awb" title="Pilih layanan & terbitkan">
          <IssuanceServiceChooser context={`Tujuan: ${districtCity(detail.destinationAreaLabel)} · Berat: ${gramsToKilogramLabel(detail.package.weightGrams)}`} />
          <div className="border-t pt-4">
            <IssuanceConsent packageLabel={`${gramsToKilogramLabel(detail.package.weightGrams)} · ${detail.package.quantity} barang`} />
          </div>
          <IssuanceOutcome />
        </DetailCard>
      ) : null}

      <DetailCard id="detail-pelacakan" title="Detail pelacakan">
        <TrackingTimeline
          entries={buildTrackingTimeline({
            awb,
            createdAt: detail.createdAt,
            historyEvents: view.historyEvents,
            issuedAt: awb ? provider?.resolvedAt ?? null : null,
            observations: view.observations,
          })}
        />
        {!view.observationsVisible && awb ? (
          <p className="text-xs text-muted-foreground">Status dari Mengantar terlihat oleh pemilik gerai.</p>
        ) : null}
      </DetailCard>

      <DetailCard id="detail-paket" title="Detail paket">
        <DefinitionGrid items={packageItems(view, orderedService?.deliveryEstimate ?? null)} />
      </DetailCard>

      <DetailCard id="detail-penerima" title="Detail penerima">
        <DefinitionGrid
          items={[
            { label: "Nama", value: detail.recipient?.name ?? "—" },
            { label: "Telepon", value: <span className="tabular-nums">{detail.recipient?.phone ?? "—"}</span> },
            { label: "Alamat", value: detail.recipient?.address ?? "—", wide: true },
            { label: "Kecamatan tujuan", value: detail.destinationAreaLabel, wide: true },
            ...(draft?.recipientAddressLandmark ? [{ label: "Patokan", value: draft.recipientAddressLandmark, wide: true }] : []),
            ...(draft?.shippingInstruction ? [{ label: "Instruksi", value: draft.shippingInstruction, wide: true }] : []),
          ]}
        />
      </DetailCard>

      <DetailCard id="detail-pengirim" title="Detail pengirim">
        <DefinitionGrid
          items={[
            { label: "Nama di label", value: detail.sender?.name ?? "—" },
            { label: "Telepon", value: <span className="tabular-nums">{detail.sender?.phone ?? "—"}</span> },
            { label: "Alamat di label", value: detail.sender?.address ?? "—", wide: true },
            { label: "Outlet asal", value: detail.outlet.name },
            { label: "Titik pickup", value: view.pickupPoint?.pickupAddressLabel ?? "—" },
          ]}
        />
      </DetailCard>
    </div>
  );

  const status = SHIPMENT_STATUS_PRESENTATION[detail.status];
  const responseCode = provider?.safeResponseCode ?? provider?.batchSafeErrorCode ?? null;
  const rail = (
    <aside aria-label="Status dan tindakan" className="flex w-full shrink-0 flex-col gap-6 lg:order-2 lg:w-88">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Status paket</h2>
            <ShipmentStatusBadge status={detail.status} />
          </div>
          <p className="text-sm font-medium text-foreground">{status.guidance}</p>
          <AttentionSignals signals={attentionSignals(view.attention)} />
          <dl className="flex flex-col gap-1 border-t pt-2 text-xs text-muted-foreground">
            <div className="flex justify-between gap-3"><dt>Aktivitas terakhir</dt><dd>{formatWibDateTime(detail.updatedAt)}</dd></div>
            {responseCode ? <div className="flex justify-between gap-3"><dt>Respons Mengantar</dt><dd className="text-right">{providerResponseLabel(responseCode)}</dd></div> : null}
          </dl>
        </CardContent>
      </Card>

      <Card aria-labelledby="tindakan-heading" role="region">
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-lg font-bold" id="tindakan-heading">Tindakan berikutnya</h2>
          <NextStepActions shipmentId={detail.shipmentId} step={step} />
          {staleCheck ? <StaleCheckAction shipmentId={detail.shipmentId} /> : null}
        </CardContent>
      </Card>
    </aside>
  );

  const layout = (
    <div className="flex flex-col items-start gap-6 lg:flex-row">
      {rail}
      {main}
    </div>
  );

  return (
    <>
      {header}
      {issuance && detail.estimate ? (
        <IssuanceProvider
          codFormulaRetired={view.codFormulaRetired}
          declaredValueIdr={detail.package.declaredValueIdr}
          fixtureEnabled={isSanctionedOrderFixtureEnabled()}
          options={buildShipmentEstimateOptions({
            codFormulaRetired: view.codFormulaRetired,
            declaredValueIdr: detail.package.declaredValueIdr,
            paymentMethod: detail.paymentMethod,
            services: filterTenantCourierServices(detail.estimate.services, disabledCouriers),
          })}
          paymentMethod={detail.paymentMethod}
          shipmentId={detail.shipmentId}
          snapshotId={detail.estimate.snapshotId}
        >
          {layout}
        </IssuanceProvider>
      ) : layout}
    </>
  );
}

/** Spec 10 §4.11: one filled primary per status; the rest outline. */
function NextStepActions({ shipmentId, step }: { shipmentId: string; step: DetailNextStep }) {
  const primaryLink = (href: string, icon: ReactNode, label: string) => (
    <Button asChild className="w-full font-semibold">
      <Link href={href}>{icon}{label}</Link>
    </Button>
  );
  switch (step.kind) {
    case "print":
      return (
        <>
          {primaryLink(step.printBothHref, <Printer aria-hidden="true" />, "Cetak resi + invoice")}
          {/* Side by side while both labels fit (natural widths), stacked otherwise — never squeezed. */}
          <div className="flex flex-wrap gap-3 *:flex-auto">
            <Button asChild variant="outline"><Link href={step.labelHref}><Tag aria-hidden="true" />Cetak label saja</Link></Button>
            <Button asChild variant="outline"><Link href={step.invoiceHref}><FileText aria-hidden="true" />Invoice</Link></Button>
          </div>
        </>
      );
    case "issue":
      return (
        <>
          <IssuanceSubmitButton />
          <Button asChild className="w-full" variant="outline"><Link href={step.reviewHref}><PenLine aria-hidden="true" />Tinjau estimasi</Link></Button>
        </>
      );
    case "review-estimate":
      return primaryLink(step.href, <PenLine aria-hidden="true" />, "Tinjau estimasi");
    case "resume-draft":
      return primaryLink(step.href, <FilePen aria-hidden="true" />, "Lanjutkan draf");
    case "new-draft":
      return primaryLink(step.href, <Plus aria-hidden="true" />, "Buat kiriman baru");
    case "recover":
      return <UnpaidRecoveryAction fixtureEnabled={isSanctionedUnpaidRecoveryFixtureEnabled()} shipmentId={shipmentId} />;
    case "reconcile":
      return <ReconciliationAction fixtureEnabled={isSanctionedReconciliationFixtureEnabled()} shipmentId={shipmentId} />;
    case "none":
      return <p className="text-sm text-muted-foreground" role="status">{step.message}</p>;
  }
}

function packageItems(view: ShipmentDetailView, deliveryEstimate: string | null): DefinitionItem[] {
  const { detail, draft } = view;
  const provider = detail.provider;
  const cod = detail.paymentMethod !== "NON_COD";
  const codAmount = provider?.providerCodAmountIdr ?? null;
  const net = codNetAmountIdr({
    chargedShippingIdr: view.order?.chargedShippingIdr ?? null,
    paymentMethod: detail.paymentMethod,
    providerCodAmountIdr: codAmount,
  });
  const dimensions = formatDimensions(detail.package.lengthCm, detail.package.widthCm, detail.package.heightCm);
  const handover = draft ? handoverSummary(draft) : "Belum dicatat";
  return [
    {
      label: "Layanan",
      value: provider
        ? `${serviceDisplayName(provider.providerService)}${deliveryEstimate ? ` · ${deliveryEstimateLabel(deliveryEstimate)}` : ""}`
        : "Belum dipilih",
    },
    { label: "Pembayaran", value: PAYMENT_METHOD_LABELS[detail.paymentMethod] },
    ...(cod ? [{ label: PAYMENT_AMOUNT_LABELS[detail.paymentMethod], value: <Money amount={codAmount} /> }] : []),
    { label: "Nilai barang", value: <Money amount={detail.package.declaredValueIdr} /> },
    { label: "Isi paket", value: detail.package.content, wide: true },
    { label: "Jumlah", value: `${detail.package.quantity} barang` },
    { label: "Berat", value: gramsToKilogramLabel(detail.package.weightGrams) },
    ...(dimensions ? [{ label: "Dimensi", value: dimensions }] : []),
    { label: "Ongkir", value: <Money amount={provider?.shippingAmountIdr ?? null} /> },
    ...(provider?.insuranceAmountIdr ? [{ label: "Asuransi", value: <Money amount={provider.insuranceAmountIdr} /> }] : []),
    ...(cod && codAmount !== null ? [{ label: `Biaya COD ${MENGANTAR_COD_FEE_RATE_LABEL}`, value: <Money amount={mengantarCodFeeIdr(codAmount)} /> }] : []),
    ...(cod ? [{ label: "Jumlah bersih (estimasi pencairan)", value: <Money amount={net} className="text-base font-bold" /> }] : []),
    {
      label: "Penyerahan",
      value: (
        <span className="flex flex-col gap-0.5">
          <span>{handover}</span>
          {draft?.handoverType ? <span className="text-xs font-normal text-muted-foreground">Belum dikirim ke Mengantar</span> : null}
        </span>
      ),
      wide: true,
    },
  ];
}
