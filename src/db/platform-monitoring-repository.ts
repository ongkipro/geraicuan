import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type { PlatformTransaction } from "@/db/platform-context";
import {
  platformMonitoringAuditEvent,
  platformMonitoringConnectionHealth,
  platformMonitoringEstimate,
  platformMonitoringMembership,
  platformMonitoringOutlet,
  platformMonitoringProviderBatch,
  platformMonitoringProviderOrder,
  platformMonitoringShipment,
  platformMonitoringTenant,
  platformMonitoringUnpaidRecovery,
} from "@/db/platform-views";
import { shipmentStatuses, type tenantStatuses } from "@/db/schema";
import { buildTrendBuckets } from "@/lib/analytics-range";
import type { PlatformFilters, PlatformScope, ShipmentStatus } from "@/lib/platform-monitoring-filters";

export const PLATFORM_HEALTH_THRESHOLDS = {
  queueStuckMs: 15 * 60_000,
  queueCriticalAgeMs: 60 * 60_000,
  queueCriticalCount: 20,
  unpaidAttentionAgeMs: 2 * 60 * 60_000,
  unpaidCriticalAgeMs: 24 * 60 * 60_000,
  unknownCriticalAgeMs: 30 * 60_000,
  failureAttentionShare: 0.02,
  failureCriticalShare: 0.1,
  failureRecentWindowMs: 60 * 60_000,
  failureRecentCodeCount: 5,
} as const;

export type HealthSeverity = "normal" | "perhatian" | "kritis";
export type HealthTile = {
  count: number;
  oldestMs: number | null;
  affectedTenants: number;
  severity: HealthSeverity;
};
export type PlatformHealth = {
  generatedAt: Date;
  queue: HealthTile;
  unpaid: HealthTile & { recovering: number };
  unknown: HealthTile & { batches: number; orders: number; recoveries: number };
  failures: HealthTile & { codes: { code: string; count: number }[]; share: number };
  latency: {
    p50Seconds: number | null;
    p95Seconds: number | null;
    byCourier: { courier: string; p50Seconds: number; p95Seconds: number }[];
  };
  accounts: { bucket: number; courier: string; waiting: number; oldestMs: number }[];
};
export type PlatformCounts = {
  tenants: { active: number; suspended: number; provisioning: number; archived: number; newInRange: number };
  outlets: { total: number; configured: number; privateConnections: number; platformDefault: number; incomplete: number };
  memberships: { active: number; tenantAdmins: number; operators: number; suspended: number };
  lifecycle: {
    shipments: number;
    byStatus: Record<ShipmentStatus, number>;
    batches: number;
    batchesCompleted: number;
    batchesFailed: number;
    issued: number;
    unpaid: number;
    recoveriesCompleted: number;
    estimates: number;
    unknown: number;
  };
};
export type HeadlineCounts = { created: number; issued: number; failed: number; unpaid: number };
export type TrendBucket = HeadlineCounts & { key: string; label: string };
export type TenantUsageRow = {
  tenantId: string;
  name: string;
  status: (typeof tenantStatuses)[number];
  outletTotal: number;
  outletConfigured: number;
  members: number;
  shipments: number;
  batches: number;
  issued: number;
  unpaid: number;
  failed: number;
  unknown: number;
  lastActivityAt: Date | null;
};
export type AuditRow = {
  id: string;
  createdAt: Date;
  action: string;
  outcome: "SUCCESS" | "DENIED";
  tenantId: string | null;
  tenantName: string | null;
  actorRole: string | null;
  fromStatus: string | null;
  toStatus: string | null;
};
export type TenantRow = typeof platformMonitoringTenant.$inferSelect;
export type OutletHealthRow = {
  id: string;
  name: string;
  hasPickup: boolean;
  hasOrigin: boolean;
  hasPrivateConnection: boolean;
  updatedAt: Date;
};
export type BatchRow = {
  id: string;
  courier: string;
  credentialSource: "private" | "platform_default";
  status: string;
  safeErrorCode: string | null;
  providerAccountBucket: number;
  submissionAttemptedAt: Date | null;
  completedAt: Date | null;
};

const EMPTY = sql``;
const asNumber = (value: unknown) => Number(value ?? 0);
const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_-]{0,79}$/;
function asDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function safeOperationalCode(value: unknown) {
  if (typeof value !== "string") return null;
  return SAFE_CODE_PATTERN.test(value) ? value : "REDACTED";
}

export async function readPlatformClock(tx: PlatformTransaction): Promise<Date> {
  const result = await tx.execute<{ now: Date }>(
    sql`select transaction_timestamp() as now`,
  );
  const now = asDate(result.rows[0]?.now);
  if (!now) throw new Error("Platform database clock is unavailable.");
  return now;
}

function scopeClause(alias: string, scope: PlatformScope) {
  return scope.kind === "tenant"
    ? sql`AND ${sql.raw(alias)}.tenant_id = ${scope.tenantId}::uuid`
    : EMPTY;
}
function outletClause(alias: string, outletId: string | null) {
  return outletId
    ? sql`AND ${sql.raw(alias)}.outlet_id = ${outletId}::uuid`
    : EMPTY;
}
function courierClause(alias: string, courier: string | null) {
  return courier ? sql`AND ${sql.raw(alias)}.courier = ${courier}` : EMPTY;
}

