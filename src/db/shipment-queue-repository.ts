import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { loadLatestEstimateSnapshot } from "@/db/estimate-repository";
import { issuedTodayPredicate } from "@/db/shipment-event-predicates";
import {
  outlets,
  printEvents,
  providerBatches,
  providerOrderSnapshots,
  providerUnpaidRecoveries,
  shipmentDrafts,
  shipmentParties,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import type { PersistedEstimateService } from "@/db/estimate-repository";
import type {
  ShipmentQueueStatusFilter,
  ShipmentStatus,
} from "@/lib/shipment-queue";

const MAX_PAGE_SIZE = 100;

export type ShipmentQueueRow = {
  awb: string | null;
  createdAt: Date;
  destinationAreaLabel: string;
  isCod: boolean;
  outletName: string;
  packageContent: string;
  packageWeightGrams: number;
  providerService: string | null;
  recipientName: string;
  shipmentId: string;
  status: ShipmentStatus;
  updatedAt: Date;
};

export type ShipmentQueuePage = {
  generatedAt: Date;
  page: number;
  pageSize: number;
  rows: ShipmentQueueRow[];
  status: ShipmentQueueStatusFilter;
  totalCount: number;
  totalPages: number;
};

export type ShipmentPartySnapshot = {
  address: string;
  name: string;
  phone: string;
};

export type ShipmentDetail = {
  createdAt: Date;
  generatedAt: Date;
  destinationAreaId: string;
  destinationAreaLabel: string;
  estimate: {
    snapshotId: string;
    isCodRequested: boolean;
    retrievedAt: Date;
    services: PersistedEstimateService[];
  } | null;
  isCod: boolean;
  outlet: { id: string; name: string };
  package: {
    content: string;
    declaredValueIdr: number;
    heightCm: number | null;
    lengthCm: number | null;
    quantity: number;
    weightGrams: number;
    widthCm: number | null;
  };
  printCount: number;
  provider: {
    awb: string | null;
    batchSafeErrorCode: string | null;
    batchId: string | null;
    batchStatus: (typeof providerBatches.$inferSelect)["status"] | null;
    courier: string | null;
    insuranceAmountIdr: number | null;
    isPaid: boolean | null;
    orderId: string | null;
    orderStatus: (typeof providerOrderSnapshots.$inferSelect)["status"];
    providerCodAmountIdr: number | null;
    providerService: string;
    recoveryStatus: (typeof providerUnpaidRecoveries.$inferSelect)["status"] | null;
    resolvedAt: Date | null;
    safeResponseCode: string | null;
    shippingAmountIdr: number;
  } | null;
  recipient: ShipmentPartySnapshot | null;
  sender: ShipmentPartySnapshot | null;
  shipmentId: string;
  status: ShipmentStatus;
  updatedAt: Date;
};

function shipmentFilter(
  context: TenantContext,
  status: ShipmentQueueStatusFilter,
) {
  let statusPredicate;
  switch (status) {
    case "ALL":
      statusPredicate = undefined;
      break;
    case "ACTION_REQUIRED":
      statusPredicate = inArray(shipments.status, [
        "AWAITING_UPSTREAM_PAYMENT",
        "SUBMISSION_UNKNOWN",
        "FAILED",
      ]);
      break;
    case "READY_TO_PROGRESS":
      statusPredicate = inArray(shipments.status, ["DRAFT", "ESTIMATED"]);
      break;
    case "ISSUED_TODAY":
      statusPredicate = issuedTodayPredicate(context);
      break;
    default:
      statusPredicate = eq(shipments.status, status);
  }

  return and(
    eq(shipments.tenantId, context.tenantId),
    statusPredicate,
  );
}

function validatePagination(page: number, pageSize: number) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE
  ) {
    throw new RangeError("Shipment queue pagination is invalid.");
  }
}

export async function loadShipmentQueuePage(
  tx: TenantTransaction,
  context: TenantContext,
  input: {
    page: number;
    pageSize: number;
    status: ShipmentQueueStatusFilter;
  },
): Promise<ShipmentQueuePage> {
  validatePagination(input.page, input.pageSize);

  const where = shipmentFilter(context, input.status);
  const [countRow] = await tx
    .select({
      generatedAt: sql<Date>`statement_timestamp()`.mapWith(
        (value) => value instanceof Date ? value : new Date(String(value)),
      ),
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
    .where(where);

  const totalCount = countRow?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / input.pageSize));
  const page = Math.min(input.page, totalPages);

  if (totalCount === 0) {
    return {
      generatedAt: countRow?.generatedAt ?? new Date(),
      page: 1,
      pageSize: input.pageSize,
      rows: [],
      status: input.status,
      totalCount,
      totalPages,
    };
  }

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
      recipientName: shipmentParties.name,
      providerService: providerOrderSnapshots.providerService,
      awb: providerOrderSnapshots.cnoteNo,
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
    .where(where)
    .orderBy(desc(shipments.updatedAt), desc(shipments.id))
    .limit(input.pageSize)
    .offset((page - 1) * input.pageSize);

  return {
    generatedAt: countRow?.generatedAt ?? new Date(),
    page,
    pageSize: input.pageSize,
    rows,
    status: input.status,
    totalCount,
    totalPages,
  };
}

