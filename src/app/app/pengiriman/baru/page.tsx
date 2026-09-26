import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { Clock, FileSearch, Printer, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { shipmentCodFormulaRetired } from "@/db/cod-totals-repository";
import { loadLatestEstimateSnapshot } from "@/db/estimate-repository";
import { listOutletPickupPoints } from "@/db/outlet-pickup-point-repository";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { tenants } from "@/db/schema";
import { loadShipmentFlowDraft } from "@/db/shipment-draft-repository";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantDisabledCouriers } from "@/db/tenant-settings-repository";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { paymentMethodOf } from "@/lib/payment-method";
import { isSanctionedOrderFixtureEnabled } from "@/lib/sanctioned-order-fixture";
import { gramsToKilogramLabel } from "@/lib/shipment-draft-logic";
import { filterTenantCourierServices } from "@/lib/gerai-settings";
import { buildShipmentEstimateOptions } from "@/lib/shipment-estimate-options";
import { shipmentDetailHref, shipmentLabelHref } from "@/lib/shipment-number";

import { EstimateLoader } from "./estimate-loader";
import { FlowStepper, SectionCard, type FlowStep } from "./flow-parts";
import { IssuanceStage } from "./issuance-stage";
import { handoverSummary, SavedDraftSections } from "./saved-draft-sections";
import { ShipmentCreateForm, type FlowOutlet } from "./shipment-create-form";
import { MobileActionBar, SummaryRail } from "./summary-rail";

export const metadata: Metadata = { robots: { index: false }, title: "Buat kiriman" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const retrievedAtFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  timeZone: "Asia/Jakarta",
  year: "numeric",
});

function steps(stage: "fill" | "estimate" | "issue" | "done"): FlowStep[] {
  const order = ["fill", "estimate", "issue"] as const;
  const at = stage === "done" ? 3 : order.indexOf(stage);
  return [
    { detail: "Alamat & rincian paket", label: "Isi data" },
    { detail: "Tarif tiap ekspedisi", label: "Cek tarif" },
    { detail: "Pilih layanan & AWB", label: "Terbitkan resi" },
  ].map((step, index) => ({ ...step, state: index < at ? "done" : index === at ? "current" : "pending" }));
}

