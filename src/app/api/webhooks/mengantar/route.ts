import "server-only";

import { db } from "@/db/client";
import { recordMengantarWebhookEvent } from "@/db/mengantar-webhook-repository";
import { handleMengantarWebhook, mengantarWebhookConfig } from "@/lib/mengantar-webhook";

/**
 * D-30 / T-238: Mengantar tracking webhook, built to the documented contract
 * (`src/lib/mengantar-webhook.ts`) and **closed by default**: without
 * `MENGANTAR_WEBHOOK_ENABLED=1` and `MENGANTAR_WEBHOOK_SECRET` it answers an
 * empty 404 and reads nothing, as it did before T-238.
 *
 * History: the handler committed in `67beb92` invented its header names,
 * payload fields and status vocabulary, compared the HMAC with `!==`, read an
 * unbounded body and wrote `shipments` with no tenant predicate; T-79 closed
 * it. This version answers each of those: the documented headers and signed
 * string, `timingSafeEqual`, a 16 KB bound, a 5-minute window, and a
 * SECURITY DEFINER write that resolves the tenant from the provider record
 * and is idempotent per delivery (`tests/mengantar-webhook.integration.test.ts`).
 * Open gap: no real delivery has been captured yet (the account's webhook is
 * not enabled), and the one secret covers the platform-default account only.
 */
export function POST(request: Request) {
  return handleMengantarWebhook(request, {
    config: mengantarWebhookConfig(process.env),
    now: Date.now,
    record: (event) => recordMengantarWebhookEvent(db, event),
  });
}
