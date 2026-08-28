import { and, eq } from "drizzle-orm";

import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { outlets, shipmentDrafts, shipmentParties, shipments } from "@/db/schema";
import type { ShipmentDraftInput } from "@/lib/shipment-draft";
export class OutletUnavailableError extends Error {
  constructor() {
    super("Outlet is not available for shipment drafts.");
  }
}

export async function createShipmentDraft(
  tx: TenantTransaction,
  context: TenantContext,
  input: ShipmentDraftInput,
) {
  const outlet = await tx
    .select({
      defaultOriginAreaId: outlets.defaultOriginAreaId,
      defaultPickupAddressId: outlets.defaultPickupAddressId,
      id: outlets.id,
    })
    .from(outlets)
    .where(and(eq(outlets.id, input.outletId), eq(outlets.tenantId, context.tenantId)))
    .limit(1);

  if (
    outlet.length !== 1 ||
    !outlet[0].defaultOriginAreaId ||
    !outlet[0].defaultPickupAddressId
  ) {
    throw new OutletUnavailableError();
  }

  const created = await tx
    .insert(shipments)
    .values({ outletId: outlet[0].id, tenantId: context.tenantId })
    .returning({ id: shipments.id });

  const shipment = created[0];
  if (!shipment) {
    throw new Error("Shipment draft was not created.");
  }

  await tx.insert(shipmentDrafts).values({
    declaredValueIdr: input.declaredValueIdr,
    destinationAreaId: input.destinationAreaId,
    destinationAreaLabel: input.destinationAreaLabel,
    isCod: input.isCod,
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
      name: input.recipientName,
      phone: input.recipientPhone,
      role: "RECIPIENT",
      shipmentId: shipment.id,
      tenantId: context.tenantId,
    },
  ]);

  return shipment.id;
}
