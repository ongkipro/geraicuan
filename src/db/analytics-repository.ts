import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import {
  outlets,
  providerBatches,
  providerOrderSnapshots,
  shipmentCodTotals,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import type { AnalyticsRange } from "@/lib/analytics-range";
export type ShipmentStatus = (typeof shipments.$inferSelect)["status"];


export type ShipmentKpis = {
  createdCount: number;
  issuedCount: number;
  awaitingPaymentCount: number;
  needsActionCount: number;
  providerShippingIdr: number;
  codServiceFeeIdr: number;
  codVatIdr: number;
  codPrincipalIdr: number;
};

export type ShipmentTrendPoint = {
  key: string;
  createdCount: number;
  issuedCount: number;
};

export type ShipmentRow = {
  shipmentId: string;
  createdAt: Date;
  outletName: string;
  courier: string | null;
  providerService: string | null;
  status: ShipmentStatus;
  cnoteNo: string | null;
  isCod: boolean;
  providerCodAmountIdr: number | null;
};

export type ShipmentPage = {
  rows: ShipmentRow[];
  totalCount: number;
};

function requireTenantAdmin(context: TenantContext) {
  if (context.role !== "TENANT_ADMIN") {
    throw new Error("Tenant analytics require TENANT_ADMIN.");
  }
}

function shipmentRangePredicate(
  context: TenantContext,
  range: AnalyticsRange,
) {
  return and(
    eq(shipments.tenantId, context.tenantId),
    gte(shipments.createdAt, range.startInclusive),
    lt(shipments.createdAt, range.endExclusive),
  );
}

export async function loadShipmentKpis(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
): Promise<ShipmentKpis> {
  requireTenantAdmin(context);

  const [kpis] = await tx
    .select({
      createdCount: sql<number>`count(*)::int`.mapWith(Number),
      issuedCount:
        sql<number>`count(*) filter (where ${shipments.status} = 'ISSUED')::int`.mapWith(
          Number,
        ),
      awaitingPaymentCount:
        sql<number>`count(*) filter (where ${shipments.status} = 'AWAITING_UPSTREAM_PAYMENT')::int`.mapWith(
          Number,
        ),
      needsActionCount:
        sql<number>`count(*) filter (where ${shipments.status} in ('SUBMISSION_UNKNOWN', 'FAILED'))::int`.mapWith(
          Number,
        ),
      providerShippingIdr:
        sql<number>`coalesce(sum(${providerOrderSnapshots.shippingAmountIdr}) filter (where ${providerOrderSnapshots.status} = 'ISSUED'), 0)::bigint`.mapWith(
          Number,
        ),
      codServiceFeeIdr:
        sql<number>`coalesce(sum(${shipmentCodTotals.serviceFeeIdr}) filter (where ${providerOrderSnapshots.status} = 'ISSUED'), 0)::bigint`.mapWith(
          Number,
        ),
      codVatIdr:
        sql<number>`coalesce(sum(${shipmentCodTotals.vatAmountIdr}) filter (where ${providerOrderSnapshots.status} = 'ISSUED'), 0)::bigint`.mapWith(
          Number,
        ),
      codPrincipalIdr:
        sql<number>`coalesce(sum(${shipmentCodTotals.providerCodAmountIdr}) filter (where ${providerOrderSnapshots.status} = 'ISSUED'), 0)::bigint`.mapWith(
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
      shipmentCodTotals,
      and(
        eq(shipmentCodTotals.shipmentId, shipments.id),
        eq(shipmentCodTotals.tenantId, shipments.tenantId),
      ),
    )
    .where(shipmentRangePredicate(context, range));

  if (!kpis) throw new Error("Shipment analytics were not loaded.");
  return kpis;
}

export async function loadShipmentTrend(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
): Promise<ShipmentTrendPoint[]> {
  requireTenantAdmin(context);

  const bucket =
    range.granularity === "harian"
      ? sql<string>`to_char(date_trunc('day', ${shipments.createdAt} AT TIME ZONE ${range.timezone}), 'YYYY-MM-DD')`
      : sql<string>`to_char(date_trunc('month', ${shipments.createdAt} AT TIME ZONE ${range.timezone}), 'YYYY-MM')`;

  return tx
    .select({
      key: bucket,
      createdCount: sql<number>`count(*)::int`.mapWith(Number),
      issuedCount:
        sql<number>`count(*) filter (where ${shipments.status} = 'ISSUED')::int`.mapWith(
          Number,
        ),
    })
    .from(shipments)
    .where(shipmentRangePredicate(context, range))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
}

export async function loadShipmentPage(
  tx: TenantTransaction,
  context: TenantContext,
  range: AnalyticsRange,
  pagination: { limit: number; offset: number },
): Promise<ShipmentPage> {
  requireTenantAdmin(context);

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
    .where(shipmentRangePredicate(context, range));
  const totalCount = countRow?.totalCount ?? 0;
  if (totalCount === 0) return { rows: [], totalCount };

  const lastPageOffset =
    Math.floor((totalCount - 1) / pagination.limit) * pagination.limit;
  const offset = Math.min(pagination.offset, lastPageOffset);
  const rows = await tx
    .select({
      shipmentId: shipments.id,
      createdAt: shipments.createdAt,
      outletName: sql<string>`coalesce(${outlets.name}, '—')`,
      courier: providerBatches.courier,
      providerService: providerOrderSnapshots.providerService,
      status: shipments.status,
      cnoteNo: providerOrderSnapshots.cnoteNo,
      isCod: sql<boolean>`coalesce(${providerOrderSnapshots.isCod}, false)`,
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
    .where(shipmentRangePredicate(context, range))
    .orderBy(desc(shipments.createdAt), desc(shipments.id))
    .limit(pagination.limit)
    .offset(offset);

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
