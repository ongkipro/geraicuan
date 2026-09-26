import "server-only";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { deriveProviderAccountKey } from "@/db/order-batch-repository";
import type * as schema from "@/db/schema";
import type { MengantarWebhookEvent } from "@/lib/mengantar-webhook";

/** The only account the one configured webhook secret belongs to (D-30). */
export const PLATFORM_WEBHOOK_ACCOUNT_KEY = deriveProviderAccountKey("platform_default");

export const MENGANTAR_WEBHOOK_OUTCOMES = [
  "APPLIED",
  "UNCHANGED",
  "REFUSED",
  "NO_LIFECYCLE_STATE",
  "UNRECOGNISED",
  "SUPERSEDED",
  "NOT_FOUND",
  "DUPLICATE",
] as const;

/**
 * T-238 / D-30. The webhook has no user principal, so it writes through the
 * SECURITY DEFINER `record_mengantar_webhook_event` (migration 0063), which
 * resolves the AWB to exactly one shipment of this account in an ACTIVE tenant,
 * decides with the same transition rules as the pull, appends one WEBHOOK
 * observation and moves `shipments.status` only on APPLIED.
 */
export async function recordMengantarWebhookEvent(
  database: NodePgDatabase<typeof schema>,
  event: MengantarWebhookEvent,
  accountKey = PLATFORM_WEBHOOK_ACCOUNT_KEY,
) {
  const result = await database.execute<{ outcome: string }>(sql`
    SELECT public.record_mengantar_webhook_event(
      ${accountKey}, ${event.cnoteNo}, ${event.providerStatus}, ${event.mappedStatus},
      ${event.recognised}, ${event.eventAt.toISOString()}::timestamptz
    ) AS outcome
  `);
  return result.rows[0]?.outcome ?? "NOT_FOUND";
}
