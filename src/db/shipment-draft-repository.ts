import "server-only";

import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { requireReadyShipmentOutlet } from "@/db/outlet-readiness-repository";
import {
  resolveShipmentPickupPoint,
  type ResolvedShipmentPickupPoint,
} from "@/db/outlet-pickup-point-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { shipmentDrafts, shipmentParties, shipments } from "@/db/schema";
import { partyPhoneNationalNumber, type ShipmentDraftInput } from "@/lib/shipment-draft";

export class OutletUnavailableError extends Error {
  constructor() {
    super("Outlet is not available for shipment drafts.");
  }
}

export class DraftSubmissionConflictError extends Error {
  constructor() {
    super("Shipment draft submission could not be replayed safely.");
  }
}

export async function requireConfiguredShipmentOutlet(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
) {
  const readyOutletId = await requireReadyShipmentOutlet(tx, context, outletId);
  if (!readyOutletId) {
    throw new OutletUnavailableError();
  }

  return readyOutletId;
}

async function inspectExistingSubmission(
  tx: TenantTransaction,
  context: TenantContext,
  input: ShipmentDraftInput,
  submissionId: string,
  resolvedPickup: ResolvedShipmentPickupPoint | null,
) {
  const existingShipments = await tx
    .select({ outletId: shipments.outletId })
    .from(shipments)
    .where(
      and(
        eq(shipments.id, submissionId),
        eq(shipments.tenantId, context.tenantId),
      ),
    )
    .limit(1);
  const existingShipment = existingShipments[0];
  if (!existingShipment) return "missing" as const;

  const existingDrafts = await tx
    .select({
      declaredValueIdr: shipmentDrafts.declaredValueIdr,
      destinationAreaId: shipmentDrafts.destinationAreaId,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      destinationAreaVerifiedAt: shipmentDrafts.destinationAreaVerifiedAt,
      isCod: shipmentDrafts.isCod,
      isHazardous: shipmentDrafts.isHazardous,
      packageContent: shipmentDrafts.packageContent,
      packageHeightCm: shipmentDrafts.packageHeightCm,
      packageLengthCm: shipmentDrafts.packageLengthCm,
      packageQuantity: shipmentDrafts.packageQuantity,
      packageWeightGrams: shipmentDrafts.packageWeightGrams,
      packageWidthCm: shipmentDrafts.packageWidthCm,
      pickupAddressId: shipmentDrafts.pickupAddressId,
      recipientAddressLandmark: shipmentDrafts.recipientAddressLandmark,
      shippingInstruction: shipmentDrafts.shippingInstruction,
    })
    .from(shipmentDrafts)
    .where(
      and(
        eq(shipmentDrafts.shipmentId, submissionId),
        eq(shipmentDrafts.tenantId, context.tenantId),
      ),
    )
    .limit(1);
  const parties = await tx
    .select({
      address: shipmentParties.address,
      destinationAreaId: shipmentParties.destinationAreaId,
      destinationAreaLabel: shipmentParties.destinationAreaLabel,
      name: shipmentParties.name,
      phone: shipmentParties.phone,
      role: shipmentParties.role,
    })
    .from(shipmentParties)
    .where(
      and(
        eq(shipmentParties.shipmentId, submissionId),
        eq(shipmentParties.tenantId, context.tenantId),
      ),
    );
  const draft = existingDrafts[0];
  const sender = parties.find((party) => party.role === "SENDER");
  const recipient = parties.find((party) => party.role === "RECIPIENT");
  return existingShipment.outletId === input.outletId &&
      draft?.declaredValueIdr === input.declaredValueIdr &&
      draft.destinationAreaId === input.destinationAreaId &&
      draft.destinationAreaLabel === input.destinationAreaLabel &&
      (draft.destinationAreaVerifiedAt !== null) === input.destinationAreaVerified &&
      draft.isCod === input.isCod &&
      draft.isHazardous === input.isHazardous &&
      draft.recipientAddressLandmark === input.recipientAddressLandmark &&
      draft.shippingInstruction === input.shippingInstruction &&
      draft.packageContent === input.packageContent &&
      draft.packageHeightCm === input.packageHeightCm &&
      draft.packageLengthCm === input.packageLengthCm &&
      draft.packageQuantity === input.packageQuantity &&
      draft.packageWeightGrams === input.packageWeightGrams &&
      draft.packageWidthCm === input.packageWidthCm &&
      // A replay that would leave from a different pickup point is a different
      // shipment, not the same submission arriving twice.
      draft.pickupAddressId === (resolvedPickup?.pickupAddressId ?? null) &&
      sender?.name === input.senderName &&
      sender.phone === input.senderPhone &&
      sender.address === input.senderAddress &&
      recipient?.name === input.recipientName &&
      recipient.phone === input.recipientPhone &&
      recipient.address === input.recipientAddress &&
      recipient.destinationAreaId === input.destinationAreaId &&
      recipient.destinationAreaLabel === input.destinationAreaLabel
    ? "match" as const
    : "conflict" as const;
}

