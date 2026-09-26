import "server-only";

import { and, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";

import {
  ledgerEntries,
  outlets,
  providerBatches,
  providerOrderSnapshots,
  shipmentDrafts,
  shipmentParties,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import type { AnalyticsRange } from "@/lib/analytics-range";
import { paymentMethodOf, type PaymentMethod } from "@/lib/payment-method";
import { issuedTodayPredicate } from "@/db/shipment-event-predicates";
import { summarizeLatestReconciliationVariances } from "@/db/ledger-repository";
import {
  loadProviderDeliveryStatusBasis,
  type ProviderDeliveryStatusBasis,
} from "@/db/provider-settlement-repository";
import { RTS_STATUSES } from "@/db/rts-repository";

const DEFAULT_RECENT_LIMIT = 6;
/** Statuses the dashboard's `actionable` read returns: every shipment with a next step. */
export const TENANT_DASHBOARD_ACTIONABLE_STATUSES = [
  "DRAFT",
  "ESTIMATED",
  "AWAITING_UPSTREAM_PAYMENT",
  "SUBMISSION_UNKNOWN",
  "FAILED",
] as const;
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
  createdCount: number;
  issuedCount: number;
  nonCodCount: number;
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
    occurredAt: Date;
    outletName: string;
    shipmentId: string;
    /** T-190: COD Ongkir is its own method here, though SHP-COD still counts it as COD. */
    paymentMethod: PaymentMethod;
    publicReference: string;
    status: (typeof shipments.$inferSelect)["status"];
  }>;
  totalCount: number;
};

export type TenantDashboardPeriodFilters = {
  outletId?: string;
};

/** One outcome row of the period cohort, split on the SHP-COD basis. */
export type TenantDashboardOutcomeCounts = {
  codCount: number;
  nonCodCount: number;
  totalCount: number;
};

export type TenantDashboardOutcomeSummary = {
  /** PR-57: what the surface says about where these outcomes came from and how far behind they may be. */
  basis: ProviderDeliveryStatusBasis;
  cohortCount: number;
  delivered: TenantDashboardOutcomeCounts;
  failed: TenantDashboardOutcomeCounts;
  generatedAt: Date;
  /** The cohort minus the three settled outcomes, so the table sums to what it names. */
  inProgress: TenantDashboardOutcomeCounts;
  returned: TenantDashboardOutcomeCounts;
};

export type TenantDashboardCourierRecapRow = {
  courier: string;
  deliveredCount: number;
  returnedCount: number;
  shipmentCount: number;
  /** null for OPERATOR: ledger money is a Tenant Admin capability. */
  shippingCostIdr: number | null;
};

export type TenantDashboardCourierRecap = {
  generatedAt: Date;
  rows: TenantDashboardCourierRecapRow[];
  shippingCostVisible: boolean;
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
      previousCreatedCount:
        sql<number>`count(*) filter (where ${shipments.createdAt} >= ${previousRange.startInclusive} and ${shipments.createdAt} < ${previousRange.endExclusive})::int`.mapWith(Number),
      previousCodCount:
        sql<number>`count(*) filter (where ${shipments.createdAt} >= ${previousRange.startInclusive} and ${shipments.createdAt} < ${previousRange.endExclusive} and ${shipmentDrafts.isCod})::int`.mapWith(Number),
      previousNonCodCount:
        sql<number>`count(*) filter (where ${shipments.createdAt} >= ${previousRange.startInclusive} and ${shipments.createdAt} < ${previousRange.endExclusive} and not ${shipmentDrafts.isCod})::int`.mapWith(Number),
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
      createdCount: created.currentCreatedCount,
      issuedCount: issued.currentIssuedCount,
      nonCodCount: created.currentNonCodCount,
    },
    generatedAt: new Date(created.generatedAt),
    previous: {
      codCount: created.previousCodCount,
      createdCount: created.previousCreatedCount,
      issuedCount: issued.previousIssuedCount,
      nonCodCount: created.previousNonCodCount,
    },
  };
}

/**
 * Spec 19 SHP-OUTCOME-DELIVERED / -RETURNED / -FAILED.
 *
 * The cohort is exactly the one SHP-CREATED already uses on this dashboard:
 * tenant-scoped shipments (optionally one outlet) whose `created_at` falls in
 * the WIB period, joined to their draft so the COD split uses the same
 * `shipment_drafts.is_cod` flag as SHP-COD. The outcome itself is the current
 * lifecycle status — no transition timestamp exists, so this reads as "of the
 * shipments created in this period, where do they stand now", and every caption
 * on the surface says so.
 */
