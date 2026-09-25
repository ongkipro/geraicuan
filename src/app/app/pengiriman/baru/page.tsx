import { randomUUID } from "node:crypto";

import { shipmentDetailHref, shipmentLabelHref } from "@/lib/shipment-number";
import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { CheckCircle2, ExternalLink, Settings2 } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DraftEstimatePanel, EstimateRefreshForm } from "@/app/app/draft-estimate-panel";
import { ShipmentIssuancePanel } from "@/app/app/pengiriman/[shipmentId]/issuance-panel";
import { ShipmentStepIndicator, type ShipmentStep } from "@/app/app/pengiriman/baru/shipment-step-indicator";
import { ShipmentDraftForm } from "@/app/app/shipment-draft-form";
import { packageSummaryLabel, ShipmentFlowSummary } from "@/app/app/shipment-draft-experience";
import { FormLayout, PageAside } from "@/components/cms/cms-layouts";
import { PageHeader } from "@/components/cms/page-header";
import { PageContainer } from "@/components/cms/page-container";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FocusRegion } from "@/app/app/focus-region";
import { db } from "@/db/client";
import { shipmentCodFormulaRetired } from "@/db/cod-totals-repository";
import { loadLatestEstimateSnapshot } from "@/db/estimate-repository";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { listOutletPickupPoints } from "@/db/outlet-pickup-point-repository";
import { outlets, shipmentDrafts, shipmentParties, shipments, tenants } from "@/db/schema";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { PAYMENT_METHOD_LABELS, paymentMethodOf } from "@/lib/payment-method";
import { isSanctionedOrderFixtureEnabled } from "@/lib/sanctioned-order-fixture";
import { buildShipmentEstimateOptions } from "@/lib/shipment-estimate-options";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { title: "Buat kiriman · GeraiCUAN", robots: { index: false } };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type NewShipmentPageProps = { searchParams: Promise<{ draft?: string }> };