export async function resolveExistingShipmentDraftReplay(
  tx: TenantTransaction,
  context: TenantContext,
  input: ShipmentDraftInput,
  submissionId: string,
  resolvedPickup: ResolvedShipmentPickupPoint | null = null,
) {
  const state = await inspectExistingSubmission(
    tx,
    context,
    input,
    submissionId,
    resolvedPickup,
  );
  if (state === "conflict") throw new DraftSubmissionConflictError();
  return state === "match" ? submissionId : null;
}

export async function createShipmentDraft(
  tx: TenantTransaction,
  context: TenantContext,
  input: ShipmentDraftInput,
  submissionId?: string,
) {
  // The pickup point is authorized before anything is written, so a forged
  // `pickupAddressId` fails the submission instead of reaching the provider.
  const resolvedPickup = await resolveShipmentPickupPoint(
    tx,
    context,
    input.outletId,
    input.pickupAddressId,
  );
  if (submissionId) {
    const replay = await resolveExistingShipmentDraftReplay(
      tx,
      context,
      input,
      submissionId,
      resolvedPickup,
    );
    if (replay) return replay;
  }
  const outletId = await requireConfiguredShipmentOutlet(tx, context, input.outletId);
  const created = await tx
    .insert(shipments)
    .values({ createdByUserId: context.userId, id: submissionId, outletId, tenantId: context.tenantId })
    .onConflictDoNothing({ target: shipments.id })
    .returning({ id: shipments.id });

  const shipment = created[0];
  if (!shipment) {
    if (!submissionId) throw new Error("Shipment draft was not created.");
    const replay = await resolveExistingShipmentDraftReplay(
      tx,
      context,
      input,
      submissionId,
      resolvedPickup,
    );
    if (!replay) throw new DraftSubmissionConflictError();
    return replay;
  }

  await tx.insert(shipmentDrafts).values({
    declaredValueIdr: input.declaredValueIdr,
    destinationAreaId: input.destinationAreaId,
    destinationAreaLabel: input.destinationAreaLabel,
    // Stamped only when the caller re-checked the area with Mengantar during
    // this submission; NULL is an explicit "unverified" the order path refuses.
    destinationAreaVerifiedAt: input.destinationAreaVerified ? new Date() : null,
    isCod: input.isCod,
    isHazardous: input.isHazardous,
    recipientAddressLandmark: input.recipientAddressLandmark,
    shippingInstruction: input.shippingInstruction,
    packageContent: input.packageContent,
    packageHeightCm: input.packageHeightCm,
    packageLengthCm: input.packageLengthCm,
    packageQuantity: input.packageQuantity,
    packageWeightGrams: input.packageWeightGrams,
    packageWidthCm: input.packageWidthCm,
    // The pickup point this shipment leaves from, snapshotted like the
    // destination area. NULL only where the outlet has no pickup point at all.
    pickupAddressId: resolvedPickup?.pickupAddressId ?? null,
    originAreaId: resolvedPickup?.originAreaId ?? null,
    shipmentId: shipment.id,
    tenantId: context.tenantId,
  });

  await tx.insert(shipmentParties).values([
    {
      address: input.senderAddress,
      name: input.senderName,
      phone: input.senderPhone,
      role: "SENDER",
      shipmentId: shipment.id,
      tenantId: context.tenantId,
    },
    {
      address: input.recipientAddress,
      destinationAreaId: input.destinationAreaId,
      destinationAreaLabel: input.destinationAreaLabel,
      name: input.recipientName,
      phone: input.recipientPhone,
      role: "RECIPIENT",
      shipmentId: shipment.id,
      tenantId: context.tenantId,
    },
  ]);

  return shipment.id;
}

