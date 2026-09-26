import "server-only";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import {
  claimProviderBatch,
  completeProviderBatch,
  completeProviderOrder,
  deriveProviderAccountKey,
  markProviderBatchUnknown,
  prepareProviderBatches,
  type OrderConfirmation,
  type PreparedProviderBatch,
  type ProviderBatchScope,
  type ProviderOrderResult,
  type ProviderOrderSource,
} from "@/db/order-batch-repository";
import * as schema from "@/db/schema";
import {
  withTenantContext,
  type TenantContext,
  type TenantTransaction,
} from "@/db/tenant-context";
import {
  OrderRateLimitedError,
  enforceOrderRateLimit,
} from "@/lib/order-rate-limit";
import {
  mengantarCourierOfService,
  mengantarDocumentedOrderCourier,
  mengantarOrderableService,
} from "@/lib/mengantar-couriers";
import { checkPickupSchedule } from "@/lib/shipment-draft-logic";
import { toBillableWeightKg } from "@/lib/shipment-draft";
import {
  createShipmentCorrelationId,
  emitShipmentLifecycleEvent,
  type ShipmentTelemetrySink,
} from "@/lib/shipment-telemetry";

/**
 * D-26 (T-237): the documented `POST {BASE_URL}/api/public/{API_KEY}/order` body
 * (api-public.mengantar.com/docs, "Create Order", read 2026-09-26; Content-Type
 * application/json). Every key below is spelled as the docs' body table and
 * example spell it — evidence D in spec 05 DATA-13, not yet L: no documented-shape
 * order has been accepted live (T-153; `scripts/probe-mengantar-order-documented.mjs`
 * is the one owner-approved probe, not yet run).
 *
 * Deliberately not sent: `assignee` (optional, no GeraiCUAN concept), `dropShipper`
 * (needs a saved Mengantar dropshipper; D-30 keeps masking on our label only),
 * `customProducts`, `dontIncludeSubdistrict`, and insurance and a service code,
 * which the documented body has no key for.
 */
export type MengantarOrderPickup =
  | { type: "dropOff"; address_id: string }
  | {
      type: "scheduledPickup";
      address_id: string;
      /** From `POST /time` — only a live call returns one. */
      time_id: string;
      volume: "volumeMotor" | "volumeMobil" | "volumeTruck";
    };

export type MengantarOrderItem = {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  /** The area `_id` from `/address/search` (TD-16). */
  customerAddressDataId: string;
  parcelContent: string;
  /** "Total weight in kg": the stored grams ÷ 1000, exact. */
  weight: number;
  quantity: number;
  /** "Required for non-COD orders"; never sent with `COD`. */
  goodsValue?: number;
  /**
   * "COD value = Goods Value + Shipping Fee + COD Fee (required if goodsValue is
   * empty)": the recorded COD total — formula version 2 for COD, version 3
   * (ongkir + biaya COD, goods 0; D-28) for COD Ongkir.
   */
  COD?: number;
  deliveryInstruction?: string;
  destinationMark?: string;
  isDangerousGoods: boolean;
  /** "Cargo service flag": set only for a `…Cargo` service key. */
  cargo?: true;
};

export type MengantarOrderRequest = {
  courier: string;
  pickup: MengantarOrderPickup;
  orders: MengantarOrderItem[];
};

/**
 * D-27: the documented `POST /time` body — `{address_id, date, time}` with `date`
 * "mm-dd-yyyy" and `time` one of "9:00, 10:00, …, 18:00"; "pickup schedule must
 * be at least 90 minutes from current time" (docs, Add Time). Its response
 * `data._id` is the `time_id` of a scheduled pickup.
 */
export type MengantarPickupTimeRequest = {
  address_id: string;
  date: string;
  time: string;
};

export type MengantarOrderTransport = {
  submit(body: Readonly<MengantarOrderRequest>): Promise<unknown>;
  /**
   * `POST /time`. Absent on every transport that cannot reserve a slot — no live
   * one exists (T-153) — so a scheduled pickup is refused before anything is
   * claimed.
   */
  reservePickupTime?(request: Readonly<MengantarPickupTimeRequest>): Promise<unknown>;
};

