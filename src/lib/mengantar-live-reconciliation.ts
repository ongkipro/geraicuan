import "server-only";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { deriveProviderAccountKey } from "@/db/order-batch-repository";
import * as schema from "@/db/schema";
import {
  listKnownProviderOrderIds,
  loadShipmentReconciliationFacts,
  loadShipmentReconciliationTarget,
  ShipmentReconciliationUnavailableError,
  type ShipmentReconciliationFacts,
} from "@/db/shipment-reconciliation-repository";
import { withTenantContext } from "@/db/tenant-context";
import { mengantarDocumentedOrderCourier } from "@/lib/mengantar-couriers";
import { requestMengantar, type MengantarHttpAnswer } from "@/lib/mengantar-http";
import { liveMengantarAccountIdentity, resolveLiveMengantarAccount } from "@/lib/mengantar-live-transport";
import { MengantarOrderTransportUnavailableError, normalizeMengantarProviderIdentifier } from "@/lib/mengantar-order";
import { toBillableWeightKg } from "@/lib/shipment-draft";
import {
  ShipmentReconciliationUndeterminedError,
  type ShipmentReconciliationLookup,
  type ShipmentReconciliationLookupResult,
} from "@/lib/shipment-reconciliation";

/**
 * T-282 (D-43): live reconciliation of a SUBMISSION_UNKNOWN shipment. The `POST /order`
 * answer was lost, so no order id is known and the request carried no unique marker.
 * Mengantar's stored orders (`GET /order`, read-only) around the submission time are
 * matched on everything that was sent; only a single exact match, or a proven absence,
 * changes state. Recipient data is compared here and never returned, logged or thrown.
 */
export const RECONCILIATION_WINDOW_BEFORE_MS = 10 * 60_000;
export const RECONCILIATION_WINDOW_AFTER_MS = 60 * 60_000;
/** D-43: an order absent this long after the attempt was not created. */
export const RECONCILIATION_FAILED_AFTER_MS = 30 * 60_000;
export const RECONCILIATION_PAGE_SIZE = 50;
export const RECONCILIATION_MAX_PAGES = 10;

type StoredRecord = Record<string, unknown>;

export type ReconciliationWindow = { start: Date; end: Date };

/**
 * The national subscriber number: digits only, a leading 62 or 0 removed — the most forgiving
 * comparison, the same as `shipment-draft-repository`'s `'^(62|0)'` rule (review F4), so "0812…",
 * "62812…", "+62 812…" and a bare "812…" are one phone.
 */
export function normalizeRecipientPhone(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/\D/g, "").replace(/^(62|0)/, "");
  return digits || null;
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();
  return normalized || null;
}

function numeric(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return null;
}

/**
 * Stored orders carry no area `_id` (`receiver_area` is on 1 of 100 contract records, and a
 * code, not the id): the area is matched by name against the stored label, which is
 * "SUBDISTRICT, DISTRICT, CITY, PROVINCE, ZIP" (`normalizeMengantarDestinationAreaOptions`).
 */
function sameArea(areaLabel: string, record: StoredRecord) {
  const parts = [record.RECEIVER_SUBDISTRICT, record.RECEIVER_DISTRICT, record.RECEIVER_CITY, record.RECEIVER_REGION]
    .map(normalizeName);
  if (parts.some((part) => part === null)) return false;
  const expected = parts.join(", ");
  const label = normalizeName(areaLabel);
  return label === expected || Boolean(label?.startsWith(`${expected}, `));
}

/** The order sends exact kg; a stored billable whole kg (T-283 watch item) is accepted too. */
function sameWeight(weightGrams: number, value: unknown) {
  const stored = numeric(value);
  if (stored === null) return false;
  if (Math.abs(stored - weightGrams / 1000) < 1e-6) return true;
  try {
    return stored === toBillableWeightKg(weightGrams);
  } catch {
    return false;
  }
}

function sameAmount(facts: ShipmentReconciliationFacts, record: StoredRecord) {
  return facts.isCod
    ? facts.providerCodAmountIdr !== null && numeric(record.COD_AMOUNT) === facts.providerCodAmountIdr
    : numeric(record.GOODS_AMOUNT) === facts.declaredValueIdr;
}

function createdInWindow(record: StoredRecord, window: ReconciliationWindow) {
  if (typeof record.createdAt !== "string") return false;
  const createdAt = Date.parse(record.createdAt);
  return Number.isFinite(createdAt) && createdAt >= window.start.getTime() && createdAt <= window.end.getTime();
}

