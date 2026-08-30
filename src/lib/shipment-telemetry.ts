import "server-only";

import { randomUUID } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPAQUE_ACTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
const COURIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/;

const operations = ["estimate", "order"] as const;
const outcomes = ["success", "idempotent", "rate_limited", "unknown", "failure"] as const;
const providerStatuses = [
  "COMPLETED",
  "SUBMISSION_QUEUED",
  "SUBMISSION_UNKNOWN",
  "NOT_CALLED",
  "UNAVAILABLE",
] as const;
const retryResults = ["accepted", "rejected", "not_requested"] as const;
const queueResults = ["not_applicable", "queued", "serialized", "reused", "unknown"] as const;

export type ShipmentLifecycleEvent = Readonly<{
  event: "shipment.provider.lifecycle";
  occurredAt: string;
  severity: "INFO" | "WARN" | "ERROR";
  operation: (typeof operations)[number];
  outcome: (typeof outcomes)[number];
  tenantId: string;
  actorId: string;
  correlationId: string;
  latencyMs: number;
  safeProviderStatus: (typeof providerStatuses)[number];
  retryResult: (typeof retryResults)[number];
  queueResult: (typeof queueResults)[number];
  outletId?: string;
  credentialSource?: "private" | "platform_default";
  courier?: string;
}>;

export type ShipmentLifecycleEventInput = Omit<
  ShipmentLifecycleEvent,
  "event" | "occurredAt" | "severity" | "tenantId" | "actorId" | "correlationId" | "latencyMs"
> & {
  tenantId: string;
  actorId: string;
  correlationId: string;
  latencyMs: number;
};

export type ShipmentTelemetrySink = (event: ShipmentLifecycleEvent) => void;

function safeUuid(value: string) {
  return UUID_PATTERN.test(value) ? value.toLowerCase() : "redacted";
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function defaultSink(event: ShipmentLifecycleEvent) {
  console.info(JSON.stringify(event));
}

export function createShipmentCorrelationId() {
  return randomUUID();
}

export function emitShipmentLifecycleEvent(
  input: ShipmentLifecycleEventInput,
  sink: ShipmentTelemetrySink = defaultSink,
) {
  const operation = includes(operations, input.operation) ? input.operation : "estimate";
  const outcome = includes(outcomes, input.outcome) ? input.outcome : "failure";
  const safeProviderStatus = includes(providerStatuses, input.safeProviderStatus)
    ? input.safeProviderStatus
    : "UNAVAILABLE";
  const retryResult = includes(retryResults, input.retryResult)
    ? input.retryResult
    : "not_requested";
  const queueResult = includes(queueResults, input.queueResult)
    ? input.queueResult
    : "unknown";
  const event: ShipmentLifecycleEvent = Object.freeze({
    event: "shipment.provider.lifecycle",
    occurredAt: new Date().toISOString(),
    severity: outcome === "failure" ? "ERROR" : outcome === "rate_limited" || outcome === "unknown" ? "WARN" : "INFO",
    operation,
    outcome,
    tenantId: safeUuid(input.tenantId),
    actorId: OPAQUE_ACTOR_ID_PATTERN.test(input.actorId) ? input.actorId : "redacted",
    correlationId: safeUuid(input.correlationId),
    latencyMs: Number.isFinite(input.latencyMs) && input.latencyMs >= 0
      ? Math.min(Math.round(input.latencyMs), 3_600_000)
      : 0,
    safeProviderStatus,
    retryResult,
    queueResult,
    ...(input.outletId ? { outletId: safeUuid(input.outletId) } : {}),
    ...(input.credentialSource === "private" || input.credentialSource === "platform_default"
      ? { credentialSource: input.credentialSource }
      : {}),
    ...(input.courier && COURIER_PATTERN.test(input.courier)
      ? { courier: input.courier }
      : {}),
  });

  try {
    sink(event);
  } catch {
    // Diagnostic telemetry must never change the shipment outcome.
  }
  return event;
}
