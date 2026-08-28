import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import * as schema from "@/db/schema";

export class MengantarConfigurationDeniedError extends Error {
  constructor() {
    super("Mengantar configuration is not authorized.");
  }
}

export function mengantarSecretReference(tenantId: string, outletId: string) {
  return `managed://mengantar/${tenantId}/${outletId}`;
}

export async function configureMengantarConnection(
  principalId: string,
  tenantId: string,
  input: { outletId: string; pickupAddressId: string; originAreaId: string },
) {
  if (!input.outletId || !input.pickupAddressId.trim() || !input.originAreaId.trim()) {
    throw new MengantarConfigurationDeniedError();
  }

  return withTenantContext(db, principalId, tenantId, async (tx, context) => {
    if (context.role !== "TENANT_ADMIN") {
      throw new MengantarConfigurationDeniedError();
    }

    const outlet = await tx
      .select({ id: schema.outlets.id })
      .from(schema.outlets)
      .where(
        and(
          eq(schema.outlets.id, input.outletId),
          eq(schema.outlets.tenantId, context.tenantId),
        ),
      )
      .limit(1);

    if (outlet.length !== 1) {
      throw new MengantarConfigurationDeniedError();
    }

    await tx
      .update(schema.outlets)
      .set({
        defaultPickupAddressId: input.pickupAddressId,
        defaultOriginAreaId: input.originAreaId,
        updatedAt: new Date(),
      })
      .where(eq(schema.outlets.id, input.outletId));

    const secretReference = mengantarSecretReference(context.tenantId, outlet[0].id);
    await tx
      .insert(schema.mengantarConnections)
      .values({ tenantId: context.tenantId, outletId: outlet[0].id, secretReference })
      .onConflictDoUpdate({
        target: schema.mengantarConnections.outletId,
        set: { secretReference, updatedAt: new Date() },
      });
  });
}