export type MengantarTransportScopeBinding = {
  tenantId: string;
  outletId: string;
  pickupAddressId: string;
  credentialSource: ProviderBatchScope["credentialSource"];
  /** Stable non-secret identity; never an API key or other credential value. */
  accountIdentity: string;
  transport: unknown;
};

export type MengantarOrderTransportBinding = Omit<
  MengantarTransportScopeBinding,
  "transport"
> & {
  transport: MengantarOrderTransport;
};
export type MengantarOrderTransportLookup = (
  scope: Readonly<ProviderBatchScope>,
  tx: TenantTransaction,
  context: TenantContext,
) => Promise<MengantarOrderTransportBinding>;

export type FixtureOrderOrchestrationInput = {
  db: NodePgDatabase<typeof schema>;
  lockPool: Pool;
  principalId: string;
  tenantId: string;
  confirmations: readonly OrderConfirmation[];
  prepareConfirmations?: (
    tx: TenantTransaction,
    context: TenantContext,
    confirmations: readonly OrderConfirmation[],
  ) => Promise<void>;
  resolveTransport: MengantarOrderTransportLookup;
  telemetrySink?: ShipmentTelemetrySink;
  /** Backoff between HTTP 409 retries; injectable so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Clock for the D-27 pickup-slot re-check; injectable for tests. */
  now?: () => Date;
};

export type FixtureOrderOrchestrationResult = {
  batches: Array<{
    id: string;
    created: boolean;
    submitted: boolean;
    status: "SUBMISSION_QUEUED" | "SUBMISSION_UNKNOWN" | "COMPLETED";
    /**
     * Set when `buildMengantarOrderRequest` refused an order in this batch
     * before anything was claimed or sent. The batch stays queued and
     * resumable (see `submitPreparedBatch`); the caller surfaces this code to
     * the operator instead of crashing the confirmation.
     */
    payloadRejectionCode?: string;
  }>;
};

export class MengantarOrderSubmissionUnknownError extends Error {
  readonly safeCode: string;

  constructor(safeCode: string) {
    super("Mengantar order submission outcome is unknown.");
    this.safeCode = safeCode;
  }
}

export class MengantarOrderTransportUnavailableError extends Error {
  constructor() {
    super("Mengantar order transport is unavailable.");
  }
}

/**
 * HTTP 409 from `POST /order`: another order creation is in progress on the
 * same Mengantar account ("Sedang ada proses pembuatan order…"). The provider
 * refused the request, so it is safe to retry (DATA-13, T-223).
 */
export class MengantarOrderConflictError extends Error {
  constructor() {
    super("Mengantar is creating another order on this account.");
  }
}

export const ORDER_CONFLICT_MAX_ATTEMPTS = 3;
const ORDER_CONFLICT_BACKOFF_MS = 500;

/** The one place an HTTP transport turns a `POST /order` response into a body. */
export async function readMengantarOrderHttpResponse(response: Response): Promise<unknown> {
  if (response.status === 409) throw new MengantarOrderConflictError();
  if (!response.ok) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_HTTP_STATUS");
  }
  try {
    return await response.json();
  } catch {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_SCHEMA_UNKNOWN");
  }
}

