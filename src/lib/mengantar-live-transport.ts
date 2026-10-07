import "server-only";

import { deriveProviderAccountKey, type ProviderBatchScope } from "@/db/order-batch-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { resolveMengantarAccountCredentials, type MengantarAccountCredentials } from "@/lib/mengantar-credentials";
import { assertNotDemoTenant } from "@/lib/mengantar-demo-tenant";
import { assertMengantarCredentialsUsable, mengantarAnswerMessage, requestMengantar } from "@/lib/mengantar-http";
import {
  MengantarOrderRefusedError,
  MengantarOrderSubmissionUnknownError,
  MengantarOrderTransportUnavailableError,
  readMengantarOrderAnswer,
  type MengantarOrderTransportBinding,
  type MengantarOrderTransportLookup,
} from "@/lib/mengantar-order";
import {
  MengantarUnpaidRecoveryUnknownError,
  readMengantarPayUnpaidAnswer,
  type MengantarPayUnpaidTransportBinding,
  type MengantarPayUnpaidTransportLookup,
} from "@/lib/mengantar-unpaid-recovery";

/**
 * T-280 (D-42): live Mengantar mutations are switched on by
 * `MENGANTAR_LIVE_ORDERS_ENABLED=1`. Production additionally needs
 * `MENGANTAR_LIVE_ORDERS_PRODUCTION_APPROVED=1`, set only once D-5's release
 * evidence exists (provider contract, isolation, secrets, reconciliation, rollback).
 */
export function isLiveMengantarOrdersEnabled() {
  if (process.env.MENGANTAR_LIVE_ORDERS_ENABLED !== "1") return false;
  return process.env.NODE_ENV !== "production"
    || process.env.MENGANTAR_LIVE_ORDERS_PRODUCTION_APPROVED === "1";
}

export class LiveMengantarOrdersDisabledError extends Error {
  constructor() {
    super("Live Mengantar orders are disabled.");
  }
}

type LiveAccountScope = Pick<ProviderBatchScope, "credentialSource" | "outletId" | "pickupAddressId" | "tenantId">;

/**
 * The outlet's own credentials (private first, then the platform default — AGENTS.md),
 * resolved server-side inside the caller's tenant transaction, refused unless they still
 * address the account the scope was recorded with. Shared by every live Mengantar call
 * (T-280 order, T-282 pay-unpaid and reconciliation reads).
 */
export async function resolveLiveMengantarAccount(
  scope: Readonly<LiveAccountScope>,
  tx: TenantTransaction,
  context: TenantContext,
): Promise<Pick<MengantarAccountCredentials, "apiKey" | "baseUrl">> {
  if (!isLiveMengantarOrdersEnabled()) throw new LiveMengantarOrdersDisabledError();
  await assertNotDemoTenant(tx, context);
  const resolved = await resolveMengantarAccountCredentials(tx, context, scope.outletId);
  if (resolved.source !== scope.credentialSource) throw new MengantarOrderTransportUnavailableError();
  // Review F3: every gerai on the platform default shares one Mengantar account, which would
  // accept any pickup address that account owns; only the platform's own address may be used.
  if (resolved.source === "platform_default" && scope.pickupAddressId !== resolved.pickupAddressId) {
    throw new MengantarOrderTransportUnavailableError();
  }
  const credentials = { apiKey: resolved.credentials.apiKey, baseUrl: resolved.credentials.baseUrl };
  // A malformed base URL or empty key is refused here, before any claim, never as an unknown send.
  try {
    assertMengantarCredentialsUsable(credentials);
  } catch {
    throw new MengantarOrderTransportUnavailableError();
  }
  return credentials;
}

/** The account identity `validateMengantarTransportScope` expects for a scope. */
export function liveMengantarAccountIdentity(scope: Readonly<LiveAccountScope>) {
  return scope.credentialSource === "platform_default"
    ? "platform_default"
    : `managed://mengantar/${scope.tenantId}/${scope.outletId}`;
}

/**
 * The live `MengantarOrderTransportLookup`, resolved inside the batch-preparation
 * transaction. The binding's account identity is derived exactly as
 * `validateMengantarTransportScope` expects, so a scope whose credential source no
 * longer matches the outlet is refused before anything is claimed.
 */
export const resolveLiveMengantarOrderTransport: MengantarOrderTransportLookup = async (scope, tx, context) => {
  const credentials = await resolveLiveMengantarAccount(scope, tx, context);

  const binding: MengantarOrderTransportBinding = {
    accountIdentity: liveMengantarAccountIdentity(scope),
    credentialSource: scope.credentialSource,
    outletId: scope.outletId,
    pickupAddressId: scope.pickupAddressId,
    tenantId: scope.tenantId,
    transport: {
      async submit(body) {
        let answer;
        try {
          answer = await requestMengantar(credentials, "POST", "/order", { body });
        } catch {
          // Sent or not, no answer was read: never retried before reconciliation.
          throw new MengantarOrderSubmissionUnknownError("ORDER_TRANSPORT_FAILED");
        }
        return readMengantarOrderAnswer(answer, credentials.apiKey);
      },
      async reservePickupTime(request) {
        // A failure here precedes `POST /order`: no order exists, so the caller releases the claim.
        const answer = await requestMengantar(credentials, "POST", "/time", { body: request });
        if (answer.status >= 200 && answer.status < 300) return answer.body;
        const message = mengantarAnswerMessage(answer.body, credentials.apiKey);
        throw new MengantarOrderRefusedError(
          message && /invalid pickup time/i.test(message) ? "ORDER_PICKUP_SLOT_UNAVAILABLE" : "PICKUP_TIME_REFUSED",
          message,
        );
      },
    },
  };
  return binding;
};

