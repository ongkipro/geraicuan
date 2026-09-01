import { and, eq, gte, lt, sql } from "drizzle-orm";

import { providerOrderSnapshots } from "@/db/schema";
import type { TenantContext } from "@/db/tenant-context";

export const TENANT_OPERATIONAL_TIMEZONE = "Asia/Jakarta";

const wibDayStart = sql`date_trunc(
  'day',
  current_timestamp AT TIME ZONE ${TENANT_OPERATIONAL_TIMEZONE}
) AT TIME ZONE ${TENANT_OPERATIONAL_TIMEZONE}`;

export function issuedTodayPredicate(context: TenantContext) {
  return and(
    eq(providerOrderSnapshots.tenantId, context.tenantId),
    eq(providerOrderSnapshots.status, "ISSUED"),
    gte(providerOrderSnapshots.resolvedAt, wibDayStart),
    lt(providerOrderSnapshots.resolvedAt, sql`${wibDayStart} + interval '1 day'`),
  );
}
