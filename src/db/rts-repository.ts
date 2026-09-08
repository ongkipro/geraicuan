import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  outlets,
  providerOrderSnapshots,
  shipmentDrafts,
  shipmentParties,
  shipmentRtsEvents,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import type { ShipmentStatus } from "@/lib/shipment-queue";

export const RTS_STATUSES = [
  "RTS_QUEUED",
  "RTS_IN_TRANSIT",
  "RTS_RECEIVED",
] as const;

export type RtsFilterStatus = "ALL" | (typeof RTS_STATUSES)[number] | "PROBLEM";

export type RtsSummary = {
  totalRtsCount: number;
  queuedCount: number;
  inTransitCount: number;
  receivedCount: number;
  problemCount: number;
};

export type RtsShipmentRow = {
  shipmentId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  outletName: string;
  destinationAreaLabel: string;
  packageContent: string;
  packageWeightGrams: number;
  isCod: boolean;
  declaredValueIdr: number;
  recipientName: string;
  recipientPhone: string;
  providerService: string | null;
  awb: string | null;
  latestEventNotes: string | null;
  latestEventAt: Date | null;
};

export type RtsShipmentsPage = {
  generatedAt: Date;
  page: number;
  pageSize: number;
  rows: RtsShipmentRow[];
  status: RtsFilterStatus;
  totalCount: number;
  totalPages: number;
  summary: RtsSummary;
};

export async function loadRtsShipmentsPage(
  tx: TenantTransaction,
  context: TenantContext,
  input: {
    page: number;
    pageSize: number;
    status: RtsFilterStatus;
  },
): Promise<RtsShipmentsPage> {
  const allowedStatuses: ShipmentStatus[] =
    input.status === "ALL"
      ? ["RTS_QUEUED", "RTS_IN_TRANSIT", "RTS_RECEIVED", "PROBLEM"]
      : [input.status];

  const where = and(
    eq(shipments.tenantId, context.tenantId),
    inArray(shipments.status, allowedStatuses),
  );

  const rtsSummaryStatuses: ShipmentStatus[] = [
    "RTS_QUEUED",
    "RTS_IN_TRANSIT",
    "RTS_RECEIVED",
    "PROBLEM",
  ];

  // Load summary metrics for the RTS overview
  const summaryRows = await tx
    .select({
      status: shipments.status,
      count: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(shipments)
    .where(
      and(
        eq(shipments.tenantId, context.tenantId),
        inArray(shipments.status, rtsSummaryStatuses),
      ),
    )
    .groupBy(shipments.status);

  const summary: RtsSummary = {
    totalRtsCount: 0,
    queuedCount: 0,
    inTransitCount: 0,
    receivedCount: 0,
    problemCount: 0,
  };

  for (const row of summaryRows) {
    if (row.status === "RTS_QUEUED") summary.queuedCount = row.count;
    if (row.status === "RTS_IN_TRANSIT") summary.inTransitCount = row.count;
    if (row.status === "RTS_RECEIVED") summary.receivedCount = row.count;
    if (row.status === "PROBLEM") summary.problemCount = row.count;
    summary.totalRtsCount += row.count;
  }

  // Count total matching current filter
  const [countRow] = await tx
    .select({
      generatedAt: sql<string>`statement_timestamp()`,
      totalCount: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(shipments)
    .where(where);

  const totalCount = countRow?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / input.pageSize));
  const page = Math.min(input.page, totalPages);

  if (totalCount === 0) {
    return {
      generatedAt: countRow?.generatedAt ? new Date(countRow.generatedAt) : new Date(),
      page: 1,
      pageSize: input.pageSize,
      rows: [],
      status: input.status,
      totalCount,
      totalPages,
      summary,
    };
  }

  const offset = (page - 1) * input.pageSize;

  const rows = await tx
    .select({
      shipmentId: shipments.id,
      status: shipments.status,
      createdAt: shipments.createdAt,
      updatedAt: shipments.updatedAt,
      outletName: outlets.name,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      packageContent: shipmentDrafts.packageContent,
      packageWeightGrams: shipmentDrafts.packageWeightGrams,
      isCod: shipmentDrafts.isCod,
      declaredValueIdr: shipmentDrafts.declaredValueIdr,
      recipientName: shipmentParties.name,
      recipientPhone: shipmentParties.phone,
      providerService: providerOrderSnapshots.providerService,
      awb: providerOrderSnapshots.cnoteNo,
      latestEventNotes: shipmentRtsEvents.notes,
      latestEventAt: shipmentRtsEvents.createdAt,
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
    .leftJoin(
      shipmentRtsEvents,
      and(
        eq(shipmentRtsEvents.shipmentId, shipments.id),
        eq(shipmentRtsEvents.tenantId, shipments.tenantId),
      ),
    )
    .where(where)
    .orderBy(desc(shipments.updatedAt), desc(shipments.id))
    .limit(input.pageSize)
    .offset(offset);

  return {
    generatedAt: countRow?.generatedAt ? new Date(countRow.generatedAt) : new Date(),
    page,
    pageSize: input.pageSize,
    rows,
    status: input.status,
    totalCount,
    totalPages,
    summary,
  };
}
