import { asc, eq } from "drizzle-orm";

import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { outlets, shipments } from "@/db/schema";

export function listTenantOutlets(tx: TenantTransaction, context: TenantContext) {
  return tx
    .select({ id: outlets.id, name: outlets.name })
    .from(outlets)
    .where(eq(outlets.tenantId, context.tenantId))
    .orderBy(asc(outlets.name));
}

export function listTenantShipments(tx: TenantTransaction, context: TenantContext) {
  return tx
    .select({ id: shipments.id, outletId: shipments.outletId, status: shipments.status })
    .from(shipments)
    .where(eq(shipments.tenantId, context.tenantId))
    .orderBy(asc(shipments.createdAt));
}