export async function readFilterOptions(tx: PlatformTransaction, scope: PlatformScope) {
  const tenants = await tx
    .select({ id: platformMonitoringTenant.id, name: platformMonitoringTenant.name, status: platformMonitoringTenant.status })
    .from(platformMonitoringTenant)
    .orderBy(asc(platformMonitoringTenant.name));
  const outlets = scope.kind === "tenant"
    ? await tx
        .select({ id: platformMonitoringOutlet.id, name: platformMonitoringOutlet.name })
        .from(platformMonitoringOutlet)
        .where(eq(platformMonitoringOutlet.tenantId, scope.tenantId))
        .orderBy(asc(platformMonitoringOutlet.name))
    : [];
  const couriers = await tx
    .selectDistinct({ courier: platformMonitoringProviderBatch.courier })
    .from(platformMonitoringProviderBatch)
    .where(scope.kind === "tenant" ? eq(platformMonitoringProviderBatch.tenantId, scope.tenantId) : undefined)
    .orderBy(asc(platformMonitoringProviderBatch.courier));
  return { tenants, outlets, couriers: couriers.map((row) => row.courier) };
}

export async function readPlatformHealth(
  tx: PlatformTransaction,
  filters: PlatformFilters,
  now: Date,
): Promise<PlatformHealth> {
  const bScope = scopeClause("b", filters.scope);
  const oScope = scopeClause("o", filters.scope);
  const rScope = scopeClause("r", filters.scope);
  const bOutlet = outletClause("b", filters.outletId);
  const bCourier = courierClause("b", filters.courier);
  const rangeStart = filters.range.startInclusive;
  const rangeEnd = filters.range.endExclusive;
  type AggregateRow = { count: string; oldest_at: Date | null; affected: string };
  const [queueResult, unpaidResult, unknownResult, failureResult, latencyResult, accountsResult] = await Promise.all([
    tx.execute<AggregateRow>(sql`
      SELECT count(*)::text AS count,
        min(coalesce(b.submission_attempted_at, b.created_at)) AS oldest_at,
        count(distinct b.tenant_id)::text AS affected
      FROM ${platformMonitoringProviderBatch} b
      WHERE b.status IN ('SUBMISSION_QUEUED', 'SUBMITTING')
        AND coalesce(b.submission_attempted_at, b.created_at) < ${new Date(now.getTime() - PLATFORM_HEALTH_THRESHOLDS.queueStuckMs)}
        ${bScope} ${bOutlet} ${bCourier}`),
    tx.execute<AggregateRow & { recovering: string }>(sql`
      SELECT count(*)::text AS count, min(o.created_at) AS oldest_at,
        count(distinct o.tenant_id)::text AS affected,
        (SELECT count(*)::text FROM ${platformMonitoringUnpaidRecovery} r
          JOIN ${platformMonitoringProviderBatch} rb ON rb.id = r.batch_id AND rb.tenant_id = r.tenant_id
          WHERE r.status IN ('PAYMENT_QUEUED', 'PAYING') ${rScope} ${outletClause("rb", filters.outletId)} ${courierClause("rb", filters.courier)}) AS recovering
      FROM ${platformMonitoringProviderOrder} o
      JOIN ${platformMonitoringProviderBatch} b ON b.id = o.batch_id AND b.tenant_id = o.tenant_id
      WHERE o.status = 'AWAITING_UPSTREAM_PAYMENT' ${oScope} ${bOutlet} ${bCourier}`),
    tx.execute<{ batches: string; orders: string; recoveries: string; oldest_at: Date | null; affected: string }>(sql`
      WITH unknowns AS (
        SELECT b.tenant_id, coalesce(b.submission_attempted_at, b.created_at) AS at
        FROM ${platformMonitoringProviderBatch} b WHERE b.status = 'SUBMISSION_UNKNOWN' ${bScope} ${bOutlet} ${bCourier}
        UNION ALL
        SELECT o.tenant_id, coalesce(o.resolved_at, o.created_at)
        FROM ${platformMonitoringProviderOrder} o JOIN ${platformMonitoringProviderBatch} b ON b.id=o.batch_id AND b.tenant_id=o.tenant_id
        WHERE o.status='SUBMISSION_UNKNOWN' ${oScope} ${bOutlet} ${bCourier}
        UNION ALL
        SELECT r.tenant_id, coalesce(r.attempted_at, r.created_at)
        FROM ${platformMonitoringUnpaidRecovery} r
        JOIN ${platformMonitoringProviderBatch} rb ON rb.id = r.batch_id AND rb.tenant_id = r.tenant_id
        WHERE r.status='PAYMENT_UNKNOWN' ${rScope} ${outletClause("rb", filters.outletId)} ${courierClause("rb", filters.courier)}
      )
      SELECT
        (SELECT count(*)::text FROM ${platformMonitoringProviderBatch} b WHERE b.status='SUBMISSION_UNKNOWN' ${bScope} ${bOutlet} ${bCourier}) AS batches,
        (SELECT count(*)::text FROM ${platformMonitoringProviderOrder} o JOIN ${platformMonitoringProviderBatch} b ON b.id=o.batch_id AND b.tenant_id=o.tenant_id WHERE o.status='SUBMISSION_UNKNOWN' ${oScope} ${bOutlet} ${bCourier}) AS orders,
        (SELECT count(*)::text FROM ${platformMonitoringUnpaidRecovery} r JOIN ${platformMonitoringProviderBatch} rb ON rb.id=r.batch_id AND rb.tenant_id=r.tenant_id WHERE r.status='PAYMENT_UNKNOWN' ${rScope} ${outletClause("rb", filters.outletId)} ${courierClause("rb", filters.courier)}) AS recoveries,
        min(at) AS oldest_at, count(distinct tenant_id)::text AS affected FROM unknowns`),
    tx.execute<{ total: string; failed: string; oldest_at: Date | null; affected: string; recent_code_peak: string; has_critical_code: boolean }>(sql`
      SELECT count(*)::text AS total,
        count(*) FILTER (WHERE b.status='FAILED')::text AS failed,
        min(b.created_at) FILTER (WHERE b.status='FAILED') AS oldest_at,
        count(distinct b.tenant_id) FILTER (WHERE b.status='FAILED')::text AS affected,
        coalesce((SELECT max(n)::text FROM (SELECT count(*) n FROM ${platformMonitoringProviderBatch} rb WHERE rb.status='FAILED' AND rb.created_at >= ${new Date(now.getTime() - PLATFORM_HEALTH_THRESHOLDS.failureRecentWindowMs)} ${scopeClause("rb", filters.scope)} ${outletClause("rb", filters.outletId)} ${courierClause("rb", filters.courier)} GROUP BY rb.safe_error_code) recent), '0') AS recent_code_peak,
        coalesce(bool_or(b.safe_error_code ~ '^(AUTH|CREDENTIAL|SCHEMA)') FILTER (WHERE b.status='FAILED'), false) AS has_critical_code
      FROM ${platformMonitoringProviderBatch} b
      WHERE b.created_at >= ${rangeStart} AND b.created_at < ${rangeEnd} ${bScope} ${bOutlet} ${bCourier}`),
    tx.execute<{ p50: string | null; p95: string | null }>(sql`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (b.completed_at-b.submission_attempted_at)))::text AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (b.completed_at-b.submission_attempted_at)))::text AS p95
      FROM ${platformMonitoringProviderBatch} b
      WHERE b.completed_at >= ${rangeStart} AND b.completed_at < ${rangeEnd}
        AND b.submission_attempted_at IS NOT NULL ${bScope} ${bOutlet} ${bCourier}`),
    tx.execute<{ bucket: string; courier: string; waiting: string; oldest_at: Date }>(sql`
      SELECT b.provider_account_bucket::text AS bucket, b.courier,
        count(*)::text AS waiting, min(coalesce(b.submission_attempted_at,b.created_at)) AS oldest_at
      FROM ${platformMonitoringProviderBatch} b
      WHERE b.status IN ('SUBMISSION_QUEUED','SUBMITTING') ${bScope} ${bOutlet} ${bCourier}
      GROUP BY b.provider_account_bucket,b.courier ORDER BY count(*) DESC,b.provider_account_bucket LIMIT 20`),
  ]);
  const queueRaw = queueResult.rows[0];
  const unpaidRaw = unpaidResult.rows[0];
  const unknownRaw = unknownResult.rows[0];
  const failureRaw = failureResult.rows[0];
  const latencyRaw = latencyResult.rows[0];
  const queueCount = asNumber(queueRaw?.count);
  const queueOldestAt = asDate(queueRaw?.oldest_at);
  const queueOldestMs = queueOldestAt ? now.getTime() - queueOldestAt.getTime() : null;
  const unpaidCount = asNumber(unpaidRaw?.count);
  const unpaidOldestAt = asDate(unpaidRaw?.oldest_at);
  const unpaidOldestMs = unpaidOldestAt ? now.getTime() - unpaidOldestAt.getTime() : null;
  const unknownCount = asNumber(unknownRaw?.batches) + asNumber(unknownRaw?.orders) + asNumber(unknownRaw?.recoveries);
  const unknownOldestAt = asDate(unknownRaw?.oldest_at);
  const unknownOldestMs = unknownOldestAt ? now.getTime() - unknownOldestAt.getTime() : null;
  const failed = asNumber(failureRaw?.failed);
  const total = asNumber(failureRaw?.total);
  const failureShare = total === 0 ? 0 : failed / total;
  const codeRows = await tx.execute<{ code: string; count: string }>(sql`
    SELECT coalesce(b.safe_error_code,'TANPA_KODE') AS code,count(*)::text AS count
    FROM ${platformMonitoringProviderBatch} b
    WHERE b.status='FAILED' AND b.created_at >= ${rangeStart} AND b.created_at < ${rangeEnd} ${bScope} ${bOutlet} ${bCourier}
    GROUP BY coalesce(b.safe_error_code,'TANPA_KODE') ORDER BY count(*) DESC,1 LIMIT 5`);
  const latencyByCourier = filters.scope.kind === "tenant"
    ? await tx.execute<{ courier: string; p50: string; p95: string }>(sql`
        SELECT b.courier,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (b.completed_at-b.submission_attempted_at)))::text AS p50,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (b.completed_at-b.submission_attempted_at)))::text AS p95
        FROM ${platformMonitoringProviderBatch} b
        WHERE b.completed_at >= ${rangeStart} AND b.completed_at < ${rangeEnd} AND b.submission_attempted_at IS NOT NULL ${bScope} ${bOutlet} ${bCourier}
        GROUP BY b.courier ORDER BY b.courier`)
    : { rows: [] };
  return {
    generatedAt: now,
    queue: {
      count: queueCount,
      oldestMs: queueOldestMs,
      affectedTenants: asNumber(queueRaw?.affected),
      severity: queueCount >= PLATFORM_HEALTH_THRESHOLDS.queueCriticalCount || (queueOldestMs ?? 0) > PLATFORM_HEALTH_THRESHOLDS.queueCriticalAgeMs ? "kritis" : queueCount > 0 ? "perhatian" : "normal",
    },
    unpaid: {
      count: unpaidCount,
      oldestMs: unpaidOldestMs,
      affectedTenants: asNumber(unpaidRaw?.affected),
      recovering: asNumber(unpaidRaw?.recovering),
      severity: (unpaidOldestMs ?? 0) > PLATFORM_HEALTH_THRESHOLDS.unpaidCriticalAgeMs ? "kritis" : (unpaidOldestMs ?? 0) > PLATFORM_HEALTH_THRESHOLDS.unpaidAttentionAgeMs ? "perhatian" : "normal",
    },
    unknown: {
      count: unknownCount,
      batches: asNumber(unknownRaw?.batches),
      orders: asNumber(unknownRaw?.orders),
      recoveries: asNumber(unknownRaw?.recoveries),
      oldestMs: unknownOldestMs,
      affectedTenants: asNumber(unknownRaw?.affected),
      severity: (unknownOldestMs ?? 0) > PLATFORM_HEALTH_THRESHOLDS.unknownCriticalAgeMs ? "kritis" : unknownCount > 0 ? "perhatian" : "normal",
    },
    failures: {
      count: failed,
      oldestMs: asDate(failureRaw?.oldest_at) ? now.getTime() - asDate(failureRaw?.oldest_at)!.getTime() : null,
      affectedTenants: asNumber(failureRaw?.affected),
      share: failureShare,
      codes: codeRows.rows.map((row) => ({ code: safeOperationalCode(row.code) ?? "TANPA_KODE", count: asNumber(row.count) })),
      severity: failureShare > PLATFORM_HEALTH_THRESHOLDS.failureCriticalShare || asNumber(failureRaw?.recent_code_peak) >= PLATFORM_HEALTH_THRESHOLDS.failureRecentCodeCount || Boolean(failureRaw?.has_critical_code) ? "kritis" : failureShare > PLATFORM_HEALTH_THRESHOLDS.failureAttentionShare ? "perhatian" : "normal",
    },
    latency: {
      p50Seconds: latencyRaw?.p50 === null || latencyRaw?.p50 === undefined ? null : Number(latencyRaw.p50),
      p95Seconds: latencyRaw?.p95 === null || latencyRaw?.p95 === undefined ? null : Number(latencyRaw.p95),
      byCourier: latencyByCourier.rows.map((row) => ({ courier: row.courier, p50Seconds: Number(row.p50), p95Seconds: Number(row.p95) })),
    },
    accounts: accountsResult.rows.map((row, index) => ({ bucket: index + 1, courier: row.courier, waiting: asNumber(row.waiting), oldestMs: Math.max(0, now.getTime() - asDate(row.oldest_at)!.getTime()) })),
  };
}