async function submitWithConflictRetry(
  submit: () => Promise<unknown>,
  sleep: (ms: number) => Promise<void>,
) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await submit();
    } catch (error) {
      if (!(error instanceof MengantarOrderConflictError)) throw error;
      // A final 409 still means nothing was created, but the batch is already
      // claimed, so it takes the existing SUBMISSION_UNKNOWN path (never accepted).
      if (attempt >= ORDER_CONFLICT_MAX_ATTEMPTS) {
        throw new MengantarOrderSubmissionUnknownError("ORDER_PROVIDER_CONFLICT");
      }
      await sleep(ORDER_CONFLICT_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type ValidatedTransportBinding = {
  providerAccountKey: string;
  transport: MengantarOrderTransport;
};

function batchScopeKey(scope: ProviderBatchScope) {
  return JSON.stringify([
    scope.tenantId,
    scope.outletId,
    scope.pickupAddressId,
    scope.courier,
    scope.credentialSource,
  ]);
}

export function validateMengantarTransportScope(
  scope: Readonly<ProviderBatchScope>,
  value: unknown,
): { providerAccountKey: string; transport: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MengantarOrderTransportUnavailableError();
  }
  const binding = value as Partial<MengantarTransportScopeBinding>;
  const expectedAccountIdentity = scope.credentialSource === "platform_default"
    ? "platform_default"
    : `managed://mengantar/${scope.tenantId}/${scope.outletId}`;
  if (
    binding.tenantId !== scope.tenantId
    || binding.outletId !== scope.outletId
    || binding.pickupAddressId !== scope.pickupAddressId
    || binding.credentialSource !== scope.credentialSource
    || binding.accountIdentity !== expectedAccountIdentity
    || !binding.transport
  ) {
    throw new MengantarOrderTransportUnavailableError();
  }
  return {
    providerAccountKey: deriveProviderAccountKey(expectedAccountIdentity),
    transport: binding.transport,
  };
}

function validateTransportBinding(
  scope: Readonly<ProviderBatchScope>,
  value: unknown,
): ValidatedTransportBinding {
  const binding = validateMengantarTransportScope(scope, value);
  if (
    typeof binding.transport !== "object"
    || typeof (binding.transport as Partial<MengantarOrderTransport>).submit !== "function"
  ) {
    throw new MengantarOrderTransportUnavailableError();
  }
  return binding as ValidatedTransportBinding;
}

export class MengantarOrderPayloadError extends Error {
  readonly safeCode: string;

  constructor(safeCode: string) {
    super("Mengantar order payload is not submittable.");
    this.safeCode = safeCode;
  }
}

const PICKUP_VOLUMES = {
  MOBIL: "volumeMobil",
  MOTOR: "volumeMotor",
  TRUK: "volumeTruck",
} as const;

/**
 * The documented `courier` and whether the service is the courier's cargo
 * service. The body has no service key: a courier's own key (`JNE`, `SAP`…) is
 * its regular service and `<courier>Cargo` sets the documented `cargo` flag. Any
 * other variant (`SAPLite`) has no documented way to be ordered, and a courier the
 * docs do not list (spx, paxel, or a removed courier such as Ninja — D-29) has no documented
 * `courier` value: both are refused before anything is claimed.
 */
function documentedCourierAndCargo(order: ProviderOrderSource) {
  const courier = mengantarCourierOfService(order.providerService);
  const documented = courier ? mengantarDocumentedOrderCourier(courier) : null;
  if (!courier || !documented || courier.toLowerCase() !== order.courier.trim().toLowerCase()) {
    throw new MengantarOrderPayloadError("ORDER_COURIER_UNDOCUMENTED");
  }
  // One rule with Cek tarif's "Belum bisa dipesan" (T-242).
  const orderable = mengantarOrderableService(order.providerService);
  if (!orderable) throw new MengantarOrderPayloadError("ORDER_SERVICE_UNDOCUMENTED");
  return { cargo: orderable.cargo, courier: orderable.documented };
}

/**
 * D-26: one documented `POST /order` body for one stored shipment, built from the
 * draft, the party snapshots and the recorded COD total. Refuses (nothing claimed,
 * nothing sent) instead of guessing:
 * - COD with no positive recorded total (`ORDER_COD_AMOUNT_MISSING`);
 * - an area never re-verified (`ORDER_DESTINATION_AREA_UNVERIFIED`);
 * - weight outside the stored range (`ORDER_WEIGHT_UNCONVERTIBLE`);
 * - an undocumented courier or service (`ORDER_COURIER_UNDOCUMENTED` — spx and
 *   paxel are quoted by the estimate but absent from the documented `courier`
 *   list; `ORDER_SERVICE_UNDOCUMENTED` — SAPLite);
 * - dangerous goods on a cargo service (`ORDER_CARGO_DANGEROUS_GOODS`);
 * - a scheduled pickup without a `POST /time` id (`ORDER_PICKUP_TIME_UNAVAILABLE`)
 *   or without a vehicle, which the docs require as `volume`
 *   (`ORDER_PICKUP_VOLUME_MISSING`).
 * A draft with no recorded handover (pre-T-211) is sent as `dropOff`, the type
 * that needs neither a slot nor a vehicle. // lazy: ask the operator instead if a
 * pre-T-211 draft is ever issued live.
 */
export function buildMengantarOrderRequest(
  order: ProviderOrderSource,
  options: { pickupTimeId?: string | null } = {},
): MengantarOrderRequest {
  // A COD order with no COD total would ship goods and collect nothing.
  if (
    order.isCod
    && (order.providerCodAmountIdr === null || order.providerCodAmountIdr <= 0)
  ) {
    throw new MengantarOrderPayloadError("ORDER_COD_AMOUNT_MISSING");
  }
  // A stored area id is a provider identifier that can be renamed or retired
  // between saving a contact and issuing its shipment.
  if (!order.destinationAreaVerifiedAt) {
    throw new MengantarOrderPayloadError("ORDER_DESTINATION_AREA_UNVERIFIED");
  }
  try {
    // The stored-range check only; the documented unit is exact kilograms.
    toBillableWeightKg(order.weightGrams);
  } catch {
    throw new MengantarOrderPayloadError("ORDER_WEIGHT_UNCONVERTIBLE");
  }
  const { cargo, courier } = documentedCourierAndCargo(order);
  // Docs (Create Order): "Dangerous goods cannot be combined with cargo service".
  if (cargo && order.isHazardous) {
    throw new MengantarOrderPayloadError("ORDER_CARGO_DANGEROUS_GOODS");
  }

  let pickup: MengantarOrderPickup;
  if (order.handoverType === "PICKUP") {
    const timeId = options.pickupTimeId?.trim();
    if (!timeId) throw new MengantarOrderPayloadError("ORDER_PICKUP_TIME_UNAVAILABLE");
    if (!order.pickupVehicle) throw new MengantarOrderPayloadError("ORDER_PICKUP_VOLUME_MISSING");
    pickup = {
      type: "scheduledPickup",
      address_id: order.pickupAddressId,
      time_id: timeId,
      volume: PICKUP_VOLUMES[order.pickupVehicle],
    };
  } else {
    pickup = { type: "dropOff", address_id: order.pickupAddressId };
  }

  const item: MengantarOrderItem = {
    customerName: order.recipientName,
    customerPhone: order.recipientPhone,
    customerAddress: order.recipientAddress,
    customerAddressDataId: order.destinationAreaId,
    parcelContent: order.packageContent,
    weight: order.weightGrams / 1000,
    quantity: order.quantity,
    ...(order.isCod
      ? { COD: order.providerCodAmountIdr! }
      : { goodsValue: order.declaredValueIdr }),
    ...(order.shippingInstruction ? { deliveryInstruction: order.shippingInstruction } : {}),
    ...(order.recipientAddressLandmark ? { destinationMark: order.recipientAddressLandmark } : {}),
    isDangerousGoods: order.isHazardous,
    ...(cargo ? { cargo: true as const } : {}),
  };
  return { courier, pickup, orders: [item] };
}

/**
 * D-27: the `POST /time` request for a scheduled pickup, from the stored WIB date
 * and slot. The slot is re-checked at send time with the same rule the form uses
 * (09:00–17:00 starts, ≥ 90 minutes ahead, date inside the window), so a legacy
 * "08:00" draft or a slot that has passed is refused
 * (`ORDER_PICKUP_SLOT_UNAVAILABLE`) and re-picked on a new shipment.
 */
export function mengantarPickupTimeRequest(
  order: Pick<ProviderOrderSource, "pickupAddressId" | "pickupDate" | "pickupSlot">,
  now: Date,
): MengantarPickupTimeRequest {
  const { pickupDate, pickupSlot } = order;
  if (!pickupDate || !pickupSlot || checkPickupSchedule(pickupDate, pickupSlot, now) !== null) {
    throw new MengantarOrderPayloadError("ORDER_PICKUP_SLOT_UNAVAILABLE");
  }
  const [year, month, day] = pickupDate.split("-");
  return {
    address_id: order.pickupAddressId,
    date: `${month}-${day}-${year}`,
    // The docs list "9:00", not "09:00".
    time: `${Number(pickupSlot.slice(0, 2))}:00`,
  };
}

/** The `time_id` in a documented `POST /time` response, checked against the request. */
export function normalizeMengantarPickupTimeResponse(
  response: unknown,
  request: Readonly<MengantarPickupTimeRequest>,
) {
  const envelope = response as { success?: unknown; data?: unknown } | null;
  const data = envelope?.data as { _id?: unknown; time?: unknown; address?: { _id?: unknown } } | undefined;
  if (!envelope || envelope.success !== true || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new MengantarOrderSubmissionUnknownError("PICKUP_TIME_RESPONSE_SCHEMA_UNKNOWN");
  }
  const timeId = normalizeMengantarProviderIdentifier(data._id, "PICKUP_TIME_RESPONSE_SCHEMA_UNKNOWN");
  const echoedTime = typeof data.time === "string" ? data.time.replace(/^0/, "") : null;
  if (
    echoedTime !== request.time
    || (data.address?._id !== undefined && data.address._id !== request.address_id)
  ) {
    throw new MengantarOrderSubmissionUnknownError("PICKUP_TIME_CORRELATION_UNKNOWN");
  }
  return timeId;
}

/** Stands in for the `time_id` while a batch is only being validated, before any claim. */
const PICKUP_TIME_NOT_YET_RESERVED = "time-not-yet-reserved";

type ProviderResponseItem = {
  _id?: unknown;
  ORDER_ID?: unknown;
  id?: unknown;
  order_id?: unknown;
  batch?: unknown;
  batch_id?: unknown;
  isPaid?: unknown;
  cnote_no?: unknown;
};

type NormalizedProviderResponseItem = Omit<ProviderOrderResult, "shipmentId">;

const SAFE_PROVIDER_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;

export function normalizeMengantarProviderIdentifier(
  value: unknown,
  safeCode: string,
) {
  if (typeof value !== "string") {
    throw new MengantarOrderSubmissionUnknownError(safeCode);
  }
  const normalized = value.trim();
  if (!SAFE_PROVIDER_IDENTIFIER.test(normalized)) {
    throw new MengantarOrderSubmissionUnknownError(safeCode);
  }
  return normalized;
}

function optionalIdentity(value: unknown) {
  if (value === undefined || value === null) return null;
  return normalizeMengantarProviderIdentifier(
    value,
    "ORDER_RESPONSE_IDENTIFIER_UNSAFE",
  );
}

/**
 * D-26: where a `POST /order` response carries `batch_id`. The documented example
 * carries `batch` ("26013014BBQFMM", a readable code) and `batch_id`
 * ("697c58034fa61abe7c700da6", an object id) both at the top level and inside
 * each `data[]` item. `pay-unpaid` documents `batch_id` with an object-id example
 * ("6332f5b98c3ea4bc8e15f72d"), so `batch_id` is what is stored as
 * `provider_batch_id`; `batch` alone (the pre-docs assumption of T-223) is not.
 */
export function mengantarBatchIdLocation(response: unknown): "both" | "envelope" | "item" | "none" {
  if (!response || typeof response !== "object" || Array.isArray(response)) return "none";
  const envelope = response as { batch_id?: unknown; data?: unknown };
  const first = Array.isArray(envelope.data) ? envelope.data[0] as { batch_id?: unknown } | undefined : undefined;
  const inItem = first !== null && typeof first === "object" && first.batch_id !== undefined && first.batch_id !== null;
  const inEnvelope = envelope.batch_id !== undefined && envelope.batch_id !== null;
  return inItem ? inEnvelope ? "both" : "item" : inEnvelope ? "envelope" : "none";
}

function sameOrAbsent(left: string | null, right: string | null) {
  return left === null || right === null || left === right;
}

function normalizeResponseItem(
  value: unknown,
  envelopeBatch: { batch: string | null; batchId: string | null },
): NormalizedProviderResponseItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_SCHEMA_UNKNOWN");
  }
  const item = value as ProviderResponseItem;
  if (typeof item.isPaid !== "boolean") {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_SCHEMA_UNKNOWN");
  }
  const cnoteNo = item.cnote_no === null
    ? null
    : normalizeMengantarProviderIdentifier(
        item.cnote_no,
        "ORDER_RESPONSE_CNOTE_UNSAFE",
      );
  // D-26: the documented item carries `_id` and `ORDER_ID` (D, and L on stored
  // records); the `order_id`/`id` pair is the older assumed shape, kept as a fallback.
  const mongoId = optionalIdentity(item._id);
  const orderCode = optionalIdentity(item.ORDER_ID);
  const legacyId = optionalIdentity(item.order_id);
  const alternateId = optionalIdentity(item.id);
  const providerOrderId = mongoId ?? orderCode ?? legacyId ?? alternateId;
  if (
    !providerOrderId
    || (legacyId && alternateId && alternateId !== legacyId)
    || (mongoId && alternateId && alternateId !== mongoId && alternateId !== legacyId)
  ) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_IDENTITY_AMBIGUOUS");
  }
  // `batch` and `batch_id` are two different identifiers of one batch; each must
  // agree between the item and the envelope when both carry it.
  const batch = optionalIdentity(item.batch);
  const batchId = optionalIdentity(item.batch_id);
  if (!sameOrAbsent(batch, envelopeBatch.batch) || !sameOrAbsent(batchId, envelopeBatch.batchId)) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_IDENTITY_AMBIGUOUS");
  }
  return {
    providerOrderId,
    providerBatchId: batchId ?? envelopeBatch.batchId,
    isPaid: item.isPaid,
    cnoteNo,
  };
}