function orderId(record: StoredRecord) {
  return typeof record._id === "string" ? record._id.trim() : null;
}

export type StoredOrderClassification =
  | { kind: "MATCH"; record: StoredRecord }
  | { kind: "NONE" }
  | { kind: "AMBIGUOUS" };

/**
 * D-43. MATCH: exactly one stored order equals everything that was sent (recipient phone,
 * name, area, weight, COD amount or goods value), was created in the window and is not
 * deleted. NONE: not one stored order to the recipient's phone at all (deleted ones count).
 * Anything else, or a listing cut off by the page bound, is AMBIGUOUS. Orders another
 * shipment of this tenant already owns are left out first.
 */
export function classifyMengantarStoredOrders(input: {
  complete: boolean;
  facts: ShipmentReconciliationFacts;
  knownOrderIds: ReadonlySet<string>;
  records: readonly StoredRecord[];
  window: ReconciliationWindow;
}): StoredOrderClassification {
  const phone = normalizeRecipientPhone(input.facts.recipientPhone);
  const name = normalizeName(input.facts.recipientName);
  if (!phone || !name || !input.complete) return { kind: "AMBIGUOUS" };
  const samePhone = input.records.filter((record) => {
    const id = orderId(record);
    return !(id && input.knownOrderIds.has(id)) && normalizeRecipientPhone(record.RECEIVER_PHONE) === phone;
  });
  const exact = samePhone.filter((record) =>
    record.isDeleted !== true
    && normalizeName(record.RECEIVER_NAME) === name
    && sameArea(input.facts.destinationAreaLabel, record)
    && sameWeight(input.facts.weightGrams, record.WEIGHT)
    && sameAmount(input.facts, record)
    && createdInWindow(record, input.window));
  if (exact.length === 1) return { kind: "MATCH", record: exact[0]! };
  if (samePhone.length === 0) return { kind: "NONE" };
  return { kind: "AMBIGUOUS" };
}

function isSuccess(answer: MengantarHttpAnswer) {
  return answer.status >= 200 && answer.status < 300;
}

/** Bounded paging; a failed or unreadable page leaves the outcome undetermined. */
async function readPages(
  credentials: Parameters<typeof requestMengantar>[0],
  path: "/order" | "/batch",
  query: Record<string, string>,
) {
  const records: StoredRecord[] = [];
  for (let page = 1; page <= RECONCILIATION_MAX_PAGES; page += 1) {
    let answer: MengantarHttpAnswer;
    try {
      answer = await requestMengantar(credentials, "GET", path, {
        query: { ...query, page: String(page), size: String(RECONCILIATION_PAGE_SIZE) },
      });
    } catch {
      throw new ShipmentReconciliationUndeterminedError();
    }
    const body = answer.body as { success?: unknown; data?: unknown } | undefined;
    if (
      !isSuccess(answer)
      || !body
      || body.success !== true
      || !Array.isArray(body.data)
      || body.data.length > RECONCILIATION_PAGE_SIZE
    ) {
      throw new ShipmentReconciliationUndeterminedError();
    }
    for (const item of body.data) {
      if (item && typeof item === "object" && !Array.isArray(item)) records.push(item as StoredRecord);
    }
    // Review F3: a short page is not proof the listing ended (the page size may be capped);
    // only the answer's own `total` is, and without it the listing is never complete.
    const total = (body as { total?: unknown }).total;
    if (typeof total === "number" && Number.isSafeInteger(total) && records.length >= total) {
      return { complete: records.length === total, records };
    }
    if (body.data.length === 0) return { complete: false, records };
  }
  return { complete: false, records };
}

function safeIdentifier(value: unknown) {
  try {
    return normalizeMengantarProviderIdentifier(value, "RECONCILIATION_IDENTIFIER_UNSAFE");
  } catch {
    return null;
  }
}

/**
 * T-227 #3: `pay-unpaid` takes the batch `_id`. A stored order carries the readable `batch`
 * code ("260904105T3QKW"), so the `_id` comes from `GET /batch`: the one batch whose `id` is
 * that code and whose `orderData` lists this order. A `batch_id` on the order itself (not
 * documented for Get orders) is taken as is.
 */