export async function readPlatformCounts(tx: PlatformTransaction, filters: PlatformFilters): Promise<PlatformCounts> {
  const sScope = scopeClause("s", filters.scope);
  const bScope = scopeClause("b", filters.scope);
  const oScope = scopeClause("o", filters.scope);
  const rScope = scopeClause("r", filters.scope);
  const tScope = filters.scope.kind === "tenant" ? sql`AND t.id=${filters.scope.tenantId}::uuid` : EMPTY;
  const outScope = scopeClause("x", filters.scope);
  const mScope = scopeClause("m", filters.scope);
  const sOutlet = outletClause("s", filters.outletId);
  const bOutlet = outletClause("b", filters.outletId);
  const oOutlet = outletClause("b", filters.outletId);
  const status = filters.status ? sql`AND s.status=${filters.status}` : EMPTY;
  const courier = courierClause("b", filters.courier);
  const start = filters.range.startInclusive;
  const end = filters.range.endExclusive;
  const result = await tx.execute<Record<string, unknown>>(sql`
    SELECT
      (SELECT count(*) FROM ${platformMonitoringTenant} t WHERE t.status='ACTIVE' ${tScope}) active_tenants,
      (SELECT count(*) FROM ${platformMonitoringTenant} t WHERE t.status='SUSPENDED' ${tScope}) suspended_tenants,
      (SELECT count(*) FROM ${platformMonitoringTenant} t WHERE t.status='PROVISIONING' ${tScope}) provisioning_tenants,
      (SELECT count(*) FROM ${platformMonitoringTenant} t WHERE t.status='ARCHIVED' ${tScope}) archived_tenants,
      (SELECT count(*) FROM ${platformMonitoringTenant} t WHERE t.created_at>=${start} AND t.created_at<${end} ${tScope}) new_tenants,
      (SELECT count(*) FROM ${platformMonitoringOutlet} x WHERE true ${outScope} ${outletClause("x", filters.outletId)}) outlets,
      (SELECT count(*) FROM ${platformMonitoringOutlet} x WHERE x.has_pickup AND x.has_origin ${outScope} ${outletClause("x", filters.outletId)}) configured_outlets,
      (SELECT count(*) FROM ${platformMonitoringConnectionHealth} c WHERE true ${scopeClause("c", filters.scope)} ${outletClause("c", filters.outletId)}) private_connections,
      (SELECT count(*) FROM ${platformMonitoringMembership} m WHERE m.status='ACTIVE' ${mScope}) active_members,
      (SELECT count(*) FROM ${platformMonitoringMembership} m WHERE m.status='ACTIVE' AND m.role='TENANT_ADMIN' ${mScope}) tenant_admins,
      (SELECT count(*) FROM ${platformMonitoringMembership} m WHERE m.status='ACTIVE' AND m.role='OPERATOR' ${mScope}) operators,
      (SELECT count(*) FROM ${platformMonitoringMembership} m WHERE m.status='SUSPENDED' ${mScope}) suspended_members,
      (SELECT count(*) FROM ${platformMonitoringShipment} s WHERE s.created_at>=${start} AND s.created_at<${end} ${sScope} ${sOutlet} ${status}) shipments,
      ${sql.join(shipmentStatuses.map((value) => sql`(SELECT count(*) FROM ${platformMonitoringShipment} s WHERE s.status=${value} AND s.created_at>=${start} AND s.created_at<${end} ${sScope} ${sOutlet}) AS ${sql.identifier(`status_${value.toLowerCase()}`)}`), sql`,`)},
      (SELECT count(*) FROM ${platformMonitoringProviderBatch} b WHERE b.created_at>=${start} AND b.created_at<${end} ${bScope} ${bOutlet} ${courier}) batches,
      (SELECT count(*) FROM ${platformMonitoringProviderBatch} b WHERE b.status='COMPLETED' AND b.created_at>=${start} AND b.created_at<${end} ${bScope} ${bOutlet} ${courier}) completed_batches,
      (SELECT count(*) FROM ${platformMonitoringProviderBatch} b WHERE b.status='FAILED' AND b.created_at>=${start} AND b.created_at<${end} ${bScope} ${bOutlet} ${courier}) failed_batches,
      (SELECT count(*) FROM ${platformMonitoringProviderOrder} o JOIN ${platformMonitoringProviderBatch} b ON b.id=o.batch_id AND b.tenant_id=o.tenant_id WHERE o.status='ISSUED' AND o.resolved_at>=${start} AND o.resolved_at<${end} ${oScope} ${oOutlet} ${courier}) issued,
      (SELECT count(*) FROM ${platformMonitoringProviderOrder} o JOIN ${platformMonitoringProviderBatch} b ON b.id=o.batch_id AND b.tenant_id=o.tenant_id WHERE o.status='AWAITING_UPSTREAM_PAYMENT' AND o.resolved_at>=${start} AND o.resolved_at<${end} ${oScope} ${oOutlet} ${courier}) unpaid,
      (SELECT count(*) FROM ${platformMonitoringUnpaidRecovery} r JOIN ${platformMonitoringProviderBatch} rb ON rb.id=r.batch_id AND rb.tenant_id=r.tenant_id WHERE r.status='COMPLETED' AND r.created_at>=${start} AND r.created_at<${end} ${rScope} ${outletClause("rb", filters.outletId)} ${courierClause("rb", filters.courier)}) recoveries,
      (SELECT count(*) FROM ${platformMonitoringEstimate} e WHERE e.created_at>=${start} AND e.created_at<${end} ${scopeClause("e", filters.scope)} ${outletClause("e", filters.outletId)}) estimates,
      (SELECT count(*) FROM ${platformMonitoringProviderBatch} b WHERE b.status='SUBMISSION_UNKNOWN' AND b.created_at>=${start} AND b.created_at<${end} ${bScope} ${bOutlet} ${courier})
        + (SELECT count(*) FROM ${platformMonitoringProviderOrder} o JOIN ${platformMonitoringProviderBatch} b ON b.id=o.batch_id AND b.tenant_id=o.tenant_id WHERE o.status='SUBMISSION_UNKNOWN' AND o.created_at>=${start} AND o.created_at<${end} ${oScope} ${oOutlet} ${courier})
        + (SELECT count(*) FROM ${platformMonitoringUnpaidRecovery} r JOIN ${platformMonitoringProviderBatch} rb ON rb.id=r.batch_id AND rb.tenant_id=r.tenant_id WHERE r.status='PAYMENT_UNKNOWN' AND r.created_at>=${start} AND r.created_at<${end} ${rScope} ${outletClause("rb", filters.outletId)} ${courierClause("rb", filters.courier)}) AS unknown
  `);
  const row = result.rows[0] ?? {};
  const outletTotal = asNumber(row.outlets);
  const privateConnections = asNumber(row.private_connections);
  const configured = asNumber(row.configured_outlets);
  const byStatus = Object.fromEntries(shipmentStatuses.map((value) => [value, asNumber(row[`status_${value.toLowerCase()}`])])) as Record<ShipmentStatus, number>;
  return {
    tenants: { active: asNumber(row.active_tenants), suspended: asNumber(row.suspended_tenants), provisioning: asNumber(row.provisioning_tenants), archived: asNumber(row.archived_tenants), newInRange: asNumber(row.new_tenants) },
    outlets: { total: outletTotal, configured, privateConnections, platformDefault: Math.max(0, outletTotal-privateConnections), incomplete: Math.max(0, outletTotal-configured) },
    memberships: { active: asNumber(row.active_members), tenantAdmins: asNumber(row.tenant_admins), operators: asNumber(row.operators), suspended: asNumber(row.suspended_members) },
    lifecycle: { shipments: asNumber(row.shipments), byStatus, batches: asNumber(row.batches), batchesCompleted: asNumber(row.completed_batches), batchesFailed: asNumber(row.failed_batches), issued: asNumber(row.issued), unpaid: asNumber(row.unpaid), recoveriesCompleted: asNumber(row.recoveries), estimates: asNumber(row.estimates), unknown: asNumber(row.unknown) },
  };
}