export function normalizeMengantarOrderResponse(
  response: unknown,
  expectedOrders: readonly ProviderOrderSource[],
): ProviderOrderResult[] {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_SCHEMA_UNKNOWN");
  }
  const envelope = response as {
    batch?: unknown;
    batch_id?: unknown;
    data?: unknown;
    success?: unknown;
  };
  if (envelope.success !== true || !Array.isArray(envelope.data)) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_SCHEMA_UNKNOWN");
  }
  if (envelope.data.length !== expectedOrders.length) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_CARDINALITY_MISMATCH");
  }
  const envelopeBatch = {
    batch: optionalIdentity(envelope.batch),
    batchId: optionalIdentity(envelope.batch_id),
  };
  const normalized = envelope.data.map((item) => normalizeResponseItem(item, envelopeBatch));
  if (
    new Set(normalized.map((item) => item.providerOrderId)).size !== normalized.length
  ) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_IDENTITY_AMBIGUOUS");
  }
  if (expectedOrders.length !== 1) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_CORRELATION_UNKNOWN");
  }
  return [{ shipmentId: expectedOrders[0]!.shipmentId, ...normalized[0]! }];
}

export async function withProviderAccountSerialization<T>(
  pool: Pool,
  providerAccountKey: string,
  work: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let locked = false;
  let workFailed = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [providerAccountKey]);
    locked = true;
    return await work();
  } catch (error) {
    workFailed = true;
    throw error;
  } finally {
    let unlockError: unknown;
    try {
      if (locked) {
        await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [providerAccountKey]);
      }
    } catch (error) {
      unlockError = error;
    } finally {
      client.release();
    }
    if (unlockError && !workFailed) throw unlockError;
  }
}