async function resolveBatchObjectId(
  credentials: Parameters<typeof requestMengantar>[0],
  record: StoredRecord,
  query: Record<string, string>,
) {
  const direct = safeIdentifier(record.batch_id);
  if (direct) return direct;
  const code = safeIdentifier(record.batch);
  const orderCode = safeIdentifier(record.ORDER_ID);
  if (!code) return null;
  let listing;
  try {
    listing = await readPages(credentials, "/batch", query);
  } catch {
    return null;
  }
  const matches = listing.records.filter((batch) =>
    batch.id === code
    && Array.isArray(batch.orderData)
    && batch.orderData.some((entry) => (entry as { orderId?: unknown } | null)?.orderId === orderCode));
  if (matches.length !== 1) return null;
  return safeIdentifier(matches[0]!._id);
}

export type LiveReconciliationInput = {
  db: NodePgDatabase<typeof schema>;
  principalId: string;
  tenantId: string;
  now?: () => Date;
};

export function createLiveMengantarReconciliationLookup(input: LiveReconciliationInput): ShipmentReconciliationLookup {
  return async (key) => {
    const { credentials, facts } = await withTenantContext(input.db, input.principalId, input.tenantId, async (tx, context) => {
      const target = await loadShipmentReconciliationTarget(tx, context, key.shipmentId);
      if (target.batchId !== key.batchId || target.providerAccountKey !== key.providerAccountKey) {
        throw new ShipmentReconciliationUnavailableError();
      }
      // The same credential and scope rules as the order resolver, and the same account.
      const resolved = await resolveLiveMengantarAccount(key, tx, context);
      if (deriveProviderAccountKey(liveMengantarAccountIdentity(key)) !== key.providerAccountKey) {
        throw new MengantarOrderTransportUnavailableError();
      }
      return { credentials: resolved, facts: await loadShipmentReconciliationFacts(tx, context, target) };
    });

    const courier = mengantarDocumentedOrderCourier(key.courier);
    if (!courier) throw new ShipmentReconciliationUnavailableError();
    const attemptedAt = facts.submissionAttemptedAt.getTime();
    const window = {
      start: new Date(attemptedAt - RECONCILIATION_WINDOW_BEFORE_MS),
      end: new Date(attemptedAt + RECONCILIATION_WINDOW_AFTER_MS),
    };
    const query = {
      courier,
      dateRange: JSON.stringify({ startDate: window.start.toISOString(), endDate: window.end.toISOString() }),
    };
    const listing = await readPages(credentials, "/order", query);
    const ids = listing.records.map(orderId).filter((id): id is string => Boolean(id));
    const knownOrderIds = await withTenantContext(input.db, input.principalId, input.tenantId, (tx, context) =>
      listKnownProviderOrderIds(tx, context, ids));
    const classification = classifyMengantarStoredOrders({ ...listing, facts, knownOrderIds, window });

    const undetermined: ShipmentReconciliationLookupResult = {
      ...key, cnoteNo: null, isPaid: null, providerOrderId: null, status: "UNDETERMINED",
    };
    if (classification.kind === "AMBIGUOUS") return undetermined;
    // Review F5 (D-43 amended): an absence does not yet prove non-creation — whether `dateRange`
    // filters on `createdAt` and how Mengantar stores the phone are unproven (T-285) — and a
    // false FAILED lets the order be created and paid twice. Absence stays undetermined.
    // lazy: return FAILED after RECONCILIATION_FAILED_AFTER_MS once T-285 records both facts.
    if (classification.kind === "NONE") return undetermined;
    // Review F1: on the shared platform account a stored order may be another gerai's (RLS
    // hides its snapshot from this tenant), so a match is never applied there.
    if (key.credentialSource === "platform_default") return undetermined;

    const { record } = classification;
    const cnoteNo = typeof record.cnote_no === "string" && record.cnote_no.trim() ? record.cnote_no : null;
    const providerError = typeof record.status === "string" && record.status.trim().toLowerCase() === "error";
    let status: "AWAITING_UPSTREAM_PAYMENT" | "ISSUED";
    if (!providerError && cnoteNo && typeof record.isPaid === "boolean") {
      status = "ISSUED";
    } else if (!providerError && !cnoteNo && record.isPaid === false && !facts.isCod) {
      status = "AWAITING_UPSTREAM_PAYMENT";
    } else {
      return undetermined;
    }
    const providerBatchId = await resolveBatchObjectId(credentials, record, query);
    // An unpaid order without its batch `_id` could never be paid from here: leave it unknown.
    if (status === "AWAITING_UPSTREAM_PAYMENT" && !providerBatchId) return undetermined;
    return {
      ...key,
      cnoteNo,
      isPaid: record.isPaid,
      providerBatchId,
      providerOrderId: record._id,
      status,
    };
  };
}
