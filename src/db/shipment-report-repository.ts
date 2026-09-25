import "server-only";

import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";

import {
  AnalyticsExportLimitError,
  codDisbursementEstimateExpression,
  mengantarCodFeeExpression,
} from "@/db/analytics-repository";
import {
  outlets,
  printEvents,
  providerBatches,
  providerOrderSnapshots,
  shipmentCodTotals,
  shipmentDrafts,
  shipmentParties,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import type { AnalyticsFilters } from "@/lib/analytics-filters";
import type { AnalyticsRange } from "@/lib/analytics-range";
import type { PaymentMethod } from "@/lib/payment-method";
import { SHIPMENT_REPORT_EXPORT_MAX_ROWS } from "@/lib/shipment-report";
import type { ShipmentStatus } from "@/lib/shipment-queue";

const MAX_PAGE_SIZE = 200;

/**
 * T-177: the report carries what Mengantar charges and pays out — shipping, the
 * COD fee and the estimated disbursement — never the COD amount as a total,
 * goods value, COGS or margin. Each money field is `null` until the shipment
 * reaches a provider order, and the two COD fields are `null` for non-COD.
 */
export type ShipmentReportRow = {
  codDisbursementEstimateIdr: number | null;
  codFeeIdr: number | null;
  courier: string | null;
  createdAt: Date;
  destinationAreaLabel: string;
  isCod: boolean;
  issuedAt: Date | null;
  outletName: string;
  paymentMethod: PaymentMethod;
  printCount: number;
  providerService: string | null;
  publicReference: string;
  shipmentId: string;
  shippingCostIdr: number | null;
  status: ShipmentStatus;
};

export type ShipmentReportCourierTotal = {
  codDisbursementEstimateIdr: number;
  codFeeIdr: number;
  /** `null` is a shipment that never reached a provider batch. */
  courier: string | null;
  shipmentCount: number;
  shippingCostIdr: number;
};

export type ShipmentReportLifecycleTotal = {
  shipmentCount: number;
  status: ShipmentStatus;
};

export type ShipmentReportTotals = {
  byCourier: ShipmentReportCourierTotal[];
  byLifecycle: ShipmentReportLifecycleTotal[];
  /** Spec 19 RPT-SHP-ROWS: rows the filters match, not rows on this page. */
  shipmentCount: number;
};

export type ShipmentReportPage = {
  generatedAt: Date;
  page: number;
  pageSize: number;
  rows: ShipmentReportRow[];
  totals: ShipmentReportTotals;
  totalPages: number;
};

export type ShipmentReportExport = {
  rows: ShipmentReportRow[];
  totalCount: number;
};

function requireTenantAdmin(context: TenantContext) {
  // PR-55 makes this a Tenant Admin record. An export must not widen what a
  // role may see, so the refusal lives in the read itself rather than only in
  // the page that calls it.
  if (context.role !== "TENANT_ADMIN") {
    throw new Error("Shipment report requires TENANT_ADMIN.");
  }
}

/**
 * The cohort Histori kiriman lists: tenant-owned, created inside the PR-53
 * window, holding a draft and a recipient party. Every read — rows, totals and
 * export — goes through these joins, so a total can never describe a wider
 * cohort than the list it sits above.
 */
function reportJoins<T extends PgSelect>(query: T) {
  return query
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
    .leftJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    // One row per shipment (`shipment_cod_totals_shipment_tenant_key`), and
    // only read once the shipment reached a COD provider order.
    .leftJoin(
      shipmentCodTotals,
      and(
        eq(shipmentCodTotals.shipmentId, providerOrderSnapshots.shipmentId),
        eq(shipmentCodTotals.tenantId, providerOrderSnapshots.tenantId),
        eq(providerOrderSnapshots.isCod, true),
      ),
    );
}

/** Spec 19 RPT-SHP-SHIPPING-COST-IDR: the ledger's MENGANTAR_SHIPPING_COST basis. */
const shippingCostExpression = sql<number | null>`coalesce(${providerOrderSnapshots.providerChargedShippingIdr}, ${providerOrderSnapshots.shippingAmountIdr})`;
/** Spec 19 RPT-SHP-COD-FEE-IDR. */
// What Mengantar keeps, from the same expression the disbursement column is
// built on, so a row's three money columns always add up to its COD amount.
const codFeeExpression = mengantarCodFeeExpression;

/**
 * The tenant predicate is the table's own `tenant_id` column, never row-level
 * security alone (AGENTS.md), and the outlet, courier and lifecycle dimensions
 * are the ones `parseTenantAnalyticsQuery` already validates against the
 * tenant's own outlets and couriers.
 */
function reportFilter(
  context: TenantContext,
  range: AnalyticsRange,
  filters: AnalyticsFilters,
) {
  return and(
    eq(shipments.tenantId, context.tenantId),
    gte(shipments.createdAt, range.startInclusive),
    lt(shipments.createdAt, range.endExclusive),
    filters.outletId ? eq(shipments.outletId, filters.outletId) : undefined,
    filters.courier ? eq(providerBatches.courier, filters.courier) : undefined,
    filters.lifecycleStatus
      ? eq(shipments.status, filters.lifecycleStatus)
      : undefined,
  );
}

function printCountExpression(context: TenantContext) {
  return sql<number>`(
    SELECT count(*)::int
    FROM ${printEvents} AS report_print_history
    WHERE report_print_history.tenant_id = ${context.tenantId}
      AND report_print_history.shipment_id = ${shipments.id}
      AND report_print_history.outcome = 'PRINTED'
  )`.mapWith(Number);
}

function reportRowQuery(tx: TenantTransaction, context: TenantContext) {
  return reportJoins(
    tx
      .select({
        codDisbursementEstimateIdr: sql<number | null>`${codDisbursementEstimateExpression}`.mapWith((value) => (value === null ? null : Number(value))),
        codFeeIdr: sql<number | null>`${codFeeExpression}`.mapWith((value) => (value === null ? null : Number(value))),
        courier: providerBatches.courier,
        createdAt: shipments.createdAt,
        destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
        isCod: shipmentDrafts.isCod,
        // RPT-SHP-PAYMENT-MODE (T-186): the draft's method, one of three.
        paymentMethod: sql<PaymentMethod>`CASE
          WHEN NOT ${shipmentDrafts.isCod} THEN 'NON_COD'
          WHEN ${shipmentDrafts.codShippingOnly} THEN 'COD_ONGKIR'
          ELSE 'COD'
        END`,
        issuedAt: providerOrderSnapshots.resolvedAt,
        outletName: outlets.name,
        printCount: printCountExpression(context),
        providerService: providerOrderSnapshots.providerService,
        publicReference: shipments.publicReference,
        shipmentId: shipments.id,
        shippingCostIdr: shippingCostExpression,
        status: shipments.status,
      })
      .from(shipments)
      .$dynamic(),
  );
}

async function loadTotals(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
  filters: AnalyticsFilters,
): Promise<{ generatedAt: Date; totals: ShipmentReportTotals }> {
  const where = reportFilter(context, range, filters);
  const shipmentCount = sql<number>`count(*)::int`.mapWith(Number);

  const byCourier = await reportJoins(
    tx
      .select({
        codDisbursementEstimateIdr: sql<number>`coalesce(sum(${codDisbursementEstimateExpression}), 0)::bigint`.mapWith(Number),
        codFeeIdr: sql<number>`coalesce(sum(${codFeeExpression}), 0)::bigint`.mapWith(Number),
        courier: providerBatches.courier,
        shipmentCount,
        shippingCostIdr: sql<number>`coalesce(sum(${shippingCostExpression}), 0)::bigint`.mapWith(Number),
      })
      .from(shipments)
      .$dynamic(),
  )
    .where(where)
    .groupBy(providerBatches.courier)
    .orderBy(
      desc(sql`count(*)`),
      sql`${providerBatches.courier} collate "C" asc nulls last`,
    );

  const byLifecycle = await reportJoins(
    tx
      .select({ shipmentCount, status: shipments.status })
      .from(shipments)
      .$dynamic(),
  )
    .where(where)
    .groupBy(shipments.status)
    .orderBy(desc(sql`count(*)`), asc(shipments.status));

  const [countRow] = await reportJoins(
    tx
      .select({
        generatedAt: sql<Date>`statement_timestamp()`.mapWith(
          (value) => value instanceof Date ? value : new Date(String(value)),
        ),
        shipmentCount,
      })
      .from(shipments)
      .$dynamic(),
  ).where(where);

  return {
    generatedAt: countRow?.generatedAt ?? new Date(),
    totals: {
      byCourier,
      byLifecycle,
      shipmentCount: countRow?.shipmentCount ?? 0,
    },
  };
}

export async function loadShipmentReportPage(
  tx: TenantTransaction,
  context: TenantContext,
  input: {
    filters: AnalyticsFilters;
    page: number;
    pageSize: number;
    range: AnalyticsRange;
  },
): Promise<ShipmentReportPage> {
  requireTenantAdmin(context);
  if (
    !Number.isSafeInteger(input.page) ||
    input.page < 1 ||
    !Number.isSafeInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > MAX_PAGE_SIZE
  ) {
    throw new RangeError("Shipment report pagination is invalid.");
  }

  const { generatedAt, totals } = await loadTotals(
    tx,
    context,
    input.range,
    input.filters,
  );
  const totalPages = Math.max(
    1,
    Math.ceil(totals.shipmentCount / input.pageSize),
  );
  const page = Math.min(input.page, totalPages);
  if (totals.shipmentCount === 0) {
    return {
      generatedAt,
      page: 1,
      pageSize: input.pageSize,
      rows: [],
      totals,
      totalPages,
    };
  }

  const rows = await reportRowQuery(tx, context)
    .where(reportFilter(context, input.range, input.filters))
    .orderBy(desc(shipments.createdAt), desc(shipments.id))
    .limit(input.pageSize)
    .offset((page - 1) * input.pageSize);

  return {
    generatedAt,
    page,
    pageSize: input.pageSize,
    rows,
    totals,
    totalPages,
  };
}

/**
 * PR-55 export: the whole filtered set, in the same scope and on the same basis
 * as the page — never the page the operator happens to be looking at — and
 * refused outright above the ceiling rather than truncated.
 */
export async function loadShipmentReportExport(
  tx: TenantTransaction,
  context: TenantContext,
  input: {
    filters: AnalyticsFilters;
    maxRows?: number;
    range: AnalyticsRange;
  },
): Promise<ShipmentReportExport> {
  requireTenantAdmin(context);
  const maxRows = input.maxRows ?? SHIPMENT_REPORT_EXPORT_MAX_ROWS;
  if (
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    maxRows > SHIPMENT_REPORT_EXPORT_MAX_ROWS
  ) {
    throw new RangeError("Shipment report export limit is invalid.");
  }

  const { totals } = await loadTotals(tx, context, input.range, input.filters);
  if (totals.shipmentCount > maxRows) {
    throw new AnalyticsExportLimitError(totals.shipmentCount, maxRows);
  }

  const rows = await reportRowQuery(tx, context)
    .where(reportFilter(context, input.range, input.filters))
    .orderBy(desc(shipments.createdAt), desc(shipments.id))
    .limit(maxRows);

  return { rows, totalCount: totals.shipmentCount };
}