export default async function NewShipmentPage({ searchParams }: NewShipmentPageProps) {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }

  if (principal.scope !== "tenant") {
    redirect("/login/tenant");
  }

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute(
        (await headers()).get(UI_AUDIT_HEADER),
        "/app/pengiriman/baru",
      )
    : null;
  if (auditScenario === "shipment-draft-error") {
    throw new Error("Intentional development-only shipment draft failure.");
  }

  const requestedDraftId = (await searchParams).draft;
  // T-157: a pure local fixture, like the settings-* scenarios — it renders the
  // pickup choice without reading this tenant's outlets at all.
  const auditPickupOutlets = [{
    id: "79000000-0000-4000-8000-000000000004",
    name: "Outlet Audit Pickup",
    pickupPoints: [1, 2, 3].map((index) => ({
      isDefault: index === 1,
      originAreaLabel: `Kecamatan Audit ${index}, Kota Bandung, Jawa Barat`,
      pickupAddressId: `pickup-audit-${index}`,
      pickupAddressLabel: `Gudang Audit ${index}, Jalan Contoh ${index}`,
    })),
  }];
  const dataPromise = withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    if (auditScenario === "shipment-draft-pickup-choice") {
      return { codFormulaRetired: false, configuredOutlets: auditPickupOutlets, estimateSnapshot: null, savedDraft: undefined, senderIdentity: null };
    }
    const readyOutlets = await listReadyShipmentOutlets(tx, context);
    // T-157: the pickup points each ready outlet may ship from, so the draft
    // can offer a choice instead of silently using the outlet default.
    const pickupPoints = await listOutletPickupPoints(tx, context);
    const configuredOutlets = readyOutlets.map((outlet) => ({
      ...outlet,
      pickupPoints: pickupPoints
        .filter((point) => point.outletId === outlet.id)
        .map(({ isDefault, originAreaLabel, pickupAddressId, pickupAddressLabel }) => ({
          isDefault,
          originAreaLabel,
          pickupAddressId,
          pickupAddressLabel,
        })),
    }));

    const savedDraft = requestedDraftId && UUID_PATTERN.test(requestedDraftId)
      ? await tx
          .select({
            declaredValueIdr: shipmentDrafts.declaredValueIdr,
            destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
            id: shipments.id,
            publicReference: shipments.publicReference,
            isCod: shipmentDrafts.isCod,
            codShippingOnly: shipmentDrafts.codShippingOnly,
            outletId: shipments.outletId,
            outletName: outlets.name,
            packageQuantity: shipmentDrafts.packageQuantity,
            packageWeightGrams: shipmentDrafts.packageWeightGrams,
            pickupAddressId: shipmentDrafts.pickupAddressId,
            senderName: shipmentParties.name,
            status: shipments.status,
          })
          .from(shipments)
          .innerJoin(
            shipmentDrafts,
            and(
              eq(shipmentDrafts.shipmentId, shipments.id),
              eq(shipmentDrafts.tenantId, shipments.tenantId),
            ),
          )
          .innerJoin(
            outlets,
            and(
              eq(outlets.id, shipments.outletId),
              eq(outlets.tenantId, shipments.tenantId),
            ),
          )
          // T-205: the sender printed on the label, for the rail.
          .leftJoin(
            shipmentParties,
            and(
              eq(shipmentParties.shipmentId, shipments.id),
              eq(shipmentParties.tenantId, shipments.tenantId),
              eq(shipmentParties.role, "SENDER"),
            ),
          )
          .where(
            and(
              eq(shipments.id, requestedDraftId),
              eq(shipments.tenantId, context.tenantId),
            ),
          )
          .limit(1)
      : [];

    const saved = savedDraft[0];
    const estimateSnapshot = saved && (saved.status === "DRAFT" || saved.status === "ESTIMATED")
      ? await loadLatestEstimateSnapshot(tx, context, saved.id)
      : null;
    // T-199 on this page too: a never-submitted version 1 COD row cannot be confirmed.
    const codFormulaRetired = saved?.status === "ESTIMATED" && saved.isCod
      ? await shipmentCodFormulaRetired(tx, context, saved.id)
      : false;
    // T-205: the "Alamat gerai" sender source — the gerai's own name and WhatsApp.
    // Only the new-draft form uses it.
    const [tenant] = saved
      ? []
      : await tx
          .select({ name: tenants.name, phone: tenants.contactWhatsapp })
          .from(tenants)
          .where(eq(tenants.id, context.tenantId))
          .limit(1);
    return { codFormulaRetired, configuredOutlets, estimateSnapshot, savedDraft: saved, senderIdentity: tenant ?? null };
  });
  const loadedData = auditScenario === "shipment-draft-stream"
    ? await dataPromise.then((value) => new Promise<typeof value>((resolve) => {
        setTimeout(() => resolve(value), 1_200);
      }))
    : await dataPromise;
  const auditDraftId = "00000000-0000-4000-0000-000000000001";
  const auditSavedDraft = {
    declaredValueIdr: 100_000,
    destinationAreaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
    id: auditDraftId,
    publicReference: "GC-10001",
    isCod: true,
    outletId: "79000000-0000-4000-8000-000000000005",
    packageQuantity: 1,
    packageWeightGrams: 1_000,
    pickupAddressId: null,
    senderName: "Gerai Audit",
    // T-186: the COD Ongkir scenario is the same synthetic draft, paid for
    // outside GeraiCUAN, so the courier collects shipping alone.
    codShippingOnly: auditScenario === "shipment-draft-saved-cod-ongkir",
    outletName: "Outlet Bandung",
    status: "ESTIMATED" as const,
  };
  const auditSnapshot = {
    request: {
      credentialSource: "platform_default" as const,
      destinationAreaId: "AUDIT-DESTINATION",
      destinationAreaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
      isCodRequested: true,
      originAreaId: "AUDIT-ORIGIN",
      weightGrams: 1_000,
    },
    retrievedAt: new Date("2026-09-01T02:00:00.000Z"),
    services: [{
      codEligible: auditScenario !== "shipment-draft-cod-ineligible",
      currency: "IDR" as const,
      deliveryEstimate: "1–2 hari",
      estimateServiceId: "00000000-0000-4000-0000-000000000002",
      insuranceAmountIdr: null,
      insuranceSourceField: null,
      providerService: "JNE REG",
      shippingAmountIdr: 14_000,
      shippingSourceField: "price" as const,
      normalPriceIdr: null,
      specialPriceIdr: null,
      codFeeIdr: null,
      discountIdr: null,
    }, ...(auditScenario === "shipment-draft-saved-cod-ongkir"
      ? [{
          // A discounted account: Mengantar deducts the special price, so the
          // break-even rests on 9 800, not on the 12 000 price.
          codEligible: true,
          currency: "IDR" as const,
          deliveryEstimate: "2–3 hari",
          estimateServiceId: "00000000-0000-4000-0000-000000000004",
          insuranceAmountIdr: null,
          insuranceSourceField: null,
          providerService: "SAP REG",
          shippingAmountIdr: 12_000,
          shippingSourceField: "price" as const,
          normalPriceIdr: 12_000,
          specialPriceIdr: 9_800,
          codFeeIdr: 0,
          discountIdr: 2_200,
        }]
      : [])],
    snapshotId: "00000000-0000-4000-0000-000000000003",
  };
  const scenarioHasSavedDraft = auditScenario === "shipment-draft-saved"
    || auditScenario === "shipment-draft-saved-cod-ongkir"
    || auditScenario === "shipment-draft-estimate-error"
    || auditScenario === "shipment-draft-cod-ineligible";
  const data = auditScenario === "shipment-draft-unconfigured"
    ? { ...loadedData, configuredOutlets: [], estimateSnapshot: null, savedDraft: undefined }
    : scenarioHasSavedDraft
      ? { ...loadedData, estimateSnapshot: auditSnapshot, savedDraft: auditSavedDraft }
      : loadedData;

  const saved = data.savedDraft;
  const processed = saved !== undefined && saved.status !== "DRAFT" && saved.status !== "ESTIMATED";
  const paymentMethod = saved ? paymentMethodOf(saved.isCod, saved.codShippingOnly) : null;
  const issuanceReady = saved?.status === "ESTIMATED" && data.estimateSnapshot !== null
    && auditScenario !== "shipment-draft-estimate-error";

  // T-200/T-205: three steps on one page — fill, check rates, choose the service and issue.
  const steps: ShipmentStep[] = [
    {
      detail: saved ? `Selesai · ${saved.outletName}` : undefined,
      label: "Isi data",
      state: saved ? "done" : "current",
    },
    {
      label: "Cek tarif",
      state: issuanceReady || processed ? "done" : saved ? "current" : "pending",
    },
    {
      label: "Terbitkan resi",
      state: processed ? "done" : issuanceReady ? "current" : "pending",
    },
  ];

  // T-205: the rail's route starts at the pickup point the draft snapshotted.
  const savedPickup = saved
    ? data.configuredOutlets
        .find((outlet) => outlet.id === saved.outletId)
        ?.pickupPoints.find((point) => saved.pickupAddressId ? point.pickupAddressId === saved.pickupAddressId : point.isDefault)
    : undefined;
  const savedSummary = saved ? {
    declaredValueIdr: saved.declaredValueIdr,
    destination: saved.destinationAreaLabel,
    draftHref: shipmentDetailHref(saved.publicReference),
    origin: savedPickup ? `${saved.outletName} · ${savedPickup.originAreaLabel}` : saved.outletName,
    packageLabel: packageSummaryLabel(saved.packageWeightGrams, saved.packageQuantity),
    sender: saved.senderName ?? "—",
  } : null;

  const showDraftForm = !saved && data.configuredOutlets.length > 0;

  return (
    <PageContainer>
      <PageHeader
        description="Isi data kiriman, cek tarif Mengantar, lalu pilih layanan dan terbitkan resi di halaman ini."
        eyebrow="Pengiriman"
        title="Buat kiriman"
      />

      <ShipmentStepIndicator steps={steps} />

      {saved ? (
        <FocusRegion className="rounded-xl bg-card p-4 text-sm text-card-foreground border outline-none focus-visible:ring-2 focus-visible:ring-ring" role="status">
          <div className="flex gap-3">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="grid min-w-0 gap-1">
              <h2 className="text-base font-semibold">{saved.status === "ISSUED" ? "Resi sudah terbit" : processed ? "Kiriman sudah diajukan ke Mengantar" : "Draf kiriman tersimpan"}</h2>
              <p className="flex flex-wrap items-center gap-2">Nomor kiriman: <span className="font-mono font-medium tabular-nums whitespace-nowrap">{saved.publicReference}</span> <ShipmentStatusBadge label={SHIPMENT_STATUS_PRESENTATION[saved.status].label} tone={SHIPMENT_STATUS_PRESENTATION[saved.status].tone} /></p>
              <p className="wrap-anywhere text-muted-foreground">{saved.outletName} → {saved.destinationAreaLabel}</p>
              <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:flex-wrap">
                <Button asChild className="min-h-11 md:min-h-10" size="sm" variant={processed ? "default" : "outline"}>
                  <Link href={shipmentDetailHref(saved.publicReference)}>Buka detail kiriman</Link>
                </Button>
                {saved.status === "ISSUED" ? (
                  <Button asChild className="min-h-11 md:min-h-10" size="sm" variant="outline">
                    <Link href={shipmentLabelHref(saved.publicReference)}>Buka label <ExternalLink aria-hidden="true" /></Link>
                  </Button>
                ) : null}
                <Button asChild className="min-h-11 md:min-h-10" size="sm" variant="ghost">
                  <Link href="/app/pengiriman/baru">Buat kiriman berikutnya</Link>
                </Button>
              </div>
            </div>
          </div>
        </FocusRegion>
      ) : null}

      {saved && savedSummary && !processed ? (
        issuanceReady && data.estimateSnapshot && paymentMethod ? (
          <ShipmentIssuancePanel
            codFormulaRetired={data.codFormulaRetired}
            fixtureEnabled={isSanctionedOrderFixtureEnabled()}
            headerAction={<EstimateRefreshForm draftId={saved.id} />}
            isCod={saved.isCod}
            options={buildShipmentEstimateOptions({
              codFormulaRetired: data.codFormulaRetired,
              declaredValueIdr: saved.declaredValueIdr,
              paymentMethod,
              services: data.estimateSnapshot.services,
            })}
            paymentMethod={paymentMethod}
            shipmentId={saved.id}
            snapshotId={data.estimateSnapshot.snapshotId}
            summary={savedSummary}
          />
        ) : (
          <FormLayout
            aside={(
              <PageAside label="Ringkasan pembuatan kiriman">
                <Card>
                  <CardHeader><CardTitle>Ringkasan kiriman</CardTitle></CardHeader>
                  <CardContent className="grid gap-5">
                    <ShipmentFlowSummary
                      destination={savedSummary.destination}
                      origin={savedSummary.origin}
                      rows={[
                        { label: "Pengirim di label", value: savedSummary.sender },
                        { label: "Berat & jumlah", value: savedSummary.packageLabel },
                        { label: "Pembayaran", value: paymentMethod ? PAYMENT_METHOD_LABELS[paymentMethod] : "—" },
                      ]}
                    />
                    <p className="border-t pt-4 text-sm text-muted-foreground">Ongkir dan total muncul setelah tarif Mengantar dimuat.</p>
                    <Button asChild className="min-h-11 w-full md:min-h-10" variant="outline">
                      <Link href={savedSummary.draftHref}>Simpan draf, terbitkan nanti</Link>
                    </Button>
                  </CardContent>
                </Card>
              </PageAside>
            )}
          >
            <DraftEstimatePanel
              auditState={auditScenario === "shipment-draft-estimate-error" ? "error" : null}
              autoLoad
              draftId={saved.id}
              isCod={saved.isCod}
              paymentMethod={paymentMethod ?? undefined}
              snapshot={null}
            />
          </FormLayout>
        )
      ) : null}

      {!saved && data.configuredOutlets.length === 0 ? (
        <Alert>
          <Settings2 aria-hidden="true" />
          <AlertTitle>Outlet belum siap digunakan</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>
            {principal.role === "TENANT_ADMIN"
              ? "Lengkapi alamat pickup dan area asal outlet sebelum membuat draf."
              : "Hubungi Tenant Admin untuk mengatur alamat pickup outlet."}
            </p>
          {principal.role === "TENANT_ADMIN" ? (
            <Button asChild className="min-h-11 max-md:w-full md:min-h-10 md:w-fit" size="sm">
              <Link href="/app/pengaturan/outlet">Atur outlet &amp; koneksi</Link>
            </Button>
          ) : null}
          </AlertDescription>
        </Alert>
      ) : showDraftForm ? (
        // T-205: the form lays out its own rail and bottom bar — its summary follows what is typed.
        <ShipmentDraftForm
          autoFocusFirstField={!saved}
          outlets={data.configuredOutlets}
          senderIdentity={data.senderIdentity}
          submissionId={randomUUID()}
        />
      ) : null}
    </PageContainer>
  );
}
