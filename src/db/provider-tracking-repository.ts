import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { providerOrderHistoryEvents } from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

/** Enough of one parcel's journey; the pull stores at most 100 events per order and pull. */
export const HISTORY_EVENT_LIMIT = 100;

/**
 * T-238 / DATA-18: the courier's tracking events for one shipment, newest first.
 * Both tenant roles read them (RLS: any ACTIVE member of an ACTIVE tenant); the
 * tenant predicate is repeated in SQL so RLS is never the only control.
 */
export async function listProviderHistoryEvents(tx: TenantTransaction, context: TenantContext, shipmentId: string) {
  return tx
    .select({
      description: providerOrderHistoryEvents.description,
      occurredAt: providerOrderHistoryEvents.occurredAt,
    })
    .from(providerOrderHistoryEvents)
    .where(and(
      eq(providerOrderHistoryEvents.tenantId, context.tenantId),
      eq(providerOrderHistoryEvents.shipmentId, shipmentId),
    ))
    .orderBy(desc(providerOrderHistoryEvents.occurredAt), desc(providerOrderHistoryEvents.id))
    .limit(HISTORY_EVENT_LIMIT);
}