export type ShipmentDraftDestinationForVerification = {
  outletId: string;
  destinationAreaId: string;
  destinationAreaLabel: string;
  destinationAreaVerifiedAt: Date | null;
};

/**
 * B3: every draft written before PR-47's `destination_area_verified_at`
 * column exists with that column NULL, which `buildMengantarOrderPayload`
 * permanently refuses. This loads the tenant-scoped, still-open draft the
 * recovery action re-checks against Mengantar (see
 * `verifyShipmentDraftDestinationArea` in `src/app/app/actions.ts`).
 */
export async function loadShipmentDraftDestinationForVerification(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<ShipmentDraftDestinationForVerification | null> {
  const rows = await tx
    .select({
      outletId: shipments.outletId,
      destinationAreaId: shipmentDrafts.destinationAreaId,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      destinationAreaVerifiedAt: shipmentDrafts.destinationAreaVerifiedAt,
    })
    .from(shipments)
    .innerJoin(
      shipmentDrafts,
      and(
        eq(shipmentDrafts.shipmentId, shipments.id),
        eq(shipmentDrafts.tenantId, shipments.tenantId),
      ),
    )
    .where(
      and(
        eq(shipments.id, shipmentId),
        eq(shipments.tenantId, context.tenantId),
        inArray(shipments.status, ["DRAFT", "ESTIMATED"]),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Stamps `destination_area_verified_at` only when the area just re-checked
 * against Mengantar (`expected`) still matches what the draft has stored.
 * Never trusts the caller's word over that match: if the draft moved on
 * (edited, submitted, or its area changed) between the check and this write,
 * zero rows update and the caller must re-verify rather than force the stamp.
 */
export async function stampShipmentDraftDestinationVerified(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
  expected: { areaId: string; areaLabel: string },
): Promise<boolean> {
  const updated = await tx
    .update(shipmentDrafts)
    .set({ destinationAreaVerifiedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(shipmentDrafts.shipmentId, shipmentId),
        eq(shipmentDrafts.tenantId, context.tenantId),
        eq(shipmentDrafts.destinationAreaId, expected.areaId),
        eq(shipmentDrafts.destinationAreaLabel, expected.areaLabel),
      ),
    )
    .returning({ shipmentId: shipmentDrafts.shipmentId });
  return updated.length === 1;
}

export const DUPLICATE_SHIPMENT_WINDOW_DAYS = 7;

export async function checkDuplicateShipment(
  tx: TenantTransaction,
  context: TenantContext,
  recipientPhone: string,
) {
  const windowStart = new Date(
    Date.now() - DUPLICATE_SHIPMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const result = await tx
    .select({ id: shipments.id })
    .from(shipments)
    .innerJoin(
      shipmentParties,
      and(
        eq(shipmentParties.shipmentId, shipments.id),
        eq(shipmentParties.tenantId, shipments.tenantId),
      ),
    )
    .where(
      and(
        eq(shipments.tenantId, context.tenantId),
        eq(shipmentParties.role, "RECIPIENT"),
        // Match on the national number so an older `+62…` snapshot is still recognised
        // as the same customer; party snapshots are immutable and cannot be rewritten.
        sql`regexp_replace(regexp_replace(${shipmentParties.phone}, '[^0-9]', '', 'g'), '^(62|0)', '') = ${partyPhoneNationalNumber(recipientPhone)}`,
        gte(shipments.createdAt, windowStart),
      ),
    )
    .limit(1);

  return result.length > 0;
}
