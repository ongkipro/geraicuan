import "server-only";

import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";

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
import { paymentMethodOf, type PaymentMethod } from "@/lib/payment-method";
import type { AnalyticsRange } from "@/lib/analytics-range";
import {
  isStaleShipmentFilter,
  SHIPMENT_QUEUE_SUMMARY_ENTRIES,
  STALE_SHIPMENT_FILTERS,
  STALE_SHIPMENT_STATUSES,
} from "@/lib/shipment-queue";
import type {
  ShipmentQueueStatusFilter,
  ShipmentQueueSummary,
  ShipmentStatus,
} from "@/lib/shipment-queue";

const MAX_PAGE_SIZE = 100;

/**
 * Spec 19 QUE-ATTENTION. Read off the panel entry so the queue this filter
 * returns and the count the panel prints cannot describe different cohorts.
 */
const NEEDS_ATTENTION_STATUSES = SHIPMENT_QUEUE_SUMMARY_ENTRIES.find(
  (entry) => entry.value === "NEEDS_ATTENTION",
)!.statuses as readonly ShipmentStatus[];

export type ShipmentQueueRow = {
  awb: string | null;
  createdAt: Date;
  declaredValueIdr: number;
  destinationAreaLabel: string;
  outletName: string;
  packageContent: string;
  packageWeightGrams: number;
  /** T-190: the draft's method, so the queue never reads COD Ongkir as COD. */
  paymentMethod: PaymentMethod;
  /** COD total or COD Ongkir charge of the issued order; `null` before one exists. */
  providerCodAmountIdr: number | null;
  providerService: string | null;
  recipientName: string;
  recipientPhone: string;
  shipmentId: string;
  publicReference: string;
  status: ShipmentStatus;
  updatedAt: Date;
};

export type ShipmentQueuePage = {
  generatedAt: Date;
  page: number;
  pageSize: number;
  rows: ShipmentQueueRow[];
  status: ShipmentQueueStatusFilter;
  /** PR-52 panel counts, one per metric ID, in the same scope as `rows`. */
  summary: ShipmentQueueSummary;
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
  /** T-186 / PR-64. */
  paymentMethod: PaymentMethod;
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
  publicReference: string;
  status: ShipmentStatus;
  updatedAt: Date;
};

/**
 * PR-53 created basis. `undefined` applies no date predicate: the page always
 * passes a range, and the callers that do not are asking about the whole
 * lifetime of the tenant on purpose.
 */
function createdWithin(range: AnalyticsRange | undefined) {
  return range
    ? and(
        gte(shipments.createdAt, range.startInclusive),
        lt(shipments.createdAt, range.endExclusive),
      )
    : undefined;
}

/**
 * Histori search (spec 17 UX-v3.6): shipment number or resi only — never a party
 * name or phone, because the term travels in the URL (spec 10 §11). The caller
 * validates the term; LIKE wildcards are escaped here.
 */
function searchPredicate(search: string | undefined) {
  if (!search) return undefined;
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  return or(ilike(shipments.publicReference, pattern), ilike(providerOrderSnapshots.cnoteNo, pattern));
}

/**
 * T-231 / PR-89 "Tanpa update …": the last provider news is the latest
 * observation's `last_history_at` (Mengantar's own event time) or, when that is
 * unreadable, the pull time that observed it; a shipment never observed falls
 * back to its issuance time (`provider_order_snapshots.resolved_at`).
 * Without `last_history_at`, the clock is the first pull that saw the current
 * provider status (after the last different one), so repeated pulls of an
 * unchanged status do not reset it.
 * The subquery is tenant-filtered in SQL, and RLS limits it to a Tenant Admin,
 * which is why the caller must be one.
 */
function stalePredicate(hours: number) {
  return and(
    inArray(shipments.status, [...STALE_SHIPMENT_STATUSES]),
    sql`COALESCE(
      (SELECT COALESCE(
          latest.last_history_at,
          (SELECT min(same.observed_at)
            FROM provider_order_status_observations same
            WHERE same.tenant_id = latest.tenant_id
              AND same.shipment_id = latest.shipment_id
              AND same.provider_status = latest.provider_status
              AND same.observed_at > COALESCE(
                (SELECT max(other.observed_at)
                  FROM provider_order_status_observations other
                  WHERE other.tenant_id = latest.tenant_id
                    AND other.shipment_id = latest.shipment_id
                    AND other.provider_status <> latest.provider_status),
                '-infinity'::timestamptz)))
        FROM provider_order_status_observations latest
        WHERE latest.tenant_id = ${shipments.tenantId}
          AND latest.shipment_id = ${shipments.id}
        ORDER BY latest.observed_at DESC, latest.id DESC
        LIMIT 1),
      ${providerOrderSnapshots.resolvedAt}
    ) < statement_timestamp() - make_interval(hours => ${hours}::int)`,
  );
}

