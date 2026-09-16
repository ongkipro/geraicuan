import "server-only";

const WINDOW_MS = 5 * 60 * 1000;
const MAX_LOOKUPS = 30;

export class TrackingLookupRateLimitedError extends Error {
  constructor() {
    super("Tracking lookup rate limit exceeded.");
  }
}

// lazy: per-process fixed window, keyed by tenant + actor. The durable home is
// `shipment_rate_limits`, but its `operation` CHECK lists only provider-budget operations and
// PR-51 adds no migration; borrowing 'estimate' or 'location-search' would spend a provider
// budget on a pure read. Upgrade path: add a 'tracking-lookup' operation in a migration and
// swap this for the enforceEstimateRateLimit shape.
const windows = new Map<string, { count: number; startedAt: number }>();

/** Throttles the lookup itself; it reads nothing outside the tenant, so this only caps abuse. */
export function enforceTrackingLookupRateLimit(
  tenantId: string,
  userId: string,
  now = Date.now(),
) {
  for (const [key, window] of windows) {
    if (now - window.startedAt >= WINDOW_MS) windows.delete(key);
  }

  const key = `${tenantId}:${userId}`;
  const window = windows.get(key);
  if (!window || now - window.startedAt >= WINDOW_MS) {
    windows.set(key, { count: 1, startedAt: now });
    return;
  }
  if (window.count >= MAX_LOOKUPS) throw new TrackingLookupRateLimitedError();
  window.count += 1;
}