export async function readPreviousPeriodHeadline(tx: PlatformTransaction, filters: PlatformFilters): Promise<HeadlineCounts> {
  const span = filters.range.endExclusive.getTime()-filters.range.startInclusive.getTime();
  const previous: PlatformFilters = { ...filters, range: { ...filters.range, startInclusive: new Date(filters.range.startInclusive.getTime()-span), endExclusive: filters.range.startInclusive } };
  const counts = await readPlatformCounts(tx, previous);
  return { created: counts.lifecycle.shipments, issued: counts.lifecycle.issued, failed: counts.lifecycle.batchesFailed, unpaid: counts.lifecycle.unpaid };
}

export async function readTrend(tx: PlatformTransaction, filters: PlatformFilters): Promise<TrendBucket[]> {
  const bucket = filters.range.granularity === "harian"
    ? sql`to_char(date_trunc('day', event_at AT TIME ZONE ${filters.range.timezone}),'YYYY-MM-DD')`
    : sql`to_char(date_trunc('month', event_at AT TIME ZONE ${filters.range.timezone}),'YYYY-MM')`;
  const start=filters.range.startInclusive, end=filters.range.endExclusive;
  const rows = await tx.execute<{ key:string; created:string; issued:string; failed:string; unpaid:string }>(sql`
    WITH events AS (
      SELECT s.created_at event_at,1 created,0 issued,0 failed,0 unpaid FROM ${platformMonitoringShipment} s WHERE s.created_at>=${start} AND s.created_at<${end} ${scopeClause("s",filters.scope)} ${outletClause("s",filters.outletId)} ${filters.status?sql`AND s.status=${filters.status}`:EMPTY}
      UNION ALL SELECT o.resolved_at,0,(o.status='ISSUED')::int,0,(o.status='AWAITING_UPSTREAM_PAYMENT')::int FROM ${platformMonitoringProviderOrder} o JOIN ${platformMonitoringProviderBatch} b ON b.id=o.batch_id AND b.tenant_id=o.tenant_id WHERE o.status IN ('ISSUED','AWAITING_UPSTREAM_PAYMENT') AND o.resolved_at>=${start} AND o.resolved_at<${end} ${scopeClause("o",filters.scope)} ${outletClause("b",filters.outletId)} ${courierClause("b",filters.courier)}
      UNION ALL SELECT b.created_at,0,0,(b.status='FAILED')::int,0 FROM ${platformMonitoringProviderBatch} b WHERE b.created_at>=${start} AND b.created_at<${end} ${scopeClause("b",filters.scope)} ${outletClause("b",filters.outletId)} ${courierClause("b",filters.courier)}
    ) SELECT ${bucket} key,sum(created)::text created,sum(issued)::text issued,sum(failed)::text failed,sum(unpaid)::text unpaid FROM events GROUP BY 1 ORDER BY 1`);
  const byKey = new Map(rows.rows.map((row)=>[row.key,row]));
  return buildTrendBuckets(filters.range).map(({key,label})=>{ const row=byKey.get(key); return { key,label,created:asNumber(row?.created),issued:asNumber(row?.issued),failed:asNumber(row?.failed),unpaid:asNumber(row?.unpaid) }; });
}

