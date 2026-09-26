import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { shipmentCodFormulaRetired } from "@/db/cod-totals-repository";
import { listOutletPickupPoints } from "@/db/outlet-pickup-point-repository";
import { providerOrderSnapshots, providerOrderStatusObservations } from "@/db/schema";
import { loadShipmentFlowDraft } from "@/db/shipment-draft-repository";
import { listProviderHistoryEvents } from "@/db/provider-tracking-repository";
import { loadShipmentDetail } from "@/db/shipment-queue-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

import type { AttentionEvidence, StatusObservation } from "./detail-model";

/** Enough history for one shipment's journey; repeats collapse in `buildTrackingTimeline`. */
const OBSERVATION_LIMIT = 60;

/**
 * T-213: everything the detail renders, read in one tenant transaction, in turn (T-197). The
 * existing loaders own the shipment, the draft (handover, pickup, landmark) and the pickup points;
 * the two reads below add only what no loader returns yet: the order's settlement shipping basis
 * and estimate service, and the Mengantar status observations. Observations are Tenant Admin
 * evidence (T-146, RLS), so an operator never queries them.
 */
export async function loadShipmentDetailView(tx: TenantTransaction, context: TenantContext, shipmentId: string) {
  const detail = await loadShipmentDetail(tx, context, shipmentId);
  if (!detail) return null;
  const draft = await loadShipmentFlowDraft(tx, context, shipmentId);
  const points = draft ? await listOutletPickupPoints(tx, context, draft.outletId) : [];
  const pickupPoint = draft
    ? points.find((point) => (draft.pickupAddressId ? point.pickupAddressId === draft.pickupAddressId : point.isDefault)) ?? null
    : null;
  const codFormulaRetired = detail.status === "ESTIMATED" && detail.isCod
    ? await shipmentCodFormulaRetired(tx, context, shipmentId)
    : false;

  const [order] = await tx
    .select({
      chargedShippingIdr: providerOrderSnapshots.providerChargedShippingIdr,
      estimateServiceId: providerOrderSnapshots.estimateServiceId,
      returnCnoteNo: providerOrderSnapshots.returnCnoteNo,
    })
    .from(providerOrderSnapshots)
    .where(and(eq(providerOrderSnapshots.tenantId, context.tenantId), eq(providerOrderSnapshots.shipmentId, shipmentId)))
    .limit(1);

  const observations: (StatusObservation & AttentionEvidence & { source: "PULL" | "WEBHOOK" })[] = context.role === "TENANT_ADMIN"
    ? await tx
      .select({
        claimStatus: providerOrderStatusObservations.claimStatus,
        isBreach: providerOrderStatusObservations.isBreach,
        lastUndeliveredCode: providerOrderStatusObservations.lastUndeliveredCode,
        podCode: providerOrderStatusObservations.podCode,
        ticketStatus: providerOrderStatusObservations.ticketStatus,
        source: providerOrderStatusObservations.source,
        lastHistoryAt: providerOrderStatusObservations.lastHistoryAt,
        lastHistoryDesc: providerOrderStatusObservations.lastHistoryDesc,
        mappedStatus: providerOrderStatusObservations.mappedStatus,
        observedAt: providerOrderStatusObservations.observedAt,
        providerStatus: providerOrderStatusObservations.providerStatus,
      })
      .from(providerOrderStatusObservations)
      .where(and(
        eq(providerOrderStatusObservations.tenantId, context.tenantId),
        eq(providerOrderStatusObservations.shipmentId, shipmentId),
      ))
      .orderBy(desc(providerOrderStatusObservations.observedAt), desc(providerOrderStatusObservations.id))
      .limit(OBSERVATION_LIMIT)
    : [];

  // T-238: the courier's own tracking history is operational, so both roles read it.
  const historyEvents = await listProviderHistoryEvents(tx, context, shipmentId);
  // Attention signals come from the newest *pull* (a webhook row carries none).
  const attention = observations.find((observation) => observation.source === "PULL") ?? null;

  return {
    attention,
    codFormulaRetired,
    detail,
    draft,
    historyEvents,
    observations,
    observationsVisible: context.role === "TENANT_ADMIN",
    order: order ?? null,
    pickupPoint,
  };
}

export type ShipmentDetailView = NonNullable<Awaited<ReturnType<typeof loadShipmentDetailView>>>;
