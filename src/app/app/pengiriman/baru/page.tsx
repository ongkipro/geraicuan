import { randomUUID } from "node:crypto";

import { shipmentDetailHref } from "@/lib/shipment-number";
import { and, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { CheckCircle2, Settings2 } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DraftEstimatePanel } from "@/app/app/draft-estimate-panel";
import { CompactShipmentStepIndicator, ShipmentStepIndicator, type ShipmentStep } from "@/app/app/pengiriman/baru/shipment-step-indicator";
import { ShipmentDraftForm } from "@/app/app/shipment-draft-form";
import { FormLayout, PageAside } from "@/components/cms/cms-layouts";
import { PageHeader } from "@/components/cms/page-header";
import { PageContainer } from "@/components/cms/page-container";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FocusRegion } from "@/app/app/focus-region";
import { db } from "@/db/client";
import { calculateCodAmountsOrNull } from "@/db/cod-totals-repository";
import { loadLatestEstimateSnapshot } from "@/db/estimate-repository";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { listOutletPickupPoints } from "@/db/outlet-pickup-point-repository";
import { outlets, shipmentDrafts, shipments } from "@/db/schema";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { formatIdr } from "@/lib/label-format";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };
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
      return { configuredOutlets: auditPickupOutlets, estimateSnapshot: null, savedDraft: undefined };
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
            outletName: outlets.name,
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
          .where(
            and(
              eq(shipments.id, requestedDraftId),
              eq(shipments.tenantId, context.tenantId),
              inArray(shipments.status, ["DRAFT", "ESTIMATED"]),
            ),
          )
          .limit(1)
      : [];

    const saved = savedDraft[0];
    const estimateSnapshot = saved
      ? await loadLatestEstimateSnapshot(tx, context, saved.id)
      : null;
    return { configuredOutlets, estimateSnapshot, savedDraft: saved };
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
    }],
    snapshotId: "00000000-0000-4000-0000-000000000003",
  };
  const scenarioHasSavedDraft = auditScenario === "shipment-draft-saved"
    || auditScenario === "shipment-draft-estimate-error"
    || auditScenario === "shipment-draft-cod-ineligible";
  const data = auditScenario === "shipment-draft-unconfigured"
    ? { ...loadedData, configuredOutlets: [], estimateSnapshot: null, savedDraft: undefined }
    : scenarioHasSavedDraft
      ? { ...loadedData, estimateSnapshot: auditSnapshot, savedDraft: auditSavedDraft }
      : loadedData;

  const steps: ShipmentStep[] = [
    {
      detail: data.savedDraft ? `Selesai · ${data.savedDraft.outletName}` : undefined,
      label: "Draf",
      state: data.savedDraft ? "done" : "current",
    },
    {
      label: "Estimasi",
      state: data.estimateSnapshot ? "done" : data.savedDraft ? "current" : "pending",
    },
    { label: "Konfirmasi", state: "pending" },
    { label: "AWB", state: "pending" },
  ];

  const summaryRows: Array<[string, string]> = [
    ["Outlet asal", data.savedDraft?.outletName ?? "—"],
    ["Tujuan", data.savedDraft?.destinationAreaLabel ?? "—"],
    ["Nilai barang", data.savedDraft ? formatIdr(data.savedDraft.declaredValueIdr) : "—"],
    ["Pembayaran", data.savedDraft ? (data.savedDraft.isCod ? "COD" : "Non-COD") : "—"],
  ];

  const showDraftForm = !data.savedDraft && data.configuredOutlets.length > 0;

  return (
    <PageContainer>
      <PageHeader
        description="Isi penerima dan paket, lalu pilih layanan Mengantar."
        eyebrow="Pengiriman"
        title="Buat draf kiriman"
      />

      <CompactShipmentStepIndicator steps={steps} />

      <FormLayout
        aside={(
          <PageAside label="Ringkasan pembuatan kiriman">
            <Card>
              <CardHeader><CardTitle>Tahapan</CardTitle></CardHeader>
              <CardContent><ShipmentStepIndicator steps={steps} /></CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Ringkasan kiriman</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid gap-2 text-sm">
                  {summaryRows.map(([label, value]) => (
                    <div className="flex items-baseline justify-between gap-3" key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="wrap-anywhere text-right font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            {data.savedDraft ? (
              <DraftEstimatePanel
                auditState={auditScenario === "shipment-draft-estimate-error" ? "error" : null}
                draftId={data.savedDraft.id}
                isCod={data.savedDraft.isCod}
                snapshot={
                  data.estimateSnapshot
                    ? {
                        retrievedAt: data.estimateSnapshot.retrievedAt.toISOString(),
                        services: data.estimateSnapshot.services.map((service) => {
                          const codBreakdown = data.savedDraft.isCod && service.codEligible
                            ? calculateCodAmountsOrNull(
                                data.savedDraft.declaredValueIdr,
                                service.shippingAmountIdr,
                              )
                            : null;
                          return {
                            ...service,
                            codBreakdown,
                            codEligible: service.codEligible && (!data.savedDraft.isCod || codBreakdown !== null),
                          };
                        }),
                      }
                    : null
                }
              />
            ) : null}

            {showDraftForm ? (
              <Card>
                <CardContent className="grid gap-2">
                  <Button className="min-h-11 w-full" form="form-kiriman" type="submit">Simpan draf</Button>
                  <p className="text-xs text-muted-foreground">Menyimpan draf belum membuat pesanan ke penyedia.</p>
                </CardContent>
              </Card>
            ) : null}
          </PageAside>
        )}
      >
        {data.savedDraft ? (
          <FocusRegion className="rounded-xl bg-card p-4 text-sm text-card-foreground ring-1 ring-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-ring" role="status">
            <div className="flex gap-3">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-foreground" />
              <div className="grid min-w-0 gap-1">
                <h2 className="font-medium">Draf kiriman tersimpan</h2>
                <p>Nomor kiriman: <span className="font-mono">{data.savedDraft.publicReference}</span> · <strong className="font-medium">{data.savedDraft.status}</strong></p>
                <p className="wrap-anywhere text-muted-foreground">{data.savedDraft.outletName} → {data.savedDraft.destinationAreaLabel}</p>
                <p className="text-muted-foreground">Muat estimasi pada panel di ringkasan untuk membandingkan layanan. Belum ada pesanan yang dikirim ke penyedia.</p>
                <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:flex-wrap">
                  <Button asChild className="min-h-11 md:min-h-8" size="sm">
                    <Link href={shipmentDetailHref(data.savedDraft.publicReference)}>Buka detail kiriman</Link>
                  </Button>
                  <Button asChild className="min-h-11 md:min-h-8" size="sm" variant="outline">
                    <Link href="/app/pengiriman">Lihat antrean</Link>
                  </Button>
                  <Button asChild className="min-h-11 md:min-h-8" size="sm" variant="ghost">
                    <Link href="/app/pengiriman/baru">Buat draf berikutnya</Link>
                  </Button>
                </div>
              </div>
            </div>
          </FocusRegion>
        ) : null}

        {!data.savedDraft && data.configuredOutlets.length === 0 ? (
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
              <Button asChild className="min-h-11 max-md:w-full md:min-h-8 md:w-fit" size="sm">
                <Link href="/app/pengaturan/outlet">Atur outlet &amp; koneksi</Link>
              </Button>
            ) : null}
            </AlertDescription>
          </Alert>
        ) : showDraftForm ? (
          <ShipmentDraftForm
            autoFocusFirstField={!data.savedDraft}
            outlets={data.configuredOutlets}
            submissionId={randomUUID()}
          />
        ) : null}
      </FormLayout>

      {showDraftForm ? (
        <div className="sticky bottom-0 z-20 -mx-4 border-t border-[color:var(--hairline)] bg-card px-4 pt-3 shadow-[var(--shadow-overlay,0_-4px_16px_-8px_rgb(0_0_0/0.18))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6 @4xl/page:hidden">
          <p className="text-xs text-muted-foreground">Langkah 1 dari 4 · Draf</p>
          <p className="text-sm font-semibold">Isi data pengirim, penerima, dan paket</p>
          <Button className="mt-2 min-h-11 w-full" form="form-kiriman" type="submit">Simpan draf</Button>
        </div>
      ) : null}
    </PageContainer>
  );
}
