import "server-only";

import { BASIS_POINTS, MENGANTAR_COD_FEE_BASIS_POINTS } from "@/lib/mengantar-cod-fee";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";

import {
  outlets,
  providerBatches,
  providerOrderSnapshots,
  shipmentCodTotals,
  shipmentStatuses,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  EMPTY_ANALYTICS_FILTERS,
  type AnalyticsFilters,
} from "@/lib/analytics-filters";
import type { AnalyticsRange } from "@/lib/analytics-range";
export type ShipmentStatus = (typeof shipments.$inferSelect)["status"];

export { EMPTY_ANALYTICS_FILTERS } from "@/lib/analytics-filters";
export type { AnalyticsFilters } from "@/lib/analytics-filters";

export type AnalyticsFilterOptions = {
  couriers: string[];
  outlets: Array<{ id: string; name: string }>;
};

export class AnalyticsFilterDeniedError extends Error {
  constructor() {
    super("Analytics filter is not available to this tenant.");
  }
}

export class AnalyticsExportLimitError extends Error {
  constructor(readonly totalCount: number, readonly maxRows: number) {
    super("Filtered analytics export exceeds the safe row limit.");
  }
}

export type CourierPerformanceRow = {
  courier: string;
  issuedCount: number;
  resolvedSubmissionCount: number;
};

function requireTenantAdmin(context: TenantContext) {
  if (context.role !== "TENANT_ADMIN") {
    throw new Error("Tenant analytics require TENANT_ADMIN.");
  }
}

async function requireAnalyticsFilterAccess(
  tx: TenantTransaction,
  context: TenantContext,
  filters: AnalyticsFilters,
) {
  if (
    filters.lifecycleStatus !== null &&
    !shipmentStatuses.includes(filters.lifecycleStatus)
  ) {
    throw new AnalyticsFilterDeniedError();
  }

  if (filters.outletId) {
    const [outlet] = await tx
      .select({ id: outlets.id })
      .from(outlets)
      .where(
        and(
          eq(outlets.id, filters.outletId),
          eq(outlets.tenantId, context.tenantId),
        ),
      )
      .limit(1);
    if (!outlet) throw new AnalyticsFilterDeniedError();
  }

  if (filters.courier) {
    const [courier] = await tx
      .select({ courier: providerBatches.courier })
      .from(providerBatches)
      .where(
        and(
          eq(providerBatches.tenantId, context.tenantId),
          eq(providerBatches.courier, filters.courier),
        ),
      )
      .limit(1);
    if (!courier) throw new AnalyticsFilterDeniedError();
  }
}

