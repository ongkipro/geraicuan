import "server-only";

import { notFound, redirect } from "next/navigation";

import { db } from "@/db/client";
import { resolveShipmentRouteKey } from "@/db/shipment-number-repository";
import { withTenantContext } from "@/db/tenant-context";
import { parseShipmentRouteKey } from "@/lib/shipment-number";

/**
 * PR-44: `/app/pengiriman/10013` is canonical. A legacy UUID or a prefixed number
 * (`GC-10013`) redirects there; an unknown key or another tenant's number is 404.
 * Returns the internal UUID the rest of the page keeps using.
 */
export async function resolveShipmentRoute(
  principal: { userId: string; tenantId?: string },
  routeKey: string,
  basePath: "/app/pengiriman" | "/app/label",
) {
  const key = parseShipmentRouteKey(routeKey);
  if (!key) notFound();
  const resolved = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    resolveShipmentRouteKey(tx, context, key));
  if (!resolved) notFound();
  if (key.kind !== "number" || !key.canonical) redirect(`${basePath}/${resolved.tenantNumber}`);
  return resolved.shipmentId;
}