async function markUnknown(
  input: FixtureOrderOrchestrationInput,
  batchId: string,
  safeCode: string,
) {
  await withTenantContext(input.db, input.principalId, input.tenantId, (tx, context) =>
    markProviderBatchUnknown(tx, context, batchId, safeCode),
  );
}

async function submitPreparedBatch(
  input: FixtureOrderOrchestrationInput,
  batch: PreparedProviderBatch,
  transport: MengantarOrderTransport,
) {
  // Build every payload before claiming the batch. A payload guard rejecting an
  // order means nothing was sent, so the batch must stay queued and resumable
  // rather than land in SUBMISSION_UNKNOWN, which would block reconciliation.
  // This must not throw past the caller: one unsubmittable batch (e.g. an
  // old draft whose destination was never re-verified) must not abort the
  // batches that follow it in the same confirmation run.
  const now = (input.now ?? (() => new Date()))();
  let payloads: {
    order: PreparedProviderBatch["orders"][number];
    pickupTime: MengantarPickupTimeRequest | null;
  }[];
  try {
    payloads = batch.orders.map((order) => {
      let pickupTime: MengantarPickupTimeRequest | null = null;
      if (order.handoverType === "PICKUP") {
        if (!transport.reservePickupTime) {
          throw new MengantarOrderPayloadError("ORDER_PICKUP_TIME_UNAVAILABLE");
        }
        pickupTime = mengantarPickupTimeRequest(order, now);
      }
      // Validation only: the real `time_id` is reserved after the claim.
      buildMengantarOrderRequest(order, {
        pickupTimeId: pickupTime ? PICKUP_TIME_NOT_YET_RESERVED : null,
      });
      return { order, pickupTime };
    });
  } catch (error) {
    if (error instanceof MengantarOrderPayloadError) {
      return {
        id: batch.id,
        created: batch.created,
        submitted: false,
        status: "SUBMISSION_QUEUED",
        payloadRejectionCode: error.safeCode,
      } as const;
    }
    throw error;
  }

  const claimed = await withTenantContext(
    input.db,
    input.principalId,
    input.tenantId,
    (tx, context) => claimProviderBatch(tx, context, batch.id),
  );
  if (!claimed) {
    return {
      id: batch.id,
      created: batch.created,
      submitted: false,
      status: batch.status === "COMPLETED"
        ? "COMPLETED"
        : batch.status === "SUBMISSION_UNKNOWN"
          ? "SUBMISSION_UNKNOWN"
          : "SUBMISSION_QUEUED",
    } as const;
  }

  try {
    for (const { order, pickupTime } of payloads) {
      // DATA-13: Mengantar answers 409 to concurrent creation on one account for
      // every courier, not only the dynamic-AWB ones, so every submission is
      // serialized per account and a 409 is retried inside the lock.
      const response = await withProviderAccountSerialization(
        input.lockPool,
        batch.providerAccountKey,
        async () => {
          const pickupTimeId = pickupTime
            ? normalizeMengantarPickupTimeResponse(
                await transport.reservePickupTime!(Object.freeze({ ...pickupTime })),
                pickupTime,
              )
            : null;
          const payload = buildMengantarOrderRequest(order, { pickupTimeId });
          return submitWithConflictRetry(
            () => transport.submit(payload),
            input.sleep ?? defaultSleep,
          );
        },
      );
      const [result] = normalizeMengantarOrderResponse(response, [order]);
      await withTenantContext(input.db, input.principalId, input.tenantId, (tx, context) =>
        completeProviderOrder(tx, context, batch.id, result!),
      );
    }
    await withTenantContext(input.db, input.principalId, input.tenantId, (tx, context) =>
      completeProviderBatch(tx, context, batch.id),
    );
    return {
      id: batch.id,
      created: batch.created,
      submitted: true,
      status: "COMPLETED",
    } as const;
  } catch (error) {
    const safeCode = error instanceof MengantarOrderSubmissionUnknownError
      ? error.safeCode
      : "ORDER_SUBMISSION_OUTCOME_UNKNOWN";
    await markUnknown(input, batch.id, safeCode);
    return {
      id: batch.id,
      created: batch.created,
      submitted: true,
      status: "SUBMISSION_UNKNOWN",
    } as const;
  }
}

