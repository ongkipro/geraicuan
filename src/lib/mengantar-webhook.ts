import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { lookupProviderDeliveryStatus, normalizeProviderDeliveryStatus } from "@/lib/provider-delivery-status";
import type { ShipmentStatus } from "@/lib/shipment-queue";

/*
 * D-30 / T-238: the Mengantar webhook contract, exactly as documented at
 * https://api-public.mengantar.com/docs/ ("Webhook", read 2026-09-26):
 *
 * - headers `x-timestamp` (milliseconds, e.g. `1787548800000`) and
 *   `x-signature`: HMAC-SHA256, hex, of `{x-timestamp}.{raw request body}`,
 *   keyed with the account's Webhook Secret, compared in constant time;
 * - "reject anything older than a few minutes" (their example: 5 minutes);
 * - body keys `cnote_no`, `order_id`, `courier`, `status_category`; no raw
 *   courier status, no history, no receiver data;
 * - answer any 2xx within 5 s; failures are retried up to 3 times.
 *
 * The receiver stays closed (404, reads nothing) unless both
 * `MENGANTAR_WEBHOOK_ENABLED=1` and `MENGANTAR_WEBHOOK_SECRET` are set.
 * Nothing here logs a payload.
 */

export const MENGANTAR_WEBHOOK_MAX_BODY_BYTES = 16_384;
export const MENGANTAR_WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;
const TIMESTAMP_PATTERN = /^\d{10,16}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SAFE_STATUS = /^[A-Za-z][A-Za-z0-9 /_()-]{0,59}$/;

export type MengantarWebhookConfig = { secret: string };

/** Null — the route answers 404 — unless the receiver is switched on *and* has a secret. */
export function mengantarWebhookConfig(environment: Record<string, string | undefined>): MengantarWebhookConfig | null {
  if (environment.MENGANTAR_WEBHOOK_ENABLED !== "1") return null;
  const secret = environment.MENGANTAR_WEBHOOK_SECRET ?? "";
  return secret.trim() ? { secret } : null;
}

/** The documented signature: hex HMAC-SHA256 of the timestamp, a dot, and the raw body bytes. */
export function mengantarWebhookSignature(secret: string, timestamp: string, rawBody: Uint8Array) {
  return createHmac("sha256", secret).update(`${timestamp}.`, "utf8").update(rawBody).digest("hex");
}

export type MengantarWebhookVerification =
  | { ok: true; eventAt: Date }
  | { ok: false; reason: "MISSING_HEADERS" | "STALE" | "BAD_SIGNATURE" };

export function verifyMengantarWebhook(input: {
  now: number;
  rawBody: Uint8Array;
  secret: string;
  signature: string | null;
  timestamp: string | null;
}): MengantarWebhookVerification {
  const { signature, timestamp } = input;
  if (!timestamp || !signature || !TIMESTAMP_PATTERN.test(timestamp) || !SIGNATURE_PATTERN.test(signature)) {
    return { ok: false, reason: "MISSING_HEADERS" };
  }
  const eventAt = Number(timestamp);
  // Older than the window is a replay; far in the future is a clock we cannot trust either.
  if (!Number.isSafeInteger(eventAt) || Math.abs(input.now - eventAt) > MENGANTAR_WEBHOOK_TOLERANCE_MS) {
    return { ok: false, reason: "STALE" };
  }
  const expected = Buffer.from(mengantarWebhookSignature(input.secret, timestamp, input.rawBody), "hex");
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }
  return { ok: true, eventAt: new Date(eventAt) };
}

export type MengantarWebhookEvent = {
  cnoteNo: string;
  eventAt: Date;
  /** `status_category` as sent, trimmed. */
  providerStatus: string;
  /** From the same vocabulary the pull uses; null when it names no state or is unknown. */
  mappedStatus: ShipmentStatus | null;
  recognised: boolean;
};

/** Only `cnote_no` and `status_category` are read; nothing else in the body is kept. */
export function parseMengantarWebhookBody(rawBody: Uint8Array, eventAt: Date): MengantarWebhookEvent | null {
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const cnoteNo = typeof record.cnote_no === "string" ? record.cnote_no.trim() : "";
  const providerStatus = typeof record.status_category === "string" ? record.status_category.trim() : "";
  if (!SAFE_IDENTIFIER.test(cnoteNo) || !SAFE_STATUS.test(providerStatus)) return null;
  const mapped = lookupProviderDeliveryStatus(normalizeProviderDeliveryStatus(providerStatus));
  return { cnoteNo, eventAt, providerStatus, mappedStatus: mapped ?? null, recognised: mapped !== undefined };
}

/** Reads at most `limit` bytes; null when the body is larger. */
export async function readBoundedBody(request: Request, limit = MENGANTAR_WEBHOOK_MAX_BODY_BYTES) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }
  return body;
}

export type MengantarWebhookRecordOutcome = string;

/**
 * The whole receiver, with its configuration, clock and database write passed
 * in so it is testable without a server. Status codes carry no body: 404 while
 * closed, 413 too large, 401 unsigned/stale/forged, 400 signed but unreadable,
 * 204 once recorded — including an AWB that is not ours, which is acknowledged
 * so Mengantar does not retry it — and 500 when the write failed, so it does.
 */
export async function handleMengantarWebhook(
  request: Request,
  deps: {
    config: MengantarWebhookConfig | null;
    now: () => number;
    record: (event: MengantarWebhookEvent) => Promise<MengantarWebhookRecordOutcome>;
  },
): Promise<Response> {
  if (!deps.config) return new Response(null, { status: 404 });
  const rawBody = await readBoundedBody(request);
  if (!rawBody) return new Response(null, { status: 413 });
  const verification = verifyMengantarWebhook({
    now: deps.now(),
    rawBody,
    secret: deps.config.secret,
    signature: request.headers.get("x-signature"),
    timestamp: request.headers.get("x-timestamp"),
  });
  if (!verification.ok) return new Response(null, { status: 401 });
  const event = parseMengantarWebhookBody(rawBody, verification.eventAt);
  if (!event) return new Response(null, { status: 400 });
  try {
    await deps.record(event);
  } catch {
    // Never log the error: a database error can echo the AWB it was given.
    console.error("[mengantar-webhook] recording failed");
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
