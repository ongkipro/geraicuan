import "server-only";

import { BASIS_POINTS, MENGANTAR_COD_FEE_BASIS_POINTS } from "@/lib/mengantar-cod-fee";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";

import {
  ledgerEntries,
  outlets,
  providerBatches,
  providerOrderSnapshots,
  shipmentCodTotals,
  shipmentDrafts,
  shipmentStatuses,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  EMPTY_ANALYTICS_FILTERS,
  type AnalyticsEventBasis,
  type AnalyticsFilters,
} from "@/lib/analytics-filters";
import type { AnalyticsRange } from "@/lib/analytics-range";
import type { PaymentMethod } from "@/lib/payment-method";
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

export type ShipmentKpis = {
  createdCount: number;
  issuedCount: number;
  resolvedSubmissionCount: number;
  providerShippingIdr: number;
  /**
   * Spec 19 FIN-COD-FEE-TOTAL (T-193): Σ RPT-SHP-COD-FEE-IDR — the fee Mengantar
   * keeps, `round(COD × 333 / 10000)` per COD shipment whose receipt was issued
   * in the range. The same figure the report, the disbursement estimate, the
   * label and the ledger use; VAT is inside it.
   */
  codFeeIdr: number;
  /**
   * Spec 19 FIN-COD-FEE-VAT-INCLUDED (T-193): Σ `round(fee × 11 / 111)` per
   * shipment — the VAT already inside `codFeeIdr`. Informational; never added to
   * it and never a liability.
   */
  codFeeVatIncludedIdr: number;
  /**
   * Spec 19 FIN-COD-DISBURSEMENT-EST: per COD shipment whose receipt was issued
   * in the range, COD amount − shipping Mengantar deducts − COD fee
   * (RPT-SHP-COD-FEE-IDR). An estimate of what Mengantar pays out, never money
   * received.
   */
  codDisbursementEstimateIdr: number;
};

export type CourierPerformanceRow = {
  courier: string;
  issuedCount: number;
  resolvedSubmissionCount: number;
};

export type ShipmentBacklogSnapshot = {
  asOf: Date;
  awaitingPaymentCount: number;
  needsActionCount: number;
};

export type ShipmentTrendPoint = {
  key: string;
  createdCount: number;
  issuedCount: number;
};

export type ShipmentTrend = {
  generatedAt: Date;
  points: ShipmentTrendPoint[];
};

export type ShipmentRow = {
  shipmentId: string;
  publicReference: string;
  createdAt: Date;
  issuedAt: Date | null;
  outletName: string;
  courier: string | null;
  providerService: string | null;
  status: ShipmentStatus;
  cnoteNo: string | null;
  isCod: boolean;
  /**
   * T-186: `NON_COD` whenever `isCod` is false (the order's own flag, as this
   * table has always read it), else COD or COD Ongkir from the draft.
   */
  paymentMethod: PaymentMethod;
  providerCodAmountIdr: number | null;
};

export type ShipmentPage = {
  rows: ShipmentRow[];
  totalCount: number;
};

export type ShipmentExport = {
  rows: ShipmentRow[];
  totalCount: number;
};