export async function listTenantUsage(tx: PlatformTransaction, filters: PlatformFilters, limit: number): Promise<{rows:TenantUsageRow[];total:number}> {
  if (!Number.isInteger(limit)||limit<1||limit>100) throw new RangeError("Tenant usage limit is invalid.");
  const tenantWhere = filters.scope.kind === "tenant" ? sql`AND t.id=${filters.scope.tenantId}::uuid` : EMPTY;
  const escapedQuery = filters.query?.replace(/[\\%_]/g,"\\$&");
  const queryWhere = escapedQuery ? sql`AND t.name ILIKE ${`%${escapedQuery}%`} ESCAPE '\\'` : EMPTY;
  const count = await tx.execute<{total:string}>(sql`SELECT count(*)::text total FROM ${platformMonitoringTenant} t WHERE true ${tenantWhere} ${queryWhere}`);
  const total=asNumber(count.rows[0]?.total); if(total===0)return {rows:[],total};
  const offset=Math.min((filters.page-1)*limit,Math.floor((total-1)/limit)*limit);
  const start=filters.range.startInclusive,end=filters.range.endExclusive;
  const rows=await tx.execute<Record<string,unknown>>(sql`
    WITH os AS (SELECT x.tenant_id,count(*) total,count(*) FILTER(WHERE x.has_pickup AND x.has_origin) configured FROM ${platformMonitoringOutlet} x GROUP BY x.tenant_id),
    ms AS (SELECT m.tenant_id,count(*) FILTER(WHERE m.status='ACTIVE') members FROM ${platformMonitoringMembership} m GROUP BY m.tenant_id),
    ss AS (SELECT s.tenant_id,count(*) shipments,max(s.created_at) last_at FROM ${platformMonitoringShipment} s WHERE s.created_at>=${start} AND s.created_at<${end} ${outletClause("s",filters.outletId)} ${filters.status?sql`AND s.status=${filters.status}`:EMPTY} GROUP BY s.tenant_id),
    bs AS (SELECT b.tenant_id,count(*) batches,count(*) FILTER(WHERE b.status='FAILED') failed,count(*) FILTER(WHERE b.status='SUBMISSION_UNKNOWN') unknown,max(b.created_at) last_at FROM ${platformMonitoringProviderBatch} b WHERE b.created_at>=${start} AND b.created_at<${end} ${outletClause("b",filters.outletId)} ${courierClause("b",filters.courier)} GROUP BY b.tenant_id),
    ps AS (SELECT o.tenant_id,count(*) FILTER(WHERE o.status='ISSUED' AND o.resolved_at>=${start} AND o.resolved_at<${end}) issued,count(*) FILTER(WHERE o.status='AWAITING_UPSTREAM_PAYMENT' AND o.resolved_at>=${start} AND o.resolved_at<${end}) unpaid,count(*) FILTER(WHERE o.status='SUBMISSION_UNKNOWN' AND o.created_at>=${start} AND o.created_at<${end}) unknown,max(o.created_at) FILTER(WHERE o.created_at>=${start} AND o.created_at<${end}) last_at FROM ${platformMonitoringProviderOrder} o JOIN ${platformMonitoringProviderBatch} b ON b.id=o.batch_id AND b.tenant_id=o.tenant_id WHERE ((o.created_at>=${start} AND o.created_at<${end}) OR (o.resolved_at>=${start} AND o.resolved_at<${end})) ${outletClause("b",filters.outletId)} ${courierClause("b",filters.courier)} GROUP BY o.tenant_id),
    rs AS (SELECT r.tenant_id,count(*) FILTER(WHERE r.status='PAYMENT_UNKNOWN') unknown,max(r.created_at) last_at FROM ${platformMonitoringUnpaidRecovery} r JOIN ${platformMonitoringProviderBatch} rb ON rb.id=r.batch_id AND rb.tenant_id=r.tenant_id WHERE r.created_at>=${start} AND r.created_at<${end} ${outletClause("rb",filters.outletId)} ${courierClause("rb",filters.courier)} GROUP BY r.tenant_id)
    SELECT t.id tenant_id,t.name,t.status,coalesce(os.total,0) outlet_total,coalesce(os.configured,0) outlet_configured,coalesce(ms.members,0) members,coalesce(ss.shipments,0) shipments,coalesce(bs.batches,0) batches,coalesce(ps.issued,0) issued,coalesce(ps.unpaid,0) unpaid,coalesce(bs.failed,0) failed,coalesce(bs.unknown,0)+coalesce(ps.unknown,0)+coalesce(rs.unknown,0) unknown,greatest(ss.last_at,bs.last_at,ps.last_at,rs.last_at) last_activity_at
    FROM ${platformMonitoringTenant} t LEFT JOIN os ON os.tenant_id=t.id LEFT JOIN ms ON ms.tenant_id=t.id LEFT JOIN ss ON ss.tenant_id=t.id LEFT JOIN bs ON bs.tenant_id=t.id LEFT JOIN ps ON ps.tenant_id=t.id LEFT JOIN rs ON rs.tenant_id=t.id
    WHERE true ${tenantWhere} ${queryWhere}
    ORDER BY (coalesce(bs.failed,0)+coalesce(bs.unknown,0)+coalesce(ps.unpaid,0)+coalesce(ps.unknown,0)+coalesce(rs.unknown,0)) DESC,coalesce(ps.issued,0) DESC,t.name ASC LIMIT ${limit} OFFSET ${offset}`);
  return {total,rows:rows.rows.map((r)=>({tenantId:String(r.tenant_id),name:String(r.name),status:r.status as TenantUsageRow["status"],outletTotal:asNumber(r.outlet_total),outletConfigured:asNumber(r.outlet_configured),members:asNumber(r.members),shipments:asNumber(r.shipments),batches:asNumber(r.batches),issued:asNumber(r.issued),unpaid:asNumber(r.unpaid),failed:asNumber(r.failed),unknown:asNumber(r.unknown),lastActivityAt:asDate(r.last_activity_at)}))};
}