export class StaleShipmentFilterDeniedError extends Error {
  constructor() {
    super("Stale shipment filters are Tenant Admin only.");
    this.name = "StaleShipmentFilterDeniedError";
  }
}

function shipmentFilter(
  context: TenantContext,
  status: ShipmentQueueStatusFilter,
  range: AnalyticsRange | undefined,
  search?: string,
) {
  let statusPredicate;
  switch (status) {
    case "ALL":
      statusPredicate = undefined;
      break;
    case "ACTION_REQUIRED":
      // Spec 19 ACT-NEEDED. Awaiting payment is the Tenant Admin-only
      // ACT-UNPAID and is reached through its own status filter.
      statusPredicate = inArray(shipments.status, [
        "SUBMISSION_UNKNOWN",
        "FAILED",
      ]);
      break;
    case "NEEDS_ATTENTION":
      statusPredicate = inArray(shipments.status, [...NEEDS_ATTENTION_STATUSES]);
      break;
    case "READY_TO_PROGRESS":
      statusPredicate = inArray(shipments.status, ["DRAFT", "ESTIMATED"]);
      break;
    case "ISSUED_TODAY":
      statusPredicate = issuedTodayPredicate(context);
      break;
    case "STALE_48H":
    case "STALE_4D":
      statusPredicate = stalePredicate(STALE_SHIPMENT_FILTERS[status].hours);
      break;
    default:
      statusPredicate = eq(shipments.status, status);
  }

  return and(
    eq(shipments.tenantId, context.tenantId),
    createdWithin(range),
    statusPredicate,
    searchPredicate(search),
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
    /** PR-53 created-basis window; omitted means the tenant's whole lifetime. */
    range?: AnalyticsRange;
    /** Validated number/resi fragment; also narrows the panel counts (PR-52). */
    search?: string;
    status: ShipmentQueueStatusFilter;
  },
): Promise<ShipmentQueuePage> {
  validatePagination(input.page, input.pageSize);
  // An operator cannot read the observations (RLS), so the filter would fall
  // back to issuance time for every row and report a cohort it cannot evidence.
  if (isStaleShipmentFilter(input.status) && context.role !== "TENANT_ADMIN") {
    throw new StaleShipmentFilterDeniedError();
  }

  const where = shipmentFilter(context, input.status, input.range, input.search);

  // PR-52: the panel counts come from the same tenant-scoped pass as the list
  // and over the same cohort (the same joins), so an entry's number always
  // equals the number of rows its own filter returns. The predicate is the
  // table's own `tenant_id`, not row-level security alone.
  const summaryRows = await tx
    .select({
      status: shipments.status,
      count: sql<number>`count(*)::int`.mapWith(Number),
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
    .where(and(eq(shipments.tenantId, context.tenantId), createdWithin(input.range), searchPredicate(input.search)))
    .groupBy(shipments.status);

  const countByStatus = new Map(summaryRows.map((row) => [row.status, row.count]));
  const summary = Object.fromEntries(
    SHIPMENT_QUEUE_SUMMARY_ENTRIES.map((entry) => [
      entry.metricId,
      entry.statuses === null
        ? summaryRows.reduce((total, row) => total + row.count, 0)
        : entry.statuses.reduce(
            (total, status) => total + (countByStatus.get(status) ?? 0),
            0,
          ),
    ]),
  ) as ShipmentQueueSummary;

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
      summary,
      totalCount,
      totalPages,
    };
  }

  const rows = await tx
    .select({
      shipmentId: shipments.id,
      publicReference: shipments.publicReference,
      status: shipments.status,
      createdAt: shipments.createdAt,
      updatedAt: shipments.updatedAt,
      outletName: outlets.name,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      packageContent: shipmentDrafts.packageContent,
      packageWeightGrams: shipmentDrafts.packageWeightGrams,
      declaredValueIdr: shipmentDrafts.declaredValueIdr,
      isCod: shipmentDrafts.isCod,
      codShippingOnly: shipmentDrafts.codShippingOnly,
      recipientName: shipmentParties.name,
      recipientPhone: shipmentParties.phone,
      providerService: providerOrderSnapshots.providerService,
      providerCodAmountIdr: providerOrderSnapshots.providerCodAmountIdr,
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
    rows: rows.map(({ codShippingOnly, isCod, ...row }) => ({
      ...row,
      paymentMethod: paymentMethodOf(isCod, codShippingOnly),
    })),
    status: input.status,
    summary,
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
      publicReference: shipments.publicReference,
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
      codShippingOnly: shipmentDrafts.codShippingOnly,
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
    paymentMethod: paymentMethodOf(row.isCod, row.codShippingOnly),
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
    publicReference: row.publicReference,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}