export async function loadShipmentDetail(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<ShipmentDetail | null> {
  const [row] = await tx
    .select({
      shipmentId: shipments.id,
      status: shipments.status,
      createdAt: shipments.createdAt,
      generatedAt: sql<Date>`statement_timestamp()`.mapWith(
        (value) => value instanceof Date ? value : new Date(String(value)),
      ),
      updatedAt: shipments.updatedAt,
      outletId: outlets.id,
      outletName: outlets.name,
      destinationAreaId: shipmentDrafts.destinationAreaId,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      packageContent: shipmentDrafts.packageContent,
      packageWeightGrams: shipmentDrafts.packageWeightGrams,
      packageQuantity: shipmentDrafts.packageQuantity,
      packageLengthCm: shipmentDrafts.packageLengthCm,
      packageWidthCm: shipmentDrafts.packageWidthCm,
      packageHeightCm: shipmentDrafts.packageHeightCm,
      declaredValueIdr: shipmentDrafts.declaredValueIdr,
      isCod: shipmentDrafts.isCod,
      providerSnapshotId: providerOrderSnapshots.id,
      providerOrderId: providerOrderSnapshots.providerOrderId,
      providerOrderStatus: providerOrderSnapshots.status,
      providerService: providerOrderSnapshots.providerService,
      providerShippingAmountIdr: providerOrderSnapshots.shippingAmountIdr,
      providerInsuranceAmountIdr: providerOrderSnapshots.insuranceAmountIdr,
      providerCodAmountIdr: providerOrderSnapshots.providerCodAmountIdr,
      providerIsPaid: providerOrderSnapshots.isPaid,
      providerAwb: providerOrderSnapshots.cnoteNo,
      providerSafeResponseCode: providerOrderSnapshots.safeResponseCode,
      providerRecoveryStatus: providerUnpaidRecoveries.status,
      providerResolvedAt: providerOrderSnapshots.resolvedAt,
      providerBatchStatus: providerBatches.status,
      providerBatchId: providerBatches.id,
      providerBatchSafeErrorCode: providerBatches.safeErrorCode,
      courier: providerBatches.courier,
      printCount: sql<number>`(
        SELECT count(*)::int
        FROM ${printEvents} AS shipment_print_history
        WHERE shipment_print_history.tenant_id = ${context.tenantId}
          AND shipment_print_history.shipment_id = ${shipments.id}
          AND shipment_print_history.outcome = 'PRINTED'
      )`.mapWith(Number),
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
    .leftJoin(
      providerUnpaidRecoveries,
      and(
        eq(providerUnpaidRecoveries.providerOrderSnapshotId, providerOrderSnapshots.id),
        eq(providerUnpaidRecoveries.batchId, providerOrderSnapshots.batchId),
        eq(providerUnpaidRecoveries.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(
      and(
        eq(shipments.id, shipmentId),
        eq(shipments.tenantId, context.tenantId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const parties = await tx
    .select({
      role: shipmentParties.role,
      name: shipmentParties.name,
      phone: shipmentParties.phone,
      address: shipmentParties.address,
    })
    .from(shipmentParties)
    .where(
      and(
        eq(shipmentParties.shipmentId, shipmentId),
        eq(shipmentParties.tenantId, context.tenantId),
      ),
    );
  const latestEstimate = await loadLatestEstimateSnapshot(
    tx,
    context,
    shipmentId,
  );

  const sender = parties.find((party) => party.role === "SENDER") ?? null;
  const recipient = parties.find((party) => party.role === "RECIPIENT") ?? null;
  const provider =
    row.providerSnapshotId &&
    row.providerOrderStatus &&
    row.providerService !== null &&
    row.providerShippingAmountIdr !== null
      ? {
          awb: row.providerAwb?.trim() || null,
          batchSafeErrorCode: row.providerBatchSafeErrorCode,
          batchId: row.providerBatchId,
          batchStatus: row.providerBatchStatus,
          courier: row.courier,
          insuranceAmountIdr: row.providerInsuranceAmountIdr,
          isPaid: row.providerIsPaid,
          orderId: row.providerOrderId,
          orderStatus: row.providerOrderStatus,
          providerCodAmountIdr: row.providerCodAmountIdr,
          providerService: row.providerService,
          recoveryStatus: row.providerRecoveryStatus,
          resolvedAt: row.providerResolvedAt,
          safeResponseCode: row.providerSafeResponseCode,
          shippingAmountIdr: row.providerShippingAmountIdr,
        }
      : null;

  return {
    createdAt: row.createdAt,
    generatedAt: row.generatedAt,
    destinationAreaId: row.destinationAreaId,
    destinationAreaLabel: row.destinationAreaLabel,
    estimate: latestEstimate
      ? {
          snapshotId: latestEstimate.snapshotId,
          isCodRequested: latestEstimate.request.isCodRequested,
          retrievedAt: latestEstimate.retrievedAt,
          services: latestEstimate.services,
        }
      : null,
    isCod: row.isCod,
    outlet: { id: row.outletId, name: row.outletName },
    package: {
      content: row.packageContent,
      declaredValueIdr: row.declaredValueIdr,
      heightCm: row.packageHeightCm,
      lengthCm: row.packageLengthCm,
      quantity: row.packageQuantity,
      weightGrams: row.packageWeightGrams,
      widthCm: row.packageWidthCm,
    },
    printCount: row.printCount,
    provider,
    recipient,
    sender,
    shipmentId: row.shipmentId,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}
