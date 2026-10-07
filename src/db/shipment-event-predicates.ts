import "server-only";

import { and, eq, gte, lt, sql } from "drizzle-orm";

import { providerOrderSnapshots } from "@/db/schema";
import type { TenantContext } from "@/db/tenant-context";
import {
  PROVIDER_DELIVERY_STATUS_MAP,
  PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP,
} from "@/lib/provider-delivery-status";

export const TENANT_OPERATIONAL_TIMEZONE = "Asia/Jakarta";

/** The start of today's WIB day, on the transaction's clock (`current_timestamp`). */
export const wibDayStart = sql`date_trunc(
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

/** The normalized provider values that themselves mean CANCELLED (both vocabularies). */
const PROVIDER_CANCEL_VALUES = [
  ...Object.entries(PROVIDER_DELIVERY_STATUS_MAP),
  ...Object.entries(PROVIDER_DELIVERY_STATUS_UNVERIFIED_MAP),
].flatMap(([value, mapped]) => (mapped === "CANCELLED" ? [value] : []));

/**
 * T-290 round-3 (c): whether an observation row (by table name or alias) may be the "latest
 * provider status". A refused **inferred** cancel — a pull read a deleted Mengantar record as a
 * cancel while the shipment was already past pickup (`decideInferredCancel`) — is stored with
 * the deleted record's stale raw status, so as "latest" it could show an older status than the
 * one before it. It is recognised as REFUSED + mapped CANCELLED whose own raw value does not mean
 * CANCELLED (every other observation's mapped status follows from its raw value). Such rows stay
 * stored as evidence; latest-status readers skip them. A provider value that itself says
 * CANCELED is never skipped.
 */
export function latestProviderStatusCandidate(table: string) {
  const row = sql.identifier(table);
  return sql`NOT coalesce(
    ${row}.transition_outcome = 'REFUSED'
    AND ${row}.mapped_status = 'CANCELLED'
    AND regexp_replace(upper(btrim(${row}.provider_status)), '\\s+', ' ', 'g')
      NOT IN (${sql.join(PROVIDER_CANCEL_VALUES.map((value) => sql`${value}`), sql`, `)}),
    false
  )`;
}