export async function listAuditEvents(tx:PlatformTransaction,filters:PlatformFilters,limit:number):Promise<{rows:AuditRow[];total:number}>{
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new RangeError("Audit limit is invalid.");
  const where=sql`${scopeClause("a",filters.scope)} ${filters.outcome?sql`AND a.outcome=${filters.outcome}`:EMPTY}`;
  const count=await tx.execute<{total:string}>(sql`SELECT count(*)::text total FROM ${platformMonitoringAuditEvent} a WHERE a.created_at>=${filters.range.startInclusive} AND a.created_at<${filters.range.endExclusive} ${where}`);
  const total=asNumber(count.rows[0]?.total);if(total===0)return {rows:[],total};
  const offset=Math.min((filters.page-1)*limit,Math.floor((total-1)/limit)*limit);
  const rows=await tx.execute<Record<string,unknown>>(sql`SELECT a.id,a.created_at,a.action,a.outcome,a.tenant_id,t.name tenant_name,a.actor_role,a.from_status,a.to_status FROM ${platformMonitoringAuditEvent} a LEFT JOIN ${platformMonitoringTenant} t ON t.id=a.tenant_id WHERE a.created_at>=${filters.range.startInclusive} AND a.created_at<${filters.range.endExclusive} ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT ${limit} OFFSET ${offset}`);
  return {total,rows:rows.rows.map((r)=>({id:String(r.id),createdAt:asDate(r.created_at)!,action:String(r.action),outcome:r.outcome as AuditRow["outcome"],tenantId:r.tenant_id?String(r.tenant_id):null,tenantName:r.tenant_name?String(r.tenant_name):null,actorRole:r.actor_role?String(r.actor_role):null,fromStatus:r.from_status?String(r.from_status):null,toStatus:r.to_status?String(r.to_status):null}))};
}

