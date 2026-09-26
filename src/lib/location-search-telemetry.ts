import "server-only";

/**
 * T-245 (spec 16): one allowlisted JSON line per destination-area lookup, so latency is measured
 * rather than guessed. It carries durations, an outcome, counts and the query *length* only —
 * never the query text, an area label, a credential, or anything typed about a recipient.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPAQUE_ACTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

const operations = ["provider_search", "provider_validate", "provider_resolve", "wilayah_search"] as const;
const outcomes = [
  "success",
  "empty",
  "invalid_query",
  "rate_limited",
  "busy",
  "stale_authority",
  "unavailable",
  "ambiguous",
] as const;

export type LocationSearchOperation = (typeof operations)[number];
export type LocationSearchOutcome = (typeof outcomes)[number];

export type LocationSearchTimingEvent = Readonly<{
  event: "location.search.timing";
  occurredAt: string;
  operation: LocationSearchOperation;
  outcome: LocationSearchOutcome;
  tenantId: string;
  actorId: string;
  totalMs: number;
  /** Time inside the Mengantar request (and its lock), absent when the provider was not called. */
  providerMs?: number;
  providerCalls: number;
  resultCount: number;
  queryLength: number;
}>;

export type LocationSearchTimingInput = Omit<LocationSearchTimingEvent, "event" | "occurredAt">;
export type LocationSearchTimingSink = (event: LocationSearchTimingEvent) => void;

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function boundedInteger(value: unknown, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(Math.round(value), max)
    : 0;
}

function defaultSink(event: LocationSearchTimingEvent) {
  console.info(JSON.stringify(event));
}

export function emitLocationSearchTiming(
  input: LocationSearchTimingInput,
  sink: LocationSearchTimingSink = defaultSink,
) {
  const event: LocationSearchTimingEvent = Object.freeze({
    event: "location.search.timing",
    occurredAt: new Date().toISOString(),
    operation: includes(operations, input.operation) ? input.operation : "provider_search",
    outcome: includes(outcomes, input.outcome) ? input.outcome : "unavailable",
    tenantId: typeof input.tenantId === "string" && UUID_PATTERN.test(input.tenantId)
      ? input.tenantId.toLowerCase()
      : "redacted",
    actorId: typeof input.actorId === "string" && OPAQUE_ACTOR_ID_PATTERN.test(input.actorId)
      ? input.actorId
      : "redacted",
    totalMs: boundedInteger(input.totalMs, 600_000),
    ...(input.providerMs === undefined ? {} : { providerMs: boundedInteger(input.providerMs, 600_000) }),
    providerCalls: boundedInteger(input.providerCalls, 10),
    resultCount: boundedInteger(input.resultCount, 1_000),
    queryLength: boundedInteger(input.queryLength, 1_000),
  });
  try {
    sink(event);
  } catch {
    // Diagnostic telemetry must never change the search outcome.
  }
  return event;
}