export type ShipmentKpiComparison = {
  backlogSnapshot: ShipmentBacklogSnapshot;
  current: ShipmentKpis;
  eventGeneratedAt: Date;
  previous: ShipmentKpis;
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

function createdRangePredicate(
  context: TenantContext,
  range: AnalyticsRange,
  filters: AnalyticsFilters,
) {
  return and(
    eq(shipments.tenantId, context.tenantId),
    gte(shipments.createdAt, range.startInclusive),
    lt(shipments.createdAt, range.endExclusive),
    shipmentFilterPredicate(filters),
  );
}

function issuedRangePredicate(
  context: TenantContext,
  range: AnalyticsRange,
  filters: AnalyticsFilters,
) {
  return and(
    eq(providerOrderSnapshots.tenantId, context.tenantId),
    eq(providerOrderSnapshots.status, "ISSUED"),
    gte(providerOrderSnapshots.resolvedAt, range.startInclusive),
    lt(providerOrderSnapshots.resolvedAt, range.endExclusive),
    shipmentFilterPredicate(filters),
  );
}

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

function ledgerRangePredicate(
  context: TenantContext,
  range: AnalyticsRange,
  filters: AnalyticsFilters,
) {
  return and(
    eq(ledgerEntries.tenantId, context.tenantId),
    gte(ledgerEntries.effectiveAt, range.startInclusive),
    lt(ledgerEntries.effectiveAt, range.endExclusive),
    shipmentFilterPredicate(filters),
  );
}

function detailRangePredicate(
  context: TenantContext,
  range: AnalyticsRange,
  filters: AnalyticsFilters,
  basis: AnalyticsEventBasis,
) {
  if (basis === "exceptions") {
    return and(
      eq(shipments.tenantId, context.tenantId),
      sql`${shipments.status} in ('AWAITING_UPSTREAM_PAYMENT', 'SUBMISSION_UNKNOWN', 'FAILED')`,
      shipmentFilterPredicate(filters),
    );
  }
  if (basis === "issued") return issuedRangePredicate(context, range, filters);
  if (basis === "outcome") {
    return resolvedSubmissionRangePredicate(context, range, filters);
  }
  return createdRangePredicate(context, range, filters);
}

/**
 * Spec 19 FIN-COD-DISBURSEMENT-EST / RPT-SHP-COD-DISBURSEMENT-EST, per shipment:
 * the COD amount submitted, less the shipping Mengantar deducts (the settlement
 * basis, falling back to `price` for snapshots issued before it was stored),
 * less **the fee Mengantar actually keeps** — `COD × 333 / 10000`, the rate
 * proven on 2,866 real settlement lines (`MENGANTAR_COD_FEE_BASIS_POINTS`).
 *
 * It used to subtract the service fee and VAT GeraiCUAN *stored*. Those equal
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
 * same rounding as `mengantarCodFeeIdr`. Not the fee GeraiCUAN stored: a row
 * written under the old additive formula stored 3.33% of goods plus shipping,
 * which is smaller than what Mengantar actually takes.
 */
export const mengantarCodFeeExpression = sql<number>`round(
  ${shipmentCodTotals.providerCodAmountIdr}::numeric * ${MENGANTAR_COD_FEE_BASIS_POINTS} / ${BASIS_POINTS}
)::bigint`;

/**
 * Spec 19 FIN-COD-FEE-VAT-INCLUDED, per shipment: the VAT inside
 * `mengantarCodFeeExpression`, `round(fee × 11 / 111)` half-up — the rule of
 * `vatIncludedInMengantarCodFeeIdr`. Informational only.
 */
export const mengantarCodFeeVatIncludedExpression = sql<number>`round(
  (${mengantarCodFeeExpression})::numeric * 11 / 111
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

/**
 * RPT-SHP-PAYMENT-MODE for the analytics table and export: the order's own COD
 * flag decides COD at all, and the draft's `cod_shipping_only` (T-186) splits
 * COD from COD Ongkir. Tenant-scoped by the draft's own `tenant_id`.
 */
const analyticsPaymentMethodExpression = sql<PaymentMethod>`CASE
  WHEN NOT coalesce(${providerOrderSnapshots.isCod}, false) THEN 'NON_COD'
  WHEN coalesce((
    SELECT analytics_draft.cod_shipping_only
    FROM ${shipmentDrafts} AS analytics_draft
    WHERE analytics_draft.shipment_id = ${shipments.id}
      AND analytics_draft.tenant_id = ${shipments.tenantId}
  ), false) THEN 'COD_ONGKIR'
  ELSE 'COD'
END`;

type AdjustedLedgerEntryType = "MENGANTAR_SHIPPING_COST";

/**
 * Adjustment-aware sum over one or more entry types: each entry of a listed
 * type, plus every ADJUSTMENT reversing an entry of a listed type. A list is
 * how one figure spans a reclassification (T-178) without counting an entry
 * twice.
 */
function adjustedLedgerAmount(...entryTypes: [AdjustedLedgerEntryType, ...AdjustedLedgerEntryType[]]) {
  const types = sql.join(entryTypes.map((type) => sql`${type}`), sql`, `);
  return sql<number>`coalesce(sum(
    case
      when ${ledgerEntries.entryType} in (${types}) then ${ledgerEntries.amountIdr}
      when ${ledgerEntries.entryType} = 'ADJUSTMENT'
        and ${ledgerEntries.reversesEntryId} in (
          select original.id
          from ledger_entries original
          where original.tenant_id = ${ledgerEntries.tenantId}
            and original.entry_type in (${types})
        )
        then ${ledgerEntries.amountIdr}
      else 0
    end
  ), 0)`.mapWith(Number);
}

async function loadShipmentKpisUnchecked(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
  filters: AnalyticsFilters,
): Promise<ShipmentKpis> {
  const [created] = await tx
    .select({
      createdCount: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(shipments)
    .leftJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(createdRangePredicate(context, range, filters));

  const [providerOutcomes] = await tx
    .select({
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
    .where(resolvedSubmissionRangePredicate(context, range, filters));

  const [financials] = await tx
    .select({
      providerShippingIdr: adjustedLedgerAmount("MENGANTAR_SHIPPING_COST"),
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
    .where(ledgerRangePredicate(context, range, filters));

  // T-177: GeraiCUAN reports shipping and the COD fee, not merchandise revenue
  // or margin. The disbursement estimate is one figure per issued COD shipment,
  // so it reads the stored order and its COD totals rather than the ledger.
  // T-193: so does the COD fee — the ledger holds three historical bookings of
  // it (revenue, stored fee + VAT row, Mengantar's fee), the order holds one.
  const [disbursement] = await tx
    .select({
      codFeeIdr: sql<number>`coalesce(sum(${mengantarCodFeeExpression}), 0)`.mapWith(Number),
      codFeeVatIncludedIdr: sql<number>`coalesce(sum(${mengantarCodFeeVatIncludedExpression}), 0)`.mapWith(Number),
      codDisbursementEstimateIdr: sql<number>`coalesce(sum(${codDisbursementEstimateExpression}), 0)`.mapWith(Number),
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
    .innerJoin(
      shipmentCodTotals,
      and(
        eq(shipmentCodTotals.shipmentId, providerOrderSnapshots.shipmentId),
        eq(shipmentCodTotals.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(
      and(
        issuedRangePredicate(context, range, filters),
        eq(providerOrderSnapshots.isCod, true),
      ),
    );

  if (!created || !providerOutcomes || !financials || !disbursement) {
    throw new Error("Shipment analytics were not loaded.");
  }
  return { ...created, ...providerOutcomes, ...financials, ...disbursement };
}

export async function loadShipmentKpis(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
  filters: AnalyticsFilters = EMPTY_ANALYTICS_FILTERS,
): Promise<ShipmentKpis> {
  requireTenantAdmin(context);
  await requireAnalyticsFilterAccess(tx, context, filters);
  return loadShipmentKpisUnchecked(tx, context, range, filters);
}

async function loadShipmentBacklogSnapshotUnchecked(
  tx: TenantTransaction,
  context: TenantContext,
  filters: AnalyticsFilters,
): Promise<ShipmentBacklogSnapshot> {
  const [snapshot] = await tx
    .select({
      asOf: sql<string>`statement_timestamp()`,
      awaitingPaymentCount:
        sql<number>`count(*) filter (where ${shipments.status} = 'AWAITING_UPSTREAM_PAYMENT')::int`.mapWith(
          Number,
        ),
      needsActionCount:
        sql<number>`count(*) filter (where ${shipments.status} in ('SUBMISSION_UNKNOWN', 'FAILED'))::int`.mapWith(
          Number,
        ),
    })
    .from(shipments)
    .leftJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(
      and(
        eq(shipments.tenantId, context.tenantId),
        shipmentFilterPredicate(filters),
      ),
    );

  if (!snapshot) throw new Error("Shipment backlog snapshot was not loaded.");
  return { ...snapshot, asOf: new Date(snapshot.asOf) };
}

export async function loadShipmentKpiComparison(
  tx: TenantTransaction,
  context: TenantContext,
  currentRange: AnalyticsRange,
  previousRange: AnalyticsRange,
  filters: AnalyticsFilters = EMPTY_ANALYTICS_FILTERS,
): Promise<ShipmentKpiComparison> {
  requireTenantAdmin(context);
  await requireAnalyticsFilterAccess(tx, context, filters);

  const current = await loadShipmentKpisUnchecked(
    tx,
    context,
    currentRange,
    filters,
  );
  const previous = await loadShipmentKpisUnchecked(
    tx,
    context,
    previousRange,
    filters,
  );
  const backlogSnapshot = await loadShipmentBacklogSnapshotUnchecked(
    tx,
    context,
    filters,
  );
  return {
    backlogSnapshot,
    current,
    eventGeneratedAt: backlogSnapshot.asOf,
    previous,
  };
}

export async function loadShipmentTrend(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
  filters: AnalyticsFilters = EMPTY_ANALYTICS_FILTERS,
): Promise<ShipmentTrend> {
  requireTenantAdmin(context);
  await requireAnalyticsFilterAccess(tx, context, filters);

  const [clock] = await tx
    .select({ generatedAt: sql<string>`statement_timestamp()` })
    .from(shipments)
    .where(eq(shipments.tenantId, context.tenantId))
    .limit(1);
  if (!clock) throw new Error("Shipment trend timestamp was not loaded.");

  const createdBucket =
    range.granularity === "harian"
      ? sql<string>`to_char(date_trunc('day', ${shipments.createdAt} AT TIME ZONE ${range.timezone}), 'YYYY-MM-DD')`
      : sql<string>`to_char(date_trunc('month', ${shipments.createdAt} AT TIME ZONE ${range.timezone}), 'YYYY-MM')`;
  const issuedBucket =
    range.granularity === "harian"
      ? sql<string>`to_char(date_trunc('day', ${providerOrderSnapshots.resolvedAt} AT TIME ZONE ${range.timezone}), 'YYYY-MM-DD')`
      : sql<string>`to_char(date_trunc('month', ${providerOrderSnapshots.resolvedAt} AT TIME ZONE ${range.timezone}), 'YYYY-MM')`;

  const createdRows = await tx
    .select({
      key: createdBucket,
      createdCount: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(shipments)
    .leftJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(createdRangePredicate(context, range, filters))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const issuedRows = await tx
    .select({
      key: issuedBucket,
      issuedCount: sql<number>`count(*)::int`.mapWith(Number),
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
    .where(issuedRangePredicate(context, range, filters))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const byKey = new Map<string, ShipmentTrendPoint>();
  for (const row of createdRows) {
    byKey.set(row.key, {
      key: row.key,
      createdCount: row.createdCount,
      issuedCount: 0,
    });
  }
  for (const row of issuedRows) {
    const point = byKey.get(row.key) ?? {
      key: row.key,
      createdCount: 0,
      issuedCount: 0,
    };
    point.issuedCount = row.issuedCount;
    byKey.set(row.key, point);
  }
  return {
    generatedAt: new Date(clock.generatedAt),
    points: [...byKey.values()].sort((left, right) =>
      left.key.localeCompare(right.key),
    ),
  };
}

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

export async function loadShipmentPage(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
  pagination: { limit: number; offset: number },
  filters: AnalyticsFilters = EMPTY_ANALYTICS_FILTERS,
  basis: AnalyticsEventBasis = "created",
): Promise<ShipmentPage> {
  requireTenantAdmin(context);
  await requireAnalyticsFilterAccess(tx, context, filters);

  if (
    !Number.isInteger(pagination.limit) ||
    pagination.limit < 1 ||
    !Number.isInteger(pagination.offset) ||
    pagination.offset < 0
  ) {
    throw new RangeError("Shipment analytics pagination is invalid.");
  }

  const [countRow] = await tx
    .select({
      totalCount: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(shipments)
    .leftJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(detailRangePredicate(context, range, filters, basis));
  const totalCount = countRow?.totalCount ?? 0;
  if (totalCount === 0) return { rows: [], totalCount };

  const lastPageOffset =
    Math.floor((totalCount - 1) / pagination.limit) * pagination.limit;
  const offset = Math.min(pagination.offset, lastPageOffset);
  const rows = await tx
    .select({
      shipmentId: shipments.id,
      publicReference: shipments.publicReference,
      createdAt: shipments.createdAt,
      issuedAt: providerOrderSnapshots.resolvedAt,
      outletName: sql<string>`coalesce(${outlets.name}, '—')`,
      courier: providerBatches.courier,
      providerService: providerOrderSnapshots.providerService,
      status: shipments.status,
      cnoteNo: providerOrderSnapshots.cnoteNo,
      isCod: sql<boolean>`coalesce(${providerOrderSnapshots.isCod}, false)`,
      paymentMethod: analyticsPaymentMethodExpression,
      providerCodAmountIdr: providerOrderSnapshots.providerCodAmountIdr,
    })
    .from(shipments)
    .leftJoin(
      outlets,
      and(
        eq(outlets.id, shipments.outletId),
        eq(outlets.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(detailRangePredicate(context, range, filters, basis))
    .orderBy(
      basis === "created" || basis === "exceptions"
        ? desc(shipments.createdAt)
        : desc(providerOrderSnapshots.resolvedAt),
      desc(shipments.id),
    )
    .limit(pagination.limit)
    .offset(offset);

  return { rows, totalCount };
}

export async function loadShipmentExport(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
  filters: AnalyticsFilters = EMPTY_ANALYTICS_FILTERS,
  maxRows = 10_000,
  basis: AnalyticsEventBasis = "created",
): Promise<ShipmentExport> {
  requireTenantAdmin(context);
  await requireAnalyticsFilterAccess(tx, context, filters);
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 10_000) {
    throw new RangeError("Shipment analytics export limit is invalid.");
  }

  const [countRow] = await tx
    .select({ totalCount: sql<number>`count(*)::int`.mapWith(Number) })
    .from(shipments)
    .leftJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(detailRangePredicate(context, range, filters, basis));
  const totalCount = countRow?.totalCount ?? 0;
  if (totalCount > maxRows) {
    throw new AnalyticsExportLimitError(totalCount, maxRows);
  }

  const rows = await tx
    .select({
      shipmentId: shipments.id,
      publicReference: shipments.publicReference,
      createdAt: shipments.createdAt,
      issuedAt: providerOrderSnapshots.resolvedAt,
      outletName: sql<string>`coalesce(${outlets.name}, '—')`,
      courier: providerBatches.courier,
      providerService: providerOrderSnapshots.providerService,
      status: shipments.status,
      cnoteNo: providerOrderSnapshots.cnoteNo,
      isCod: sql<boolean>`coalesce(${providerOrderSnapshots.isCod}, false)`,
      paymentMethod: analyticsPaymentMethodExpression,
      providerCodAmountIdr: providerOrderSnapshots.providerCodAmountIdr,
    })
    .from(shipments)
    .leftJoin(
      outlets,
      and(
        eq(outlets.id, shipments.outletId),
        eq(outlets.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .leftJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(detailRangePredicate(context, range, filters, basis))
    .orderBy(
      basis === "created" || basis === "exceptions"
        ? desc(shipments.createdAt)
        : desc(providerOrderSnapshots.resolvedAt),
      desc(shipments.id),
    )
    .limit(maxRows);

  return { rows, totalCount };
}

export async function countTenantShipments(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<number> {
  requireTenantAdmin(context);

  const [row] = await tx
    .select({ totalCount: sql<number>`count(*)::int`.mapWith(Number) })
    .from(shipments)
    .where(eq(shipments.tenantId, context.tenantId));
  return row?.totalCount ?? 0;
}
