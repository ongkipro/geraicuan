import "server-only";

import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import {
  outlets,
  providerOrderSnapshots,
  shipmentDrafts,
  shipmentParties,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import type { AnalyticsRange } from "@/lib/analytics-range";
import { issuedTodayPredicate } from "@/db/shipment-event-predicates";
import { summarizeLatestReconciliationVariances } from "@/db/ledger-repository";

const DEFAULT_RECENT_LIMIT = 6;
const MAX_RECENT_LIMIT = 20;

export type TenantDashboardSummary = {
  actionRequired: number;
  issuedToday: number;
  readyToProgress: number;
  total: number;
};

export type TenantDashboardActionBreakdown = {
  awaitingUpstreamPayment: number;
  failed: number;
  submissionUnknown: number;
};

export type TenantDashboardWorkflowBreakdown = {
  draft: number;
  estimated: number;
  issuedToday: number;
};

export type TenantDashboardRecentShipment = {
  awb: string | null;
  destinationAreaLabel: string;
  outletName: string;
  recipientName: string;
  shipmentId: string;
  publicReference: string;
  status: (typeof shipments.$inferSelect)["status"];
  updatedAt: Date;
};

export type TenantDashboardPeriodMetrics = {
  codCount: number;
  codDeclaredValueIdr: number;
  createdCount: number;
  issuedCount: number;
  nonCodCount: number;
  nonCodDeclaredValueIdr: number;
};

export type TenantDashboardPeriodSummary = {
  current: TenantDashboardPeriodMetrics;
  generatedAt: Date;
  previous: TenantDashboardPeriodMetrics;
};

export type TenantDashboardPeriodTrendPoint = {
  codCount: number;
  key: string;
  nonCodCount: number;
};

export type TenantDashboardPeriodSupportKind =
  | "created"
  | "cod"
  | "non-cod"
  | "issued";

export type TenantDashboardPeriodSupport = {
  rows: Array<{
    isCod: boolean;
    occurredAt: Date;
    outletName: string;
    shipmentId: string;
    publicReference: string;
    status: (typeof shipments.$inferSelect)["status"];
  }>;
  totalCount: number;
};

export type TenantDashboardPeriodFilters = {
  outletId?: string;
};

type TenantDashboardMetricsBase = {
  actionRequiredBreakdown: TenantDashboardActionBreakdown;
  summary: TenantDashboardSummary;
  workflowBreakdown: TenantDashboardWorkflowBreakdown;
  generatedAt: Date;
};

export type TenantDashboardMetrics =
  | (TenantDashboardMetricsBase & {
      finance: { reconciliationVarianceCount: number };
      role: "TENANT_ADMIN";
    })
  | (TenantDashboardMetricsBase & {
      role: "OPERATOR";
    });

export type TenantDashboard = TenantDashboardMetrics & {
  recentShipments: TenantDashboardRecentShipment[];
};

function validateRecentLimit(recentLimit: number) {
  if (
    !Number.isSafeInteger(recentLimit) ||
    recentLimit < 1 ||
    recentLimit > MAX_RECENT_LIMIT
  ) {
    throw new RangeError("Tenant dashboard recent shipment limit is invalid.");
  }
}

export async function loadTenantDashboardPeriodSummary(
  tx: TenantTransaction,
  context: TenantContext,
  currentRange: AnalyticsRange,
  previousRange: AnalyticsRange,
  filters: TenantDashboardPeriodFilters = {},
): Promise<TenantDashboardPeriodSummary> {
  const [created] = await tx
    .select({
      generatedAt: sql<string>`statement_timestamp()`,
      currentCreatedCount:
        sql<number>`count(*) filter (where ${shipments.createdAt} >= ${currentRange.startInclusive} and ${shipments.createdAt} < ${currentRange.endExclusive})::int`.mapWith(Number),
      currentCodCount:
        sql<number>`count(*) filter (where ${shipments.createdAt} >= ${currentRange.startInclusive} and ${shipments.createdAt} < ${currentRange.endExclusive} and ${shipmentDrafts.isCod})::int`.mapWith(Number),
      currentNonCodCount:
        sql<number>`count(*) filter (where ${shipments.createdAt} >= ${currentRange.startInclusive} and ${shipments.createdAt} < ${currentRange.endExclusive} and not ${shipmentDrafts.isCod})::int`.mapWith(Number),
      currentCodDeclaredValueIdr:
        sql<number>`coalesce(sum(${shipmentDrafts.declaredValueIdr}) filter (where ${shipments.createdAt} >= ${currentRange.startInclusive} and ${shipments.createdAt} < ${currentRange.endExclusive} and ${shipmentDrafts.isCod}), 0)::bigint`.mapWith(Number),
      currentNonCodDeclaredValueIdr:
        sql<number>`coalesce(sum(${shipmentDrafts.declaredValueIdr}) filter (where ${shipments.createdAt} >= ${currentRange.startInclusive} and ${shipments.createdAt} < ${currentRange.endExclusive} and not ${shipmentDrafts.isCod}), 0)::bigint`.mapWith(Number),
      previousCreatedCount:
        sql<number>`count(*) filter (where ${shipments.createdAt} >= ${previousRange.startInclusive} and ${shipments.createdAt} < ${previousRange.endExclusive})::int`.mapWith(Number),
      previousCodCount:
        sql<number>`count(*) filter (where ${shipments.createdAt} >= ${previousRange.startInclusive} and ${shipments.createdAt} < ${previousRange.endExclusive} and ${shipmentDrafts.isCod})::int`.mapWith(Number),
      previousNonCodCount:
        sql<number>`count(*) filter (where ${shipments.createdAt} >= ${previousRange.startInclusive} and ${shipments.createdAt} < ${previousRange.endExclusive} and not ${shipmentDrafts.isCod})::int`.mapWith(Number),
      previousCodDeclaredValueIdr:
        sql<number>`coalesce(sum(${shipmentDrafts.declaredValueIdr}) filter (where ${shipments.createdAt} >= ${previousRange.startInclusive} and ${shipments.createdAt} < ${previousRange.endExclusive} and ${shipmentDrafts.isCod}), 0)::bigint`.mapWith(Number),
      previousNonCodDeclaredValueIdr:
        sql<number>`coalesce(sum(${shipmentDrafts.declaredValueIdr}) filter (where ${shipments.createdAt} >= ${previousRange.startInclusive} and ${shipments.createdAt} < ${previousRange.endExclusive} and not ${shipmentDrafts.isCod}), 0)::bigint`.mapWith(Number),
    })
    .from(shipments)
    .innerJoin(
      shipmentDrafts,
      and(
        eq(shipmentDrafts.shipmentId, shipments.id),
        eq(shipmentDrafts.tenantId, shipments.tenantId),
      ),
    )
    .where(
      and(
        eq(shipments.tenantId, context.tenantId),
        filters.outletId ? eq(shipments.outletId, filters.outletId) : undefined,
        gte(shipments.createdAt, previousRange.startInclusive),
        lt(shipments.createdAt, currentRange.endExclusive),
      ),
    );

  const [issued] = await tx
    .select({
      currentIssuedCount:
        sql<number>`count(*) filter (where ${providerOrderSnapshots.resolvedAt} >= ${currentRange.startInclusive} and ${providerOrderSnapshots.resolvedAt} < ${currentRange.endExclusive})::int`.mapWith(Number),
      previousIssuedCount:
        sql<number>`count(*) filter (where ${providerOrderSnapshots.resolvedAt} >= ${previousRange.startInclusive} and ${providerOrderSnapshots.resolvedAt} < ${previousRange.endExclusive})::int`.mapWith(Number),
    })
    .from(providerOrderSnapshots)
    .innerJoin(
      shipments,
      and(
        eq(shipments.id, providerOrderSnapshots.shipmentId),
        eq(shipments.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(
      and(
        eq(providerOrderSnapshots.tenantId, context.tenantId),
        filters.outletId ? eq(shipments.outletId, filters.outletId) : undefined,
        eq(providerOrderSnapshots.status, "ISSUED"),
        gte(providerOrderSnapshots.resolvedAt, previousRange.startInclusive),
        lt(providerOrderSnapshots.resolvedAt, currentRange.endExclusive),
      ),
    );

  if (!created || !issued) {
    throw new Error("Tenant dashboard period summary was not loaded.");
  }

  return {
    current: {
      codCount: created.currentCodCount,
      codDeclaredValueIdr: created.currentCodDeclaredValueIdr,
      createdCount: created.currentCreatedCount,
      issuedCount: issued.currentIssuedCount,
      nonCodCount: created.currentNonCodCount,
      nonCodDeclaredValueIdr: created.currentNonCodDeclaredValueIdr,
    },
    generatedAt: new Date(created.generatedAt),
    previous: {
      codCount: created.previousCodCount,
      codDeclaredValueIdr: created.previousCodDeclaredValueIdr,
      createdCount: created.previousCreatedCount,
      issuedCount: issued.previousIssuedCount,
      nonCodCount: created.previousNonCodCount,
      nonCodDeclaredValueIdr: created.previousNonCodDeclaredValueIdr,
    },
  };
}

export async function loadTenantDashboardPeriodTrend(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
  filters: TenantDashboardPeriodFilters = {},
): Promise<TenantDashboardPeriodTrendPoint[]> {
  const bucket = range.granularity === "harian"
    ? sql<string>`to_char(date_trunc('day', ${shipments.createdAt} AT TIME ZONE ${range.timezone}), 'YYYY-MM-DD')`
    : sql<string>`to_char(date_trunc('month', ${shipments.createdAt} AT TIME ZONE ${range.timezone}), 'YYYY-MM')`;

  return tx
    .select({
      key: bucket,
      codCount:
        sql<number>`count(*) filter (where ${shipmentDrafts.isCod})::int`.mapWith(Number),
      nonCodCount:
        sql<number>`count(*) filter (where not ${shipmentDrafts.isCod})::int`.mapWith(Number),
    })
    .from(shipments)
    .innerJoin(
      shipmentDrafts,
      and(
        eq(shipmentDrafts.shipmentId, shipments.id),
        eq(shipmentDrafts.tenantId, shipments.tenantId),
      ),
    )
    .where(
      and(
        eq(shipments.tenantId, context.tenantId),
        filters.outletId ? eq(shipments.outletId, filters.outletId) : undefined,
        gte(shipments.createdAt, range.startInclusive),
        lt(shipments.createdAt, range.endExclusive),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);
}

export async function loadTenantDashboardPeriodSupport(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
  kind: TenantDashboardPeriodSupportKind,
  filters: TenantDashboardPeriodFilters = {},
): Promise<TenantDashboardPeriodSupport> {
  const commonSelection = {
    isCod: shipmentDrafts.isCod,
    outletName: outlets.name,
    shipmentId: shipments.id,
    publicReference: shipments.publicReference,
    status: shipments.status,
    totalCount: sql<number>`count(*) over()::int`.mapWith(Number),
  };
  const rows = kind === "issued"
    ? await tx
        .select({
          ...commonSelection,
          occurredAt: providerOrderSnapshots.resolvedAt,
        })
        .from(providerOrderSnapshots)
        .innerJoin(
          shipments,
          and(
            eq(shipments.id, providerOrderSnapshots.shipmentId),
            eq(shipments.tenantId, providerOrderSnapshots.tenantId),
          ),
        )
        .innerJoin(
          shipmentDrafts,
          and(
            eq(shipmentDrafts.shipmentId, shipments.id),
            eq(shipmentDrafts.tenantId, shipments.tenantId),
          ),
        )
        .innerJoin(
          outlets,
          and(
            eq(outlets.id, shipments.outletId),
            eq(outlets.tenantId, shipments.tenantId),
          ),
        )
        .where(and(
          eq(providerOrderSnapshots.tenantId, context.tenantId),
          eq(providerOrderSnapshots.status, "ISSUED"),
          filters.outletId ? eq(shipments.outletId, filters.outletId) : undefined,
          gte(providerOrderSnapshots.resolvedAt, range.startInclusive),
          lt(providerOrderSnapshots.resolvedAt, range.endExclusive),
        ))
        .orderBy(desc(providerOrderSnapshots.resolvedAt), desc(shipments.id))
        .limit(50)
    : await tx
        .select({
          ...commonSelection,
          occurredAt: shipments.createdAt,
        })
        .from(shipments)
        .innerJoin(
          shipmentDrafts,
          and(
            eq(shipmentDrafts.shipmentId, shipments.id),
            eq(shipmentDrafts.tenantId, shipments.tenantId),
          ),
        )
        .innerJoin(
          outlets,
          and(
            eq(outlets.id, shipments.outletId),
            eq(outlets.tenantId, shipments.tenantId),
          ),
        )
        .where(and(
          eq(shipments.tenantId, context.tenantId),
          filters.outletId ? eq(shipments.outletId, filters.outletId) : undefined,
          kind === "cod" ? eq(shipmentDrafts.isCod, true) : undefined,
          kind === "non-cod" ? eq(shipmentDrafts.isCod, false) : undefined,
          gte(shipments.createdAt, range.startInclusive),
          lt(shipments.createdAt, range.endExclusive),
        ))
        .orderBy(desc(shipments.createdAt), desc(shipments.id))
        .limit(50);

  return {
    rows: rows.map((row) => {
      if (!row.occurredAt) {
        throw new Error("Tenant dashboard supporting event timestamp was not loaded.");
      }
      return {
        isCod: row.isCod,
        occurredAt: row.occurredAt,
        outletName: row.outletName,
        shipmentId: row.shipmentId,
        publicReference: row.publicReference,
        status: row.status,
      };
    }),
    totalCount: rows[0]?.totalCount ?? 0,
  };
}

export async function loadTenantDashboardMetrics(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<TenantDashboardMetrics> {
  const [counts] = await tx
    .select({
      generatedAt: sql<string>`statement_timestamp()`,
      total: sql<number>`count(*)::int`.mapWith(Number),
      draft:
        sql<number>`count(*) filter (where ${shipments.status} = 'DRAFT')::int`.mapWith(
          Number,
        ),
      estimated:
        sql<number>`count(*) filter (where ${shipments.status} = 'ESTIMATED')::int`.mapWith(
          Number,
        ),
      readyToProgress:
        sql<number>`count(*) filter (where ${shipments.status} in ('DRAFT', 'ESTIMATED'))::int`.mapWith(
          Number,
        ),
      awaitingUpstreamPayment:
        sql<number>`count(*) filter (where ${shipments.status} = 'AWAITING_UPSTREAM_PAYMENT')::int`.mapWith(
          Number,
        ),
      submissionUnknown:
        sql<number>`count(*) filter (where ${shipments.status} = 'SUBMISSION_UNKNOWN')::int`.mapWith(
          Number,
        ),
      failed:
        sql<number>`count(*) filter (where ${shipments.status} = 'FAILED')::int`.mapWith(
          Number,
        ),
    })
    .from(shipments)
    .where(eq(shipments.tenantId, context.tenantId));

  if (!counts) throw new Error("Tenant dashboard counts were not loaded.");

  const [issuedTodayRow] = await tx
    .select({
      issuedToday: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(providerOrderSnapshots)
    .where(issuedTodayPredicate(context));
  if (!issuedTodayRow) {
    throw new Error("Tenant dashboard issued-today count was not loaded.");
  }

  const actionRequiredBreakdown = {
    awaitingUpstreamPayment: counts.awaitingUpstreamPayment,
    submissionUnknown: counts.submissionUnknown,
    failed: counts.failed,
  };

  const dashboard: TenantDashboardMetricsBase = {
    actionRequiredBreakdown,
    generatedAt: new Date(counts.generatedAt),
    summary: {
      total: counts.total,
      readyToProgress: counts.readyToProgress,
      issuedToday: issuedTodayRow.issuedToday,
      // Spec 19 ACT-NEEDED; equals the ACTION_REQUIRED queue total.
      actionRequired:
        actionRequiredBreakdown.submissionUnknown +
        actionRequiredBreakdown.failed,
    },
    workflowBreakdown: {
      draft: counts.draft,
      estimated: counts.estimated,
      issuedToday: issuedTodayRow.issuedToday,
    },
  };

  if (context.role === "TENANT_ADMIN") {
    const variances = await summarizeLatestReconciliationVariances(tx, context);
    return {
      ...dashboard,
      finance: { reconciliationVarianceCount: variances.varianceCount },
      role: "TENANT_ADMIN",
    };
  }

  return { ...dashboard, role: "OPERATOR" };
}

export async function loadTenantDashboardShipments(
  tx: TenantTransaction,
  context: TenantContext,
  input: { limit?: number; mode?: "actionable" | "recent" } = {},
): Promise<TenantDashboardRecentShipment[]> {
  const limit = input.limit ?? DEFAULT_RECENT_LIMIT;
  validateRecentLimit(limit);
  const mode = input.mode ?? "recent";

  return tx
    .select({
      awb: providerOrderSnapshots.cnoteNo,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      outletName: outlets.name,
      recipientName: shipmentParties.name,
      shipmentId: shipments.id,
      publicReference: shipments.publicReference,
      status: shipments.status,
      updatedAt: shipments.updatedAt,
    })
    .from(shipments)
    .innerJoin(
      outlets,
      and(
        eq(outlets.id, shipments.outletId),
        eq(outlets.tenantId, shipments.tenantId),
      ),
    )
    .innerJoin(
      shipmentDrafts,
      and(
        eq(shipmentDrafts.shipmentId, shipments.id),
        eq(shipmentDrafts.tenantId, shipments.tenantId),
      ),
    )
    .innerJoin(
      shipmentParties,
      and(
        eq(shipmentParties.shipmentId, shipments.id),
        eq(shipmentParties.tenantId, shipments.tenantId),
        eq(shipmentParties.role, "RECIPIENT"),
      ),
    )
    .leftJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .where(
      and(
        eq(shipments.tenantId, context.tenantId),
        mode === "actionable"
          ? inArray(shipments.status, [
              "DRAFT",
              "ESTIMATED",
              "AWAITING_UPSTREAM_PAYMENT",
              "SUBMISSION_UNKNOWN",
              "FAILED",
            ])
          : undefined,
      ),
    )
    .orderBy(
      sql`case when ${shipments.status} in ('AWAITING_UPSTREAM_PAYMENT', 'SUBMISSION_UNKNOWN', 'FAILED') then 0 else 1 end`,
      desc(shipments.updatedAt),
      desc(shipments.id),
    )
    .limit(limit);
}

export async function loadTenantDashboard(
  tx: TenantTransaction,
  context: TenantContext,
  input: { recentLimit?: number } = {},
): Promise<TenantDashboard> {
  const metrics = await loadTenantDashboardMetrics(tx, context);
  const recentShipments = await loadTenantDashboardShipments(tx, context, {
    limit: input.recentLimit ?? DEFAULT_RECENT_LIMIT,
  });
  return { ...metrics, recentShipments };
}