/**
 * T-282: the live `MengantarPayUnpaidTransportLookup` — the same credential and scope
 * rules as the order resolver; `payUnpaid` = `POST /order/pay-unpaid` `{courier, batch_id}`.
 * A lost answer is unknown (never retried before reconciliation); a documented-style
 * refusal (400/403) paid nothing and is surfaced as `MengantarPayUnpaidRefusedError`.
 */
export const resolveLiveMengantarPayUnpaidTransport: MengantarPayUnpaidTransportLookup = async (scope, tx, context) => {
  const credentials = await resolveLiveMengantarAccount(scope, tx, context);
  const binding: MengantarPayUnpaidTransportBinding = {
    accountIdentity: liveMengantarAccountIdentity(scope),
    credentialSource: scope.credentialSource,
    outletId: scope.outletId,
    pickupAddressId: scope.pickupAddressId,
    tenantId: scope.tenantId,
    transport: {
      async payUnpaid(request) {
        let answer;
        try {
          answer = await requestMengantar(credentials, "POST", "/order/pay-unpaid", { body: request });
        } catch {
          throw new MengantarUnpaidRecoveryUnknownError("PAY_UNPAID_TRANSPORT_FAILED");
        }
        return readMengantarPayUnpaidAnswer(answer, credentials.apiKey);
      },
    },
  };
  return binding;
};

/**
 * T-281 (D-42): `DELETE /order` `{courier, ids: [_id]}` — what one cancellation answer means.
 * `DELETED`: Mengantar names our `_id` in `deletedOrderIds`. `SKIPPED`: a success that does not
 * name it (the docs: an order past pickup "simply skips"), so nothing was deleted. `REFUSED`: a
 * 4xx or an explicit `success: false` (the courier may refuse with a message), nothing was
 * deleted. `UNKNOWN`: no answer, a 5xx or anything unreadable — the order may or may not be gone.
 * `providerMessage` is Mengantar's short text without the key (`mengantarAnswerMessage`).
 */
export type MengantarCancelOutcome =
  | { kind: "DELETED" }
  | { kind: "SKIPPED"; providerMessage: string | null }
  | { kind: "REFUSED"; providerMessage: string | null }
  | { kind: "UNKNOWN"; safeCode: string };

export type MengantarCancelRequest = { courier: string; ids: [string] };

export function readMengantarDeleteOrderAnswer(
  answer: { status: number; body: unknown },
  providerOrderId: string,
  secret?: string,
): MengantarCancelOutcome {
  const providerMessage = mengantarAnswerMessage(answer.body, secret);
  if (answer.status >= 400 && answer.status < 500) return { kind: "REFUSED", providerMessage };
  if (answer.status < 200 || answer.status >= 300) return { kind: "UNKNOWN", safeCode: "CANCEL_HTTP_STATUS" };
  const body = answer.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return { kind: "UNKNOWN", safeCode: "CANCEL_RESPONSE_SCHEMA_UNKNOWN" };
  const record = body as { success?: unknown; deletedOrderIds?: unknown };
  if (record.success === false) return { kind: "REFUSED", providerMessage };
  if (
    record.success !== true
    || !Array.isArray(record.deletedOrderIds)
    || !record.deletedOrderIds.every((id) => typeof id === "string")
  ) {
    return { kind: "UNKNOWN", safeCode: "CANCEL_RESPONSE_SCHEMA_UNKNOWN" };
  }
  return record.deletedOrderIds.includes(providerOrderId)
    ? { kind: "DELETED" }
    : { kind: "SKIPPED", providerMessage };
}

export type MengantarCancelTransport = {
  /** The account the call goes to; the caller serializes on it (`withProviderAccountSerialization`). */
  providerAccountKey: string;
  /** Never throws for a provider answer; a lost answer is `UNKNOWN`. */
  cancel(request: Readonly<MengantarCancelRequest>): Promise<MengantarCancelOutcome>;
};

/**
 * T-281: the live cancel transport — the same credential and scope rules as the order resolver
 * (`resolveLiveMengantarAccount`), resolved inside the caller's tenant transaction.
 */
export async function resolveLiveMengantarCancelTransport(
  scope: Readonly<LiveAccountScope>,
  tx: TenantTransaction,
  context: TenantContext,
): Promise<MengantarCancelTransport> {
  const credentials = await resolveLiveMengantarAccount(scope, tx, context);
  return {
    providerAccountKey: deriveProviderAccountKey(liveMengantarAccountIdentity(scope)),
    async cancel(request) {
      let answer;
      try {
        answer = await requestMengantar(credentials, "DELETE", "/order", { body: request });
      } catch {
        return { kind: "UNKNOWN", safeCode: "CANCEL_TRANSPORT_FAILED" };
      }
      return readMengantarDeleteOrderAnswer(answer, request.ids[0], credentials.apiKey);
    },
  };
}
