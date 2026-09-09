import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { CheckCircle2, Settings2 } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DraftEstimatePanel } from "@/app/app/draft-estimate-panel";
import { ShipmentDraftForm } from "@/app/app/shipment-draft-form";
import { PageHeader } from "@/components/cms/page-header";
import { PageContainer } from "@/components/cms/page-container";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FocusRegion } from "@/app/app/focus-region";
import { db } from "@/db/client";
import { calculateCodAmountsOrNull } from "@/db/cod-totals-repository";
import { loadLatestEstimateSnapshot } from "@/db/estimate-repository";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { outlets, shipmentDrafts, shipments } from "@/db/schema";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
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
  const dataPromise = withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    const configuredOutlets = await listReadyShipmentOutlets(tx, context);

    const savedDraft = requestedDraftId && UUID_PATTERN.test(requestedDraftId)
      ? await tx
          .select({
            declaredValueIdr: shipmentDrafts.declaredValueIdr,
            destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
            id: shipments.id,
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

  return (
    <PageContainer width="form">
      <PageHeader
        description="Simpan detail penerima dan paket, lalu bandingkan layanan Mengantar sebelum menerbitkan AWB."
        eyebrow="Pengiriman"
        title="Buat draf kiriman"
      />

      {/* The step strip is 32rem wide and scrolls at 390px, and every child is
          static text — nothing inside it can take focus, so without a tab stop
          a keyboard user cannot scroll it at all. Screening found it in five
          draft states. */}
      <nav
        aria-label="Tahapan pembuatan kiriman"
        className="overflow-x-auto border-y bg-card focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
        tabIndex={0}
      >
        <ol className="grid min-w-[32rem] grid-cols-4 divide-x text-sm">
          {[
            ["1", "Draf", data.savedDraft ? "Selesai" : "Saat ini"],
            ["2", "Estimasi", data.estimateSnapshot ? "Selesai" : data.savedDraft ? "Berikutnya" : "Menunggu"],
            ["3", "Konfirmasi", "Menunggu"],
            ["4", "AWB", "Menunggu"],
          ].map(([step, label, state]) => (
            <li className="grid gap-1 px-4 py-3" key={step}>
              <span className="text-xs font-medium text-muted-foreground">Langkah {step}</span>
              <strong>{label}</strong>
              <span className="text-xs text-muted-foreground">{state}</span>
            </li>
          ))}
        </ol>
      </nav>

    {data.savedDraft ? (
      <FocusRegion className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950" role="status">
        <div className="flex gap-3">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-700" />
          <div className="grid gap-1">
            <h2 className="font-medium">Draf kiriman tersimpan</h2>
            <p>Nomor draf: <span className="font-mono">{data.savedDraft.id.slice(0, 8).toUpperCase()}</span> · <strong>{data.savedDraft.status}</strong></p>
            <p className="text-emerald-800">{data.savedDraft.outletName} → {data.savedDraft.destinationAreaLabel}</p>
            <p className="text-emerald-800">Muat estimasi di bawah untuk membandingkan layanan. Belum ada pesanan yang dikirim ke penyedia.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button asChild className="min-h-11" size="sm">
                <Link href={`/app/pengiriman/${data.savedDraft.id}`}>Buka detail kiriman</Link>
              </Button>
              <Button asChild className="min-h-11" size="sm" variant="outline">
                <Link href="/app/pengiriman">Lihat antrean</Link>
              </Button>
              <Button asChild className="min-h-11" size="sm" variant="ghost">
                <Link href="/app/pengiriman/baru">Buat draf berikutnya</Link>
              </Button>
            </div>
          </div>
        </div>
      </FocusRegion>
    ) : null}

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
          <Button asChild className="w-fit" size="sm">
            <Link href="/app/pengaturan">Atur outlet &amp; koneksi</Link>
          </Button>
        ) : null}
        </AlertDescription>
      </Alert>
    ) : !data.savedDraft ? (
      <ShipmentDraftForm
        autoFocusFirstField={!data.savedDraft}
        outlets={data.configuredOutlets}
        submissionId={randomUUID()}
      />
    ) : null}
    </PageContainer>
  );
}