export default async function NewShipmentPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  let principal;
  try {
    principal = await requireCmsScope("tenant", { allowPendingApproval: true });
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  const header = <PageHeader title="Buat kiriman" />;

  // PR-60: a gerai awaiting approval sees the page, read-only; every action refuses it anyway.
  if (principal.tenantStatus !== "ACTIVE") {
    return (
      <>
        {header}
        <FlowStepper steps={steps("fill")} />
        <DataCard>
          <EmptyState
            description="Pembuatan kiriman aktif setelah admin platform menyetujui gerai ini."
            icon={Clock}
            title="Gerai menunggu persetujuan"
          />
        </DataCard>
      </>
    );
  }

  const requestedDraftId = (await searchParams).draft;
  const data = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    // In turn, not Promise.all: one transaction, one connection (T-197).
    const readyOutlets = await listReadyShipmentOutlets(tx, context);
    const points = await listOutletPickupPoints(tx, context);
    const outlets: FlowOutlet[] = readyOutlets.map((outlet) => ({
      ...outlet,
      pickupPoints: points
        .filter((point) => point.outletId === outlet.id)
        .map(({ isDefault, originAreaLabel, pickupAddressId, pickupAddressLabel }) => ({ isDefault, originAreaLabel, pickupAddressId, pickupAddressLabel })),
    }));
    const [gerai] = await tx
      .select({ name: tenants.name, phone: tenants.contactWhatsapp })
      .from(tenants)
      .where(eq(tenants.id, context.tenantId))
      .limit(1);
    const draft = requestedDraftId && UUID_PATTERN.test(requestedDraftId)
      ? await loadShipmentFlowDraft(tx, context, requestedDraftId)
      : null;
    const snapshot = draft && (draft.status === "DRAFT" || draft.status === "ESTIMATED")
      ? await loadLatestEstimateSnapshot(tx, context, draft.id)
      : null;
    const codFormulaRetired = draft?.status === "ESTIMATED" && draft.isCod
      ? await shipmentCodFormulaRetired(tx, context, draft.id)
      : false;
    // Every point of the draft's outlet (ready or not), so a saved draft always shows its origin.
    const draftPoints = draft ? points.filter((point) => point.outletId === draft.outletId) : [];
    // T-243: Mitra kurir — the gerai's switched-off couriers are never offered.
    const disabledCouriers = await loadTenantDisabledCouriers(tx, context);
    return { codFormulaRetired, disabledCouriers, draft, draftPoints, gerai: gerai ?? { name: "", phone: null }, outlets, snapshot };
  });

  // Step 1 — the form.
  if (!data.draft) {
    if (data.outlets.length === 0) {
      const admin = principal.role === "TENANT_ADMIN";
      return (
        <>
          {header}
          <FlowStepper steps={steps("fill")} />
          <DataCard>
            <EmptyState
              action={admin ? (
                <Button asChild>
                  <Link href="/app/pengaturan/outlet"><Settings2 aria-hidden="true" />Atur outlet &amp; titik pickup</Link>
                </Button>
              ) : undefined}
              description={admin
                ? "Lengkapi titik pickup dan koneksi Mengantar outlet sebelum membuat kiriman."
                : "Hubungi pemilik gerai untuk menyiapkan titik pickup outlet."}
              icon={Settings2}
              title="Outlet belum siap untuk kiriman"
            />
          </DataCard>
        </>
      );
    }
    return (
      <>
        {header}
        <FlowStepper steps={steps("fill")} />
        <ShipmentCreateForm gerai={data.gerai} nowIso={new Date().toISOString()} outlets={data.outlets} submissionId={randomUUID()} />
      </>
    );
  }

  const draft = data.draft;
  const detailHref = shipmentDetailHref(draft.publicReference);
  const open = draft.status === "DRAFT" || draft.status === "ESTIMATED";

  // Past issuance: the result and its next step (Cetak label on a resi; the detail otherwise).
  if (!open) {
    const issued = draft.status === "ISSUED";
    return (
      <>
        {header}
        <FlowStepper steps={steps("done")} />
        <DataCard>
          <EmptyState
            action={(
              <>
                {issued ? (
                  <Button asChild>
                    <Link href={shipmentLabelHref(draft.publicReference)}><Printer aria-hidden="true" />Cetak label</Link>
                  </Button>
                ) : null}
                <Button asChild variant={issued ? "outline" : "default"}>
                  <Link href={detailHref}><FileSearch aria-hidden="true" />Buka detail kiriman</Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/app/pengiriman/baru">Buat kiriman berikutnya</Link>
                </Button>
              </>
            )}
            description={<span className="flex flex-wrap items-center justify-center gap-2"><span className="font-mono font-semibold">{draft.publicReference}</span><ShipmentStatusBadge status={draft.status} /></span>}
            icon={issued ? Printer : FileSearch}
            title={issued ? "Resi sudah terbit" : "Kiriman sudah diajukan ke Mengantar"}
          />
        </DataCard>
      </>
    );
  }

  const point = data.draftPoints.find((candidate) => (draft.pickupAddressId ? candidate.pickupAddressId === draft.pickupAddressId : candidate.isDefault)) ?? null;
  const outletName = data.outlets.find((outlet) => outlet.id === draft.outletId)?.name ?? "Outlet";
  const sections = (
    <SavedDraftSections
      draft={draft}
      origin={{ areaLabel: point?.originAreaLabel ?? null, outletName, pickupLabel: point?.pickupAddressLabel ?? null }}
    />
  );
  const paymentMethod = paymentMethodOf(draft.isCod, draft.codShippingOnly);
  const packageLabel = `${gramsToKilogramLabel(draft.packageWeightGrams)} · ${draft.packageQuantity} barang`;
  const origin = { detail: draft.sender ? `${draft.sender.name} (${draft.sender.phone})` : undefined, title: point?.originAreaLabel ?? outletName };
  const rail = {
    destination: draft.destinationAreaLabel,
    handover: handoverSummary(draft).replace(/^Penjemputan terjadwal · /, "Pickup · "),
    origin,
    packageLabel,
    sender: draft.sender?.name ?? "—",
  };
  const draftNumber = (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      Draf <span className="font-mono font-semibold text-foreground">{draft.publicReference}</span>
      <ShipmentStatusBadge status={draft.status} />
      <Link className="font-semibold text-primary underline-offset-4 hover:underline" href="/app/pengiriman/baru">Buat kiriman baru</Link>
    </p>
  );

  // Step 3 — services from the stored estimate.
  if (draft.status === "ESTIMATED" && data.snapshot) {
    return (
      <>
        {header}
        <FlowStepper steps={steps("issue")} />
        {draftNumber}
        <IssuanceStage
          destinationContext={`Tujuan: ${draft.destinationAreaLabel.split(",").slice(0, 2).join(",")} · Berat: ${gramsToKilogramLabel(draft.packageWeightGrams)}`}
          draftHref={detailHref}
          provider={{
            codFormulaRetired: data.codFormulaRetired,
            declaredValueIdr: draft.declaredValueIdr,
            fixtureEnabled: isSanctionedOrderFixtureEnabled(),
            options: buildShipmentEstimateOptions({
              codFormulaRetired: data.codFormulaRetired,
              declaredValueIdr: draft.declaredValueIdr,
              paymentMethod,
              services: filterTenantCourierServices(data.snapshot.services, data.disabledCouriers),
            }),
            paymentMethod,
            shipmentId: draft.id,
            snapshotId: data.snapshot.snapshotId,
          }}
          rail={{ ...rail, freshness: `Tarif Mengantar ${retrievedAtFormat.format(data.snapshot.retrievedAt)} WIB` }}
          sections={sections}
        />
      </>
    );
  }

  // Step 2 — load the estimate once.
  return (
    <>
      {header}
      <FlowStepper steps={steps("estimate")} />
      {draftNumber}
      <div className="flex flex-col items-start gap-6 pb-32 lg:flex-row lg:pb-0">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-6">
          {sections}
          <SectionCard emphasis id="section-service" number={5} title="Pilih layanan ekspedisi">
            <EstimateLoader autoLoad={draft.status === "DRAFT"} shipmentId={draft.id} />
          </SectionCard>
        </div>
        <div className="hidden w-90 shrink-0 lg:sticky lg:top-24 lg:block">
          <SummaryRail
            actions={(
              <>
                <Button className="w-full" disabled size="lg">Konfirmasi &amp; terbitkan AWB</Button>
                <p className="text-center text-xs text-muted-foreground">Menunggu tarif Mengantar.</p>
                <Button asChild className="w-full" variant="outline"><Link href={detailHref}>Simpan draf</Link></Button>
              </>
            )}
            destination={rail.destination}
            moneyRows={[{ amountIdr: null, label: "Ongkir" }]}
            origin={rail.origin}
            rows={[
              { label: "Tipe penyerahan", tone: "accent", value: rail.handover },
              { label: "Pengirim di label", value: rail.sender },
              { label: "Berat & jumlah", value: rail.packageLabel },
            ]}
            source="Estimasi"
            total={{ amountIdr: null, label: "Total", note: "Menunggu tarif Mengantar" }}
          />
        </div>
      </div>
      <MobileActionBar
        actions={<Button asChild size="lg" variant="outline"><Link href={detailHref}>Simpan draf</Link></Button>}
        caption="Menunggu tarif Mengantar"
        total={null}
      />
    </>
  );
}