export async function loadTenantDashboardOutcomeSummary(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
  filters: TenantDashboardPeriodFilters = {},
): Promise<TenantDashboardOutcomeSummary> {
  const returned = inArray(shipments.status, [...RTS_STATUSES]);
  const delivered = eq(shipments.status, "DELIVERED");
  // T-238 (owner): a cancelled shipment counts as "Gagal" — not delivered, not returned.
  const failed = inArray(shipments.status, ["FAILED", "CANCELLED"]);
  const count = (predicate: SQL, cod?: boolean) =>
    sql<number>`count(*) filter (where ${predicate}${
      cod === undefined
        ? sql``
        : cod
          ? sql` and ${shipmentDrafts.isCod}`
          : sql` and not ${shipmentDrafts.isCod}`
    })::int`.mapWith(Number);

  const [row] = await tx
    .select({
      generatedAt: sql<string>`statement_timestamp()`,
      cohortCount: sql<number>`count(*)::int`.mapWith(Number),
      // Review SF9: the three outcome rows cover 3 of 13 statuses, so the table has to
      // account for the rest or it reads as if shipments vanished.
      cohortCod: sql<number>`count(*) filter (where ${shipmentDrafts.isCod})::int`.mapWith(Number),
      cohortNonCod: sql<number>`count(*) filter (where not ${shipmentDrafts.isCod})::int`.mapWith(Number),
      deliveredTotal: count(delivered),
      deliveredCod: count(delivered, true),
      deliveredNonCod: count(delivered, false),
      returnedTotal: count(returned),
      returnedCod: count(returned, true),
      returnedNonCod: count(returned, false),
      failedTotal: count(failed),
      failedCod: count(failed, true),
      failedNonCod: count(failed, false),
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
    );

  if (!row) throw new Error("Tenant dashboard outcome summary was not loaded.");

  // PR-57: the outcome is the provider's report, not ours. The caption states
  // that, and when the reader may see the evidence, when it was last pulled.
  const basis = await loadProviderDeliveryStatusBasis(tx, context, filters);

  return {
    basis,
    cohortCount: row.cohortCount,
    inProgress: {
      codCount: row.cohortCod - row.deliveredCod - row.returnedCod - row.failedCod,
      nonCodCount: row.cohortNonCod - row.deliveredNonCod - row.returnedNonCod - row.failedNonCod,
      totalCount: row.cohortCount - row.deliveredTotal - row.returnedTotal - row.failedTotal,
    },
    delivered: {
      codCount: row.deliveredCod,
      nonCodCount: row.deliveredNonCod,
      totalCount: row.deliveredTotal,
    },
    failed: {
      codCount: row.failedCod,
      nonCodCount: row.failedNonCod,
      totalCount: row.failedTotal,
    },
    generatedAt: new Date(row.generatedAt),
    returned: {
      codCount: row.returnedCod,
      nonCodCount: row.returnedNonCod,
      totalCount: row.returnedTotal,
    },
  };
}

/**
 * Spec 19 CRR-SHIPMENTS / CRR-DELIVERED / CRR-RETURNED / CRR-SHIPPING-IDR.
 *
 * Counts share the SHP-CREATED cohort above, narrowed to shipments that already
 * carry a provider batch (a draft has no courier yet). Cost is deliberately on
 * the ledger's own `effective_at` basis so it equals the Analitik provider-cost
 * KPI for the same period, outlet and courier; the surface labels both bases.
 */
export async function loadTenantDashboardCourierRecap(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
  filters: TenantDashboardPeriodFilters = {},
): Promise<TenantDashboardCourierRecap> {
  const shippingCostVisible = context.role === "TENANT_ADMIN";
  const volumeRows = await tx
    .select({
      generatedAt: sql<string>`statement_timestamp()`,
      courier: providerBatches.courier,
      shipmentCount: sql<number>`count(*)::int`.mapWith(Number),
      deliveredCount:
        sql<number>`count(*) filter (where ${eq(shipments.status, "DELIVERED")})::int`.mapWith(
          Number,
        ),
      returnedCount:
        sql<number>`count(*) filter (where ${inArray(shipments.status, [...RTS_STATUSES])})::int`.mapWith(
          Number,
        ),
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
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .innerJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
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
    .groupBy(providerBatches.courier);

  // Spec 19 M-0: a typed amount is the type plus every ADJUSTMENT that reverses
  // an entry of that type. Same clause as the Analitik provider-cost KPI and the
  // Keuangan ledger summary; the scope-parity test is what holds the three equal.
  const costRows = shippingCostVisible
    ? await tx
        .select({
          generatedAt: sql<string>`statement_timestamp()`,
          courier: providerBatches.courier,
          shippingCostIdr: sql<number>`coalesce(sum(
            case
              when ${ledgerEntries.entryType} = 'MENGANTAR_SHIPPING_COST'
                then ${ledgerEntries.amountIdr}
              when ${ledgerEntries.entryType} = 'ADJUSTMENT'
                and ${ledgerEntries.reversesEntryId} in (
                  select original.id
                  from ledger_entries original
                  where original.tenant_id = ${ledgerEntries.tenantId}
                    and original.entry_type = 'MENGANTAR_SHIPPING_COST'
                )
                then ${ledgerEntries.amountIdr}
              else 0
            end
          ), 0)::bigint`.mapWith(Number),
        })
        .from(ledgerEntries)
        .innerJoin(
          shipments,
          and(
            eq(shipments.id, ledgerEntries.shipmentId),
            eq(shipments.tenantId, ledgerEntries.tenantId),
          ),
        )
        .innerJoin(
          providerBatches,
          and(
            eq(providerBatches.id, ledgerEntries.providerBatchId),
            eq(providerBatches.tenantId, ledgerEntries.tenantId),
          ),
        )
        .where(
          and(
            eq(ledgerEntries.tenantId, context.tenantId),
            filters.outletId
              ? eq(shipments.outletId, filters.outletId)
              : undefined,
            gte(ledgerEntries.effectiveAt, range.startInclusive),
            lt(ledgerEntries.effectiveAt, range.endExclusive),
          ),
        )
        .groupBy(providerBatches.courier)
    : [];

  const byCourier = new Map<string, TenantDashboardCourierRecapRow>();
  const row = (courier: string) => {
    const existing = byCourier.get(courier);
    if (existing) return existing;
    const created: TenantDashboardCourierRecapRow = {
      courier,
      deliveredCount: 0,
      returnedCount: 0,
      shipmentCount: 0,
      shippingCostIdr: shippingCostVisible ? 0 : null,
    };
    byCourier.set(courier, created);
    return created;
  };
  for (const volume of volumeRows) {
    const target = row(volume.courier);
    target.shipmentCount = volume.shipmentCount;
    target.deliveredCount = volume.deliveredCount;
    target.returnedCount = volume.returnedCount;
  }
  // A courier can appear on cost alone: a shipment created before this period
  // can still have its cost recognized inside it.
  for (const cost of costRows) row(cost.courier).shippingCostIdr = cost.shippingCostIdr;

  // Spec 19 M-0 freshness: the generated-at is read from the database by the
  // read that produced the region. An empty period produces no grouped row, so
  // an aggregate (always exactly one row) supplies the same clock.
  let generatedAt = volumeRows[0]?.generatedAt ?? costRows[0]?.generatedAt;
  if (!generatedAt) {
    const [clock] = await tx
      .select({
        generatedAt: sql<string>`statement_timestamp()`,
        cohortCount: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(shipments)
      .where(eq(shipments.tenantId, context.tenantId));
    if (!clock) {
      throw new Error("Tenant dashboard courier recap timestamp was not loaded.");
    }
    generatedAt = clock.generatedAt;
  }

  return {
    generatedAt: new Date(generatedAt),
    rows: [...byCourier.values()].sort(
      (left, right) =>
        right.shipmentCount - left.shipmentCount ||
        (right.shippingCostIdr ?? 0) - (left.shippingCostIdr ?? 0) ||
        (left.courier < right.courier ? -1 : left.courier > right.courier ? 1 : 0),
    ),
    shippingCostVisible,
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
    codShippingOnly: shipmentDrafts.codShippingOnly,
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
        occurredAt: row.occurredAt,
        paymentMethod: paymentMethodOf(row.isCod, row.codShippingOnly),
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
          ? inArray(shipments.status, [...TENANT_DASHBOARD_ACTIONABLE_STATUSES])
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
