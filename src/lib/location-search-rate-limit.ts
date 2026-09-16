import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";

import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

// PR-48 (T-154): destination-area search now auto-fires on a debounced pause
// (>=350ms) instead of only on an explicit "Cari area" click, so refining one
// query (e.g. "Dag" -> "Dago" -> "Dago Band") can burn several attempts where
// the old click-gated flow spent one. The per-session cache and empty-prefix
// suppression in `use-typeahead-search.ts` absorb most of that growth, but a
// deliberate multi-refinement search session can still roughly double the old
// attempt count within one 5-minute window — raised 20 -> 40 to cover that
// without materially loosening the budget (still resets every 5 minutes, per
// tenant+actor). Re-tune with real usage evidence if this proves too tight
// or too loose.
const MAX_LOCATION_SEARCH_ATTEMPTS = 40;
const WINDOW_MS = 5 * 60 * 1000;

export class LocationSearchRateLimitedError extends Error {
  constructor() {
    super("Location search rate limit exceeded.");
  }
}

export class LocationSearchConcurrencyError extends Error {
  constructor() {
    super("A location search is already in progress.");
  }
}

export async function enforceLocationSearchRateLimit(
  tx: TenantTransaction,
  context: TenantContext,
) {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const result = await tx.execute<{ count: number }>(sql`
    INSERT INTO shipment_rate_limits (
      tenant_id,
      actor_id,
      operation,
      count,
      last_request
    )
    VALUES (${context.tenantId}, ${context.userId}, 'location-search', 1, ${now})
    ON CONFLICT (tenant_id, actor_id, operation) DO UPDATE
    SET count = CASE
          WHEN shipment_rate_limits.last_request <= ${windowStart} THEN 1
          ELSE shipment_rate_limits.count + 1
        END,
        last_request = ${now}
    WHERE shipment_rate_limits.last_request <= ${windowStart}
       OR shipment_rate_limits.count < ${MAX_LOCATION_SEARCH_ATTEMPTS}
    RETURNING count
  `);

  if (result.rows.length !== 1) {
    throw new LocationSearchRateLimitedError();
  }
}

export async function withLocationSearchConcurrencyGuard<T>(
  pool: Pool,
  context: Pick<TenantContext, "tenantId" | "userId">,
  work: () => Promise<T>,
): Promise<T> {
  const lockKey = `mengantar-location-search:${context.tenantId}:${context.userId}`;
  const client = await pool.connect();
  let locked = false;
  let workFailed = false;
  try {
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
      [lockKey],
    );
    locked = result.rows[0]?.acquired === true;
    if (!locked) throw new LocationSearchConcurrencyError();
    return await work();
  } catch (error) {
    workFailed = true;
    throw error;
  } finally {
    let unlockError: unknown;
    try {
      if (locked) {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [lockKey],
        );
      }
    } catch (error) {
      unlockError = error;
    } finally {
      client.release();
    }
    if (unlockError && !workFailed) throw unlockError;
  }
}