export async function readTenantDetail(tx:PlatformTransaction,filters:PlatformFilters):Promise<{tenant:TenantRow;outlets:OutletHealthRow[];batches:BatchRow[]}|null>{
  if(filters.scope.kind!=="tenant")return null;
  const tenant=(await tx.select().from(platformMonitoringTenant).where(eq(platformMonitoringTenant.id,filters.scope.tenantId)).limit(1))[0];if(!tenant)return null;
  const outletRows=await tx.execute<{id:string;name:string;has_pickup:boolean;has_origin:boolean;has_private:boolean;updated_at:Date}>(sql`SELECT o.id,o.name,o.has_pickup,o.has_origin,(c.outlet_id IS NOT NULL) has_private,o.updated_at FROM ${platformMonitoringOutlet} o LEFT JOIN ${platformMonitoringConnectionHealth} c ON c.outlet_id=o.id AND c.tenant_id=o.tenant_id WHERE o.tenant_id=${tenant.id} ${outletClause("o",filters.outletId)} ORDER BY o.name`);
  const batches=await tx.select({id:platformMonitoringProviderBatch.id,courier:platformMonitoringProviderBatch.courier,credentialSource:platformMonitoringProviderBatch.credentialSource,status:platformMonitoringProviderBatch.status,safeErrorCode:platformMonitoringProviderBatch.safeErrorCode,providerAccountBucket:platformMonitoringProviderBatch.providerAccountBucket,submissionAttemptedAt:platformMonitoringProviderBatch.submissionAttemptedAt,completedAt:platformMonitoringProviderBatch.completedAt}).from(platformMonitoringProviderBatch).where(and(eq(platformMonitoringProviderBatch.tenantId,tenant.id),filters.outletId?eq(platformMonitoringProviderBatch.outletId,filters.outletId):undefined,filters.courier?eq(platformMonitoringProviderBatch.courier,filters.courier):undefined,sql`${platformMonitoringProviderBatch.createdAt}>=${filters.range.startInclusive}`,sql`${platformMonitoringProviderBatch.createdAt}<${filters.range.endExclusive}`)).orderBy(sql`${platformMonitoringProviderBatch.createdAt} desc`,sql`${platformMonitoringProviderBatch.id} desc`).limit(25);
  const accountBuckets = new Map<number, number>();
  return {tenant,outlets:outletRows.rows.map(r=>({id:r.id,name:r.name,hasPickup:r.has_pickup,hasOrigin:r.has_origin,hasPrivateConnection:r.has_private,updatedAt:asDate(r.updated_at)!})),batches:batches.map((batch) => {
    let localBucket = accountBuckets.get(batch.providerAccountBucket);
    if (!localBucket) {
      localBucket = accountBuckets.size + 1;
      accountBuckets.set(batch.providerAccountBucket, localBucket);
    }
    return {
      ...batch,
      providerAccountBucket: localBucket,
      safeErrorCode: safeOperationalCode(batch.safeErrorCode),
    };
  })};
}
