import "server-only";

import { sql } from "drizzle-orm";

import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

const MAX_ORDER_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;

export class OrderRateLimitedError extends Error {
  constructor() {
    super("Order submission rate limit exceeded.");
  }
}

export async function enforceOrderRateLimit(
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
    VALUES (${context.tenantId}, ${context.userId}, 'order-submit', 1, ${now})
    ON CONFLICT (tenant_id, actor_id, operation) DO UPDATE
    SET count = CASE
          WHEN shipment_rate_limits.last_request <= ${windowStart} THEN 1
          ELSE shipment_rate_limits.count + 1
        END,
        last_request = ${now}
    WHERE shipment_rate_limits.last_request <= ${windowStart}
       OR shipment_rate_limits.count < ${MAX_ORDER_ATTEMPTS}
    RETURNING count
  `);

  if (result.rows.length !== 1) {
    throw new OrderRateLimitedError();
  }
}