export async function loadAnalyticsFilterOptions(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<AnalyticsFilterOptions> {
  requireTenantAdmin(context);
  const binaryCourier = sql<string>`${providerBatches.courier} collate "C"`;

  const outletRows = await tx
    .select({ id: outlets.id, name: outlets.name })
    .from(outlets)
    .where(eq(outlets.tenantId, context.tenantId))
    .orderBy(asc(outlets.name), asc(outlets.id));
  const courierRows = await tx
    .selectDistinct({ courier: binaryCourier })
    .from(providerBatches)
    .where(eq(providerBatches.tenantId, context.tenantId))
    .orderBy(binaryCourier);

  return {
    outlets: outletRows,
    couriers: courierRows.map(({ courier }) => courier),
  };
}

function shipmentFilterPredicate(filters: AnalyticsFilters) {
  return and(
    filters.outletId ? eq(shipments.outletId, filters.outletId) : undefined,
    filters.courier ? eq(providerBatches.courier, filters.courier) : undefined,
    filters.lifecycleStatus
      ? eq(shipments.status, filters.lifecycleStatus)
      : undefined,
  );
}

// lazy: SHP-ISSUED / SHP-OUTCOMES ("resolved_at in range, status not queued") is restated here,
// in `loadTenantDashboardPeriodSummary` (Drizzle) and in `platform-monitoring-repository` (raw SQL
// over the redacted views, which cannot take a Drizzle predicate on the base table).
// `tests/metric-scope-parity` holds the three equal on cross-period fixtures; extract one SQL
// fragment builder if a fourth reader appears or the definition changes.
function resolvedSubmissionRangePredicate(
  context: TenantContext,
  range: AnalyticsRange,
  filters: AnalyticsFilters,
) {
  return and(
    eq(providerOrderSnapshots.tenantId, context.tenantId),
    sql`${providerOrderSnapshots.status} <> 'SUBMISSION_QUEUED'`,
    gte(providerOrderSnapshots.resolvedAt, range.startInclusive),
    lt(providerOrderSnapshots.resolvedAt, range.endExclusive),
    shipmentFilterPredicate(filters),
  );
}

/**
 * Spec 19 FIN-COD-DISBURSEMENT-EST / RPT-SHP-COD-DISBURSEMENT-EST, per shipment:
 * the COD amount submitted, less the shipping Mengantar deducts (the settlement
 * basis, falling back to `price` for snapshots issued before it was stored),
 * less **the fee Mengantar actually keeps** — `COD × 333 / 10000`, the rate
 * proven on 2,866 real settlement lines (`MENGANTAR_COD_FEE_BASIS_POINTS`).
 *
 * It used to subtract the service fee and VAT GeraiCuan *stored*. Those equal
 * Mengantar's fee only for rows written under the T-175 gross-up; a row written
 * under the old additive formula stored 3.33% of (goods + shipping), not of the
 * COD amount, so the same shipment's expected disbursement read differently
 * here and in Keuangan's SETTLE-EXPECTED-IDR. One money, one formula: this is
 * that formula, and `expectedSettlementUnits` computes the same figure.
 *
 * Requires `provider_order_snapshots` and `shipment_cod_totals` joined for the
 * same shipment, so the analytics total and the report column share it.
 */
/**
 * Spec 19 RPT-SHP-COD-FEE-IDR: the COD fee **Mengantar keeps** on a shipment,
 * `round(COD × 333 / 10000)` half-up to a whole rupiah — the same rate and the
 * same rounding as `mengantarCodFeeIdr`. Not the fee GeraiCuan stored: a row
 * written under the old additive formula stored 3.33% of goods plus shipping,
 * which is smaller than what Mengantar actually takes.
 */
export const mengantarCodFeeExpression = sql<number>`round(
  ${shipmentCodTotals.providerCodAmountIdr}::numeric * ${MENGANTAR_COD_FEE_BASIS_POINTS} / ${BASIS_POINTS}
)::bigint`;

/**
 * Built **from** the fee column rather than rounded on its own, so a report row
 * always adds up: COD − Biaya kirim − Biaya COD = Estimasi dana dicairkan, to
 * the rupiah, on every row. Rounding the whole difference separately would
 * disagree by one rupiah whenever the fee lands exactly on a half. The exact
 * sen-level comparison against a real settlement stays in Keuangan, where
 * `expectedSettlementUnits` applies the same rate in ten-thousandths.
 */
export const codDisbursementEstimateExpression = sql<number>`(
  ${shipmentCodTotals.providerCodAmountIdr}
  - coalesce(${providerOrderSnapshots.providerChargedShippingIdr}, ${providerOrderSnapshots.shippingAmountIdr})
  - ${mengantarCodFeeExpression}
)::bigint`;

export async function loadCourierPerformance(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
  filters: AnalyticsFilters = EMPTY_ANALYTICS_FILTERS,
): Promise<CourierPerformanceRow[]> {
  requireTenantAdmin(context);
  await requireAnalyticsFilterAccess(tx, context, filters);

  return tx
    .select({
      courier: providerBatches.courier,
      issuedCount:
        sql<number>`count(*) filter (where ${providerOrderSnapshots.status} = 'ISSUED')::int`.mapWith(
          Number,
        ),
      resolvedSubmissionCount: sql<number>`count(*)::int`.mapWith(Number),
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
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(resolvedSubmissionRangePredicate(context, range, filters))
    .groupBy(providerBatches.courier)
    .orderBy(
      desc(
        sql`count(*) filter (where ${providerOrderSnapshots.status} = 'ISSUED')::numeric / nullif(count(*), 0)`,
      ),
      desc(sql`count(*)`),
      sql`${providerBatches.courier} collate "C" asc`,
    );
}