export async function orchestrateFixtureBackedMengantarOrders(
  input: FixtureOrderOrchestrationInput,
): Promise<FixtureOrderOrchestrationResult> {
  const startedAt = Date.now();
  const correlationId = createShipmentCorrelationId();
  const verifiedContext = await withTenantContext(
    input.db,
    input.principalId,
    input.tenantId,
    async (tx, context) => {
      try {
        await enforceOrderRateLimit(tx, context);
      } catch (error) {
        if (error instanceof OrderRateLimitedError) {
          emitShipmentLifecycleEvent({
            operation: "order",
            outcome: "rate_limited",
            tenantId: context.tenantId,
            actorId: context.userId,
            correlationId,
            latencyMs: Date.now() - startedAt,
            safeProviderStatus: "NOT_CALLED",
            retryResult: "rejected",
            queueResult: "not_applicable",
          }, input.telemetrySink);
        }
        throw error;
      }
      return { tenantId: context.tenantId, actorId: context.userId };
    },
  );

  const transportBindings = new Map<string, ValidatedTransportBinding>();
  let prepared: PreparedProviderBatch[];
  try {
    prepared = await withTenantContext(
      input.db,
      input.principalId,
      input.tenantId,
      async (tx, context) => {
        await input.prepareConfirmations?.(tx, context, input.confirmations);
        return prepareProviderBatches(
          tx,
          context,
          input.confirmations,
          async (scope) => {
            const immutableScope = Object.freeze({ ...scope });
            let resolved: unknown;
            try {
              resolved = await input.resolveTransport(
                immutableScope,
                tx,
                context,
              );
            } catch {
              throw new MengantarOrderTransportUnavailableError();
            }
            const binding = validateTransportBinding(immutableScope, resolved);
            transportBindings.set(batchScopeKey(immutableScope), binding);
            return binding.providerAccountKey;
          },
        );
      },
    );
  } catch (error) {
    emitShipmentLifecycleEvent({
      operation: "order",
      outcome: "failure",
      tenantId: verifiedContext.tenantId,
      actorId: verifiedContext.actorId,
      correlationId,
      latencyMs: Date.now() - startedAt,
      safeProviderStatus: "NOT_CALLED",
      retryResult: "accepted",
      queueResult: "not_applicable",
    }, input.telemetrySink);
    throw error;
  }

  const batches: FixtureOrderOrchestrationResult["batches"] = [];
  for (const batch of prepared) {
    let result: FixtureOrderOrchestrationResult["batches"][number];
    if (batch.orders.length === 0) {
      result = {
        id: batch.id,
        created: false,
        submitted: false,
        status: batch.status === "COMPLETED"
          ? "COMPLETED"
          : batch.status === "SUBMISSION_UNKNOWN"
            ? "SUBMISSION_UNKNOWN"
            : "SUBMISSION_QUEUED",
      };
    } else {
      const binding = transportBindings.get(batchScopeKey(batch));
      if (!binding || binding.providerAccountKey !== batch.providerAccountKey) {
        throw new MengantarOrderTransportUnavailableError();
      }
      result = await submitPreparedBatch(input, batch, binding.transport);
    }
    batches.push(result);
    emitShipmentLifecycleEvent({
      operation: "order",
      outcome: result.payloadRejectionCode
        ? "failure"
        : result.status === "COMPLETED"
          ? result.submitted ? "success" : "idempotent"
          : result.status === "SUBMISSION_UNKNOWN"
            ? "unknown"
            : "idempotent",
      tenantId: verifiedContext.tenantId,
      actorId: verifiedContext.actorId,
      correlationId,
      latencyMs: Date.now() - startedAt,
      outletId: batch.outletId,
      credentialSource: batch.credentialSource,
      courier: batch.courier,
      safeProviderStatus: result.payloadRejectionCode ? "NOT_CALLED" : result.status,
      retryResult: result.payloadRejectionCode ? "rejected" : "accepted",
      queueResult: result.payloadRejectionCode
        ? "not_applicable"
        : result.submitted
          ? "serialized"
          : "reused",
    }, input.telemetrySink);
  }
  return { batches };
}
