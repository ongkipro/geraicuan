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
  requiresProviderAccountSerialization,
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
  createShipmentCorrelationId,
  emitShipmentLifecycleEvent,
  type ShipmentTelemetrySink,
} from "@/lib/shipment-telemetry";

export type MengantarOrderRequest = {
  pickup_address_id: string;
  sender_name: string;
  sender_phone: string;
  sender_address: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  destination_id: string;
  courier: string;
  service: string;
  weight: number;
  quantity: number;
  item_name: string;
  goods_value: number;
  is_cod: boolean;
  cod_amount: number;
};

export type MengantarOrderTransport = {
  submit(orders: readonly MengantarOrderRequest[]): Promise<unknown>;
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
};

export type FixtureOrderOrchestrationResult = {
  batches: Array<{
    id: string;
    created: boolean;
    submitted: boolean;
    status: "SUBMISSION_QUEUED" | "SUBMISSION_UNKNOWN" | "COMPLETED";
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

export function buildMengantarOrderPayload(
  orders: readonly ProviderOrderSource[],
): MengantarOrderRequest[] {
  return orders.map((order) => ({
    pickup_address_id: order.pickupAddressId,
    sender_name: order.senderName,
    sender_phone: order.senderPhone,
    sender_address: order.senderAddress,
    receiver_name: order.recipientName,
    receiver_phone: order.recipientPhone,
    receiver_address: order.recipientAddress,
    destination_id: order.destinationAreaId,
    courier: order.courier,
    service: order.providerService,
    weight: order.weightGrams / 1_000,
    quantity: order.quantity,
    item_name: order.packageContent,
    goods_value: order.declaredValueIdr,
    is_cod: order.isCod,
    cod_amount: order.providerCodAmountIdr ?? 0,
  }));
}

type ProviderResponseItem = {
  id?: unknown;
  order_id?: unknown;
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

function normalizeResponseItem(value: unknown): NormalizedProviderResponseItem {
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
  const providerOrderId = optionalIdentity(item.order_id);
  const alternateId = optionalIdentity(item.id);
  if (!providerOrderId || (alternateId && alternateId !== providerOrderId)) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_IDENTITY_AMBIGUOUS");
  }
  return { providerOrderId, isPaid: item.isPaid, cnoteNo };
}

export function normalizeMengantarOrderResponse(
  response: unknown,
  expectedOrders: readonly ProviderOrderSource[],
): ProviderOrderResult[] {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_SCHEMA_UNKNOWN");
  }
  const envelope = response as { data?: unknown; success?: unknown };
  if (envelope.success !== true || !Array.isArray(envelope.data)) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_SCHEMA_UNKNOWN");
  }
  if (envelope.data.length !== expectedOrders.length) {
    throw new MengantarOrderSubmissionUnknownError("ORDER_RESPONSE_CARDINALITY_MISMATCH");
  }
  const normalized = envelope.data.map(normalizeResponseItem);
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
    for (const order of batch.orders) {
      const payload = buildMengantarOrderPayload([order]);
      const submit = () => transport.submit(payload);
      const response = requiresProviderAccountSerialization(batch.courier)
        ? await withProviderAccountSerialization(
            input.lockPool,
            batch.providerAccountKey,
            submit,
          )
        : await submit();
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
      outcome: result.status === "COMPLETED"
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
      safeProviderStatus: result.status,
      retryResult: "accepted",
      queueResult: result.submitted
        ? requiresProviderAccountSerialization(batch.courier) ? "serialized" : "queued"
        : "reused",
    }, input.telemetrySink);
  }
  return { batches };
}
