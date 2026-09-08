import { and, eq, gte } from "drizzle-orm";

import { requireReadyShipmentOutlet } from "@/db/outlet-readiness-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { shipmentDrafts, shipmentParties, shipments } from "@/db/schema";
import type { ShipmentDraftInput } from "@/lib/shipment-draft";
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
      isCod: shipmentDrafts.isCod,
      packageContent: shipmentDrafts.packageContent,
      packageHeightCm: shipmentDrafts.packageHeightCm,
      packageLengthCm: shipmentDrafts.packageLengthCm,
      packageQuantity: shipmentDrafts.packageQuantity,
      packageWeightGrams: shipmentDrafts.packageWeightGrams,
      packageWidthCm: shipmentDrafts.packageWidthCm,
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
      draft.isCod === input.isCod &&
      draft.packageContent === input.packageContent &&
      draft.packageHeightCm === input.packageHeightCm &&
      draft.packageLengthCm === input.packageLengthCm &&
      draft.packageQuantity === input.packageQuantity &&
      draft.packageWeightGrams === input.packageWeightGrams &&
      draft.packageWidthCm === input.packageWidthCm &&
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
) {
  const state = await inspectExistingSubmission(tx, context, input, submissionId);
  if (state === "conflict") throw new DraftSubmissionConflictError();
  return state === "match" ? submissionId : null;
}

export async function createShipmentDraft(
  tx: TenantTransaction,
  context: TenantContext,
  input: ShipmentDraftInput,
  submissionId?: string,
) {
  if (submissionId) {
    const replay = await resolveExistingShipmentDraftReplay(
      tx,
      context,
      input,
      submissionId,
    );
    if (replay) return replay;
  }
  const outletId = await requireConfiguredShipmentOutlet(tx, context, input.outletId);
  const created = await tx
    .insert(shipments)
    .values({ id: submissionId, outletId, tenantId: context.tenantId, cogsAmountIdr: input.cogsAmountIdr ?? null })
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
    );
    if (!replay) throw new DraftSubmissionConflictError();
    return replay;
  }

  await tx.insert(shipmentDrafts).values({
    declaredValueIdr: input.declaredValueIdr,
    destinationAreaId: input.destinationAreaId,
    destinationAreaLabel: input.destinationAreaLabel,
    isCod: input.isCod,
    cogsAmountIdr: input.cogsAmountIdr ?? null,
    packageContent: input.packageContent,
    packageHeightCm: input.packageHeightCm,
    packageLengthCm: input.packageLengthCm,
    packageQuantity: input.packageQuantity,
    packageWeightGrams: input.packageWeightGrams,
    packageWidthCm: input.packageWidthCm,
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


export async function checkDuplicateShipment(
  tx: TenantTransaction,
  context: TenantContext,
  recipientPhone: string,
) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const result = await tx
    .select({ id: shipments.id })
    .from(shipments)
    .innerJoin(shipmentParties, eq(shipments.id, shipmentParties.shipmentId))
    .where(
      and(
        eq(shipments.tenantId, context.tenantId),
        eq(shipmentParties.role, 'RECIPIENT'),
        eq(shipmentParties.phone, recipientPhone),
        gte(shipments.createdAt, sevenDaysAgo)
      )
    )
    .limit(1);
    
  return result.length > 0;
}
