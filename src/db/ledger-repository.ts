import "server-only";

import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";

import {
  ledgerEntries,
  outlets,
  providerBatches,
  providerOrderSnapshots,
  providerUnpaidRecoveries,
  reconciliationRuns,
  shipmentCodTotals,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

export type ReconcilableLedgerEntryType = Exclude<
  (typeof ledgerEntries.$inferSelect)["entryType"],
  "ADJUSTMENT" | "RECONCILIATION"
>;

export type LedgerDateRange = {
  outletId?: string;
  start: Date;
  end: Date;
};

export type LedgerSummary = {
  codPrincipalLiabilityIdr: number;
  providerCostIdr: number;
  revenueIdr: number;
  vatPayableIdr: number;
  upstreamRecoveryPaymentIdr: number;
};

export const LEDGER_RECONCILIATION_SOURCE_TYPES = [
  "COD_PRINCIPAL_COLLECTABLE",
  "MENGANTAR_SHIPPING_COST",
  "MENGANTAR_INSURANCE_COST",
  "GERAICUAN_COD_SERVICE_FEE_REVENUE",
  "COD_SERVICE_FEE_VAT_PAYABLE",
  "NON_COD_UPSTREAM_PAYMENT",
] as const satisfies readonly ReconcilableLedgerEntryType[];

export type LedgerReconciliationSourceType =
  (typeof LEDGER_RECONCILIATION_SOURCE_TYPES)[number];

export type LedgerReconciliationCadence =
  (typeof reconciliationRuns.$inferInsert)["cadence"];

export type LedgerReconciliationSourceTotals = Record<
  LedgerReconciliationSourceType,
  number
>;

export type LedgerWorkspaceEntry = Pick<
  typeof ledgerEntries.$inferSelect,
  | "id"
  | "shipmentId"
  | "entryType"
  | "financialClass"
  | "amountIdr"
  | "effectiveAt"
  | "sourceEvent"
  | "sourceEventId"
  | "reversesEntryId"
> & {
  publicReference: string | null;
  outletName: string;
  adjustmentState: "AVAILABLE" | "ADJUSTED" | "INELIGIBLE";
};

export type LedgerWorkspacePage = {
  rows: LedgerWorkspaceEntry[];
  totalCount: number;
};

export type LedgerReconciliationPeriodInput = {
  outletId: string;
  cadence: LedgerReconciliationCadence;
  periodStart: Date;
  periodEnd: Date;
  attemptId: string;
};

export type LedgerReconciliationRow = Pick<
  typeof reconciliationRuns.$inferSelect,
  | "id"
  | "outletId"
  | "cadence"
  | "reconciledEntryType"
  | "periodStart"
  | "periodEnd"
  | "sourceTotalIdr"
  | "ledgerTotalIdr"
  | "varianceIdr"
  | "status"
  | "createdAt"
> & {
  outletName: string;
};

export type LedgerReconciliationVariancePage = {
  rows: LedgerReconciliationRow[];
  totalCount: number;
};

export type LedgerReconciliationVarianceSummary = {
  totalSignedVarianceIdr: number;
  varianceCount: number;
};

export type ReconciliationInput = {
  outletId: string;
  cadence: (typeof reconciliationRuns.$inferInsert)["cadence"];
  reconciledEntryType: ReconcilableLedgerEntryType;
  periodStart: Date;
  periodEnd: Date;
  sourceTotalIdr: number;
  sourceEventId: string;
};

export class LedgerDeniedError extends Error {
  constructor() {
    super("Operational ledger access is not authorized.");
  }
}

export class LedgerUnavailableError extends Error {
  constructor() {
    super("Operational ledger transition is unavailable.");
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireTenantAdmin(context: TenantContext) {
  if (context.role !== "TENANT_ADMIN") throw new LedgerDeniedError();
}

function requireWholeIdr(value: number, allowNegative = false) {
  if (!Number.isSafeInteger(value) || (!allowNegative && value < 0)) {
    throw new LedgerUnavailableError();
  }
  return value;
}

function requireDateRange(start: Date, end: Date) {
  if (
    !Number.isFinite(start.getTime())
    || !Number.isFinite(end.getTime())
    || end.getTime() <= start.getTime()
  ) {
    throw new LedgerUnavailableError();
  }
}

function requireSourceEventId(sourceEventId: string) {
  const normalized = sourceEventId.trim();
  if (normalized.length < 1 || normalized.length > 160) {
    throw new LedgerUnavailableError();
  }
  return normalized;
}

function requireAttemptId(attemptId: string) {
  if (!UUID_PATTERN.test(attemptId)) throw new LedgerUnavailableError();
  return attemptId;
}

type TransitionEntry = Pick<
  typeof ledgerEntries.$inferInsert,
  "entryType" | "financialClass" | "amountIdr"
>;

type TransitionSource = {
  outletId: string;
  shipmentId: string;
  providerBatchId: string;
  providerOrderSnapshotId: string;
  effectiveAt: Date;
  sourceEvent: "PROVIDER_ORDER_ISSUED" | "UNPAID_RECOVERY_COMPLETED";
  sourceEventId: string;
};

async function insertTransitionEntries(
  tx: TenantTransaction,
  context: TenantContext,
  source: TransitionSource,
  entries: readonly TransitionEntry[],
) {
  if (entries.length === 0) throw new LedgerUnavailableError();

  await tx.insert(ledgerEntries).values(
    entries.map((entry) => ({
      tenantId: context.tenantId,
      outletId: source.outletId,
      shipmentId: source.shipmentId,
      providerBatchId: source.providerBatchId,
      providerOrderSnapshotId: source.providerOrderSnapshotId,
      entryType: entry.entryType,
      financialClass: entry.financialClass,
      amountIdr: requireWholeIdr(entry.amountIdr, true),
      currency: "IDR" as const,
      effectiveAt: source.effectiveAt,
      sourceEvent: source.sourceEvent,
      sourceEventId: source.sourceEventId,
      actorType: "USER" as const,
      actorUserId: context.userId,
    })),
  );

  return entries.length;
}

export async function appendLedgerForIssuedProviderOrder(
  tx: TenantTransaction,
  context: TenantContext,
  providerOrderSnapshotId: string,
) {
  const [source] = await tx
    .select({
      outletId: providerBatches.outletId,
      shipmentId: providerOrderSnapshots.shipmentId,
      providerBatchId: providerOrderSnapshots.batchId,
      providerOrderSnapshotId: providerOrderSnapshots.id,
      orderStatus: providerOrderSnapshots.status,
      shipmentStatus: shipments.status,
      isCod: providerOrderSnapshots.isCod,
      isPaid: providerOrderSnapshots.isPaid,
      shippingAmountIdr: providerOrderSnapshots.shippingAmountIdr,
      insuranceAmountIdr: providerOrderSnapshots.insuranceAmountIdr,
      providerCodAmountIdr: providerOrderSnapshots.providerCodAmountIdr,
      resolvedAt: providerOrderSnapshots.resolvedAt,
      codGoodsValueIdr: shipmentCodTotals.goodsValueIdr,
      codShippingAmountIdr: shipmentCodTotals.shippingAmountIdr,
      codServiceFeeIdr: shipmentCodTotals.serviceFeeIdr,
      codVatAmountIdr: shipmentCodTotals.vatAmountIdr,
      codProviderAmountIdr: shipmentCodTotals.providerCodAmountIdr,
    })
    .from(providerOrderSnapshots)
    .innerJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .innerJoin(
      shipments,
      and(
        eq(shipments.id, providerOrderSnapshots.shipmentId),
        eq(shipments.tenantId, providerOrderSnapshots.tenantId),
        eq(shipments.outletId, providerBatches.outletId),
      ),
    )
    .leftJoin(
      shipmentCodTotals,
      and(
        eq(shipmentCodTotals.shipmentId, providerOrderSnapshots.shipmentId),
        eq(shipmentCodTotals.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .where(
      and(
        eq(providerOrderSnapshots.id, providerOrderSnapshotId),
        eq(providerOrderSnapshots.tenantId, context.tenantId),
      ),
    )
    .limit(1);

  if (
    !source
    || source.orderStatus !== "ISSUED"
    || source.shipmentStatus !== "ISSUED"
    || !source.resolvedAt
  ) {
    throw new LedgerUnavailableError();
  }

  const entries: TransitionEntry[] = [
    {
      entryType: "MENGANTAR_SHIPPING_COST",
      financialClass: "EXPENSE",
      amountIdr: requireWholeIdr(source.shippingAmountIdr),
    },
  ];
  if (source.insuranceAmountIdr !== null) {
    entries.push({
      entryType: "MENGANTAR_INSURANCE_COST",
      financialClass: "EXPENSE",
      amountIdr: requireWholeIdr(source.insuranceAmountIdr),
    });
  }

  if (source.isCod) {
    if (
      source.codGoodsValueIdr === null
      || source.codShippingAmountIdr !== source.shippingAmountIdr
      || source.codProviderAmountIdr !== source.providerCodAmountIdr
      || source.codServiceFeeIdr === null
      || source.codVatAmountIdr === null
    ) {
      throw new LedgerUnavailableError();
    }
    entries.unshift({
      entryType: "COD_PRINCIPAL_COLLECTABLE",
      financialClass: "LIABILITY",
      amountIdr: requireWholeIdr(source.codGoodsValueIdr),
    });
    entries.push(
      {
        entryType: "GERAICUAN_COD_SERVICE_FEE_REVENUE",
        financialClass: "REVENUE",
        amountIdr: requireWholeIdr(source.codServiceFeeIdr),
      },
      {
        entryType: "COD_SERVICE_FEE_VAT_PAYABLE",
        financialClass: "LIABILITY",
        amountIdr: requireWholeIdr(source.codVatAmountIdr),
      },
    );
  } else if (source.isPaid !== true) {
    throw new LedgerUnavailableError();
  }

  return insertTransitionEntries(
    tx,
    context,
    {
      outletId: source.outletId,
      shipmentId: source.shipmentId,
      providerBatchId: source.providerBatchId,
      providerOrderSnapshotId: source.providerOrderSnapshotId,
      effectiveAt: source.resolvedAt,
      sourceEvent: "PROVIDER_ORDER_ISSUED",
      sourceEventId: source.providerOrderSnapshotId,
    },
    entries,
  );
}

export async function appendLedgerForCompletedUnpaidRecovery(
  tx: TenantTransaction,
  context: TenantContext,
  recoveryId: string,
) {
  const [source] = await tx
    .select({
      outletId: providerBatches.outletId,
      shipmentId: providerOrderSnapshots.shipmentId,
      providerBatchId: providerOrderSnapshots.batchId,
      providerOrderSnapshotId: providerOrderSnapshots.id,
      shippingAmountIdr: providerOrderSnapshots.shippingAmountIdr,
      insuranceAmountIdr: providerOrderSnapshots.insuranceAmountIdr,
      orderStatus: providerOrderSnapshots.status,
      shipmentStatus: shipments.status,
      isCod: providerOrderSnapshots.isCod,
      isPaid: providerOrderSnapshots.isPaid,
      recoveryStatus: providerUnpaidRecoveries.status,
      completedAt: providerUnpaidRecoveries.completedAt,
    })
    .from(providerUnpaidRecoveries)
    .innerJoin(
      providerOrderSnapshots,
      and(
        eq(
          providerOrderSnapshots.id,
          providerUnpaidRecoveries.providerOrderSnapshotId,
        ),
        eq(providerOrderSnapshots.batchId, providerUnpaidRecoveries.batchId),
        eq(providerOrderSnapshots.tenantId, providerUnpaidRecoveries.tenantId),
      ),
    )
    .innerJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerUnpaidRecoveries.batchId),
        eq(providerBatches.tenantId, providerUnpaidRecoveries.tenantId),
      ),
    )
    .innerJoin(
      shipments,
      and(
        eq(shipments.id, providerOrderSnapshots.shipmentId),
        eq(shipments.tenantId, providerOrderSnapshots.tenantId),
        eq(shipments.outletId, providerBatches.outletId),
      ),
    )
    .where(
      and(
        eq(providerUnpaidRecoveries.id, recoveryId),
        eq(providerUnpaidRecoveries.tenantId, context.tenantId),
      ),
    )
    .limit(1);

  if (
    !source
    || source.recoveryStatus !== "COMPLETED"
    || source.orderStatus !== "ISSUED"
    || source.shipmentStatus !== "ISSUED"
    || source.isCod
    || source.isPaid !== true
    || !source.completedAt
  ) {
    throw new LedgerUnavailableError();
  }

  const shippingAmountIdr = requireWholeIdr(source.shippingAmountIdr);
  const insuranceAmountIdr = source.insuranceAmountIdr === null
    ? null
    : requireWholeIdr(source.insuranceAmountIdr);
  const entries: TransitionEntry[] = [
    {
      entryType: "MENGANTAR_SHIPPING_COST",
      financialClass: "EXPENSE",
      amountIdr: shippingAmountIdr,
    },
  ];
  if (insuranceAmountIdr !== null) {
    entries.push({
      entryType: "MENGANTAR_INSURANCE_COST",
      financialClass: "EXPENSE",
      amountIdr: insuranceAmountIdr,
    });
  }
  entries.push({
    entryType: "NON_COD_UPSTREAM_PAYMENT",
    financialClass: "MEMO",
    amountIdr: requireWholeIdr(shippingAmountIdr + (insuranceAmountIdr ?? 0)),
  });

  return insertTransitionEntries(
    tx,
    context,
    {
      outletId: source.outletId,
      shipmentId: source.shipmentId,
      providerBatchId: source.providerBatchId,
      providerOrderSnapshotId: source.providerOrderSnapshotId,
      effectiveAt: source.completedAt,
      sourceEvent: "UNPAID_RECOVERY_COMPLETED",
      sourceEventId: recoveryId,
    },
    entries,
  );
}

async function loadAdjustmentReplay(
  tx: TenantTransaction,
  context: TenantContext,
  reversesEntryId: string,
  attemptId: string,
) {
  const [adjustment] = await tx
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.id, attemptId),
        eq(ledgerEntries.tenantId, context.tenantId),
      ),
    )
    .limit(1);
  if (!adjustment) return null;
  if (
    adjustment.entryType !== "ADJUSTMENT"
    || adjustment.sourceEvent !== "MANUAL_ADJUSTMENT"
    || adjustment.sourceEventId !== reversesEntryId
    || adjustment.reversesEntryId !== reversesEntryId
    || adjustment.actorType !== "USER"
    || adjustment.actorUserId !== context.userId
  ) {
    throw new LedgerUnavailableError();
  }
  return adjustment;
}

export async function appendLedgerAdjustment(
  tx: TenantTransaction,
  context: TenantContext,
  reversesEntryId: string,
  attemptId: string,
  effectiveAt = new Date(),
) {
  requireTenantAdmin(context);
  requireAttemptId(attemptId);
  if (!Number.isFinite(effectiveAt.getTime())) throw new LedgerUnavailableError();

  const preflight = await loadAdjustmentReplay(
    tx,
    context,
    reversesEntryId,
    attemptId,
  );
  if (preflight) return preflight;

  // The runtime role is intentionally INSERT/SELECT-only on this immutable table,
  // so an advisory transaction lock serializes one reversal target without
  // granting UPDATE merely to obtain a row lock.
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`ledger-adjustment:${context.tenantId}:${reversesEntryId}`}, 0)
    )
  `);

  const replayAfterLock = await loadAdjustmentReplay(
    tx,
    context,
    reversesEntryId,
    attemptId,
  );
  if (replayAfterLock) return replayAfterLock;

  const [original] = await tx
    .select({
      id: ledgerEntries.id,
      outletId: ledgerEntries.outletId,
      shipmentId: ledgerEntries.shipmentId,
      providerBatchId: ledgerEntries.providerBatchId,
      providerOrderSnapshotId: ledgerEntries.providerOrderSnapshotId,
      financialClass: ledgerEntries.financialClass,
      amountIdr: ledgerEntries.amountIdr,
      entryType: ledgerEntries.entryType,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.id, reversesEntryId),
        eq(ledgerEntries.tenantId, context.tenantId),
      ),
    )
    .limit(1);

  if (
    !original
    || original.entryType === "ADJUSTMENT"
    || original.entryType === "RECONCILIATION"
    || !original.shipmentId
    || !original.providerBatchId
    || !original.providerOrderSnapshotId
  ) {
    throw new LedgerUnavailableError();
  }

  const [existingAdjustment] = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.tenantId, context.tenantId),
        eq(ledgerEntries.reversesEntryId, original.id),
      ),
    )
    .limit(1);
  if (existingAdjustment) throw new LedgerUnavailableError();

  const [adjustment] = await tx
    .insert(ledgerEntries)
    .values({
      id: attemptId,
      tenantId: context.tenantId,
      outletId: original.outletId,
      shipmentId: original.shipmentId,
      providerBatchId: original.providerBatchId,
      providerOrderSnapshotId: original.providerOrderSnapshotId,
      entryType: "ADJUSTMENT",
      financialClass: original.financialClass,
      amountIdr: requireWholeIdr(-original.amountIdr, true),
      currency: "IDR",
      effectiveAt,
      sourceEvent: "MANUAL_ADJUSTMENT",
      sourceEventId: original.id,
      actorType: "USER",
      actorUserId: context.userId,
      reversesEntryId: original.id,
    })
    .onConflictDoNothing()
    .returning();

  if (adjustment) return adjustment;
  const replay = await loadAdjustmentReplay(
    tx,
    context,
    reversesEntryId,
    attemptId,
  );
  if (replay) return replay;
  throw new LedgerUnavailableError();
}

function rangePredicate(context: TenantContext, range: LedgerDateRange) {
  requireDateRange(range.start, range.end);
  return and(
    eq(ledgerEntries.tenantId, context.tenantId),
    range.outletId ? eq(ledgerEntries.outletId, range.outletId) : undefined,
    gte(ledgerEntries.effectiveAt, range.start),
    lt(ledgerEntries.effectiveAt, range.end),
  );
}

function adjustedTypeAmount(entryType: ReconcilableLedgerEntryType) {
  return sql<number>`coalesce(sum(
    case
      when ${ledgerEntries.entryType} = ${entryType} then ${ledgerEntries.amountIdr}
      when ${ledgerEntries.entryType} = 'ADJUSTMENT'
        and ${ledgerEntries.reversesEntryId} in (
          select original.id
          from ledger_entries original
          where original.tenant_id = ${ledgerEntries.tenantId}
            and original.entry_type = ${entryType}
        )
        then ${ledgerEntries.amountIdr}
      else 0
    end
  ), 0)`.mapWith(Number);
}

export async function summarizeLedger(
  tx: TenantTransaction,
  context: TenantContext,
  range: LedgerDateRange,
): Promise<LedgerSummary> {
  requireTenantAdmin(context);
  const [summary] = await tx
    .select({
      codPrincipalLiabilityIdr: adjustedTypeAmount("COD_PRINCIPAL_COLLECTABLE"),
      providerCostIdr: sql<number>`coalesce(sum(
        case when ${ledgerEntries.financialClass} = 'EXPENSE'
          then ${ledgerEntries.amountIdr} else 0 end
      ), 0)`.mapWith(Number),
      revenueIdr: sql<number>`coalesce(sum(
        case when ${ledgerEntries.financialClass} = 'REVENUE'
          then ${ledgerEntries.amountIdr} else 0 end
      ), 0)`.mapWith(Number),
      vatPayableIdr: adjustedTypeAmount("COD_SERVICE_FEE_VAT_PAYABLE"),
      upstreamRecoveryPaymentIdr: adjustedTypeAmount("NON_COD_UPSTREAM_PAYMENT"),
    })
    .from(ledgerEntries)
    .where(rangePredicate(context, range));

  if (!summary) throw new LedgerUnavailableError();
  return summary;
}

function requireWorkspacePagination(pagination: { limit: number; offset: number }) {
  if (
    !Number.isInteger(pagination.limit)
    || pagination.limit < 1
    || !Number.isInteger(pagination.offset)
    || pagination.offset < 0
  ) {
    throw new LedgerUnavailableError();
  }
}

export async function listLedgerEntries(
  tx: TenantTransaction,
  context: TenantContext,
  range: LedgerDateRange,
  pagination: { limit: number; offset: number },
): Promise<LedgerWorkspacePage> {
  requireTenantAdmin(context);
  requireWorkspacePagination(pagination);

  const [countRow] = await tx
    .select({ totalCount: sql<number>`count(*)::int`.mapWith(Number) })
    .from(ledgerEntries)
    .where(rangePredicate(context, range));
  const totalCount = countRow?.totalCount ?? 0;
  if (totalCount === 0) return { rows: [], totalCount };

  const lastPageOffset =
    Math.floor((totalCount - 1) / pagination.limit) * pagination.limit;
  const offset = Math.min(pagination.offset, lastPageOffset);
  const entries = await tx
    .select({
      id: ledgerEntries.id,
      shipmentId: ledgerEntries.shipmentId,
      publicReference: shipments.publicReference,
      entryType: ledgerEntries.entryType,
      financialClass: ledgerEntries.financialClass,
      amountIdr: ledgerEntries.amountIdr,
      effectiveAt: ledgerEntries.effectiveAt,
      sourceEvent: ledgerEntries.sourceEvent,
      sourceEventId: ledgerEntries.sourceEventId,
      reversesEntryId: ledgerEntries.reversesEntryId,
      outletName: outlets.name,
      alreadyAdjusted: sql<boolean>`exists (
        select 1
        from ledger_entries adjustment
        where adjustment.tenant_id = ${context.tenantId}
          and adjustment.reverses_entry_id = ${ledgerEntries.id}
      )`,
    })
    .from(ledgerEntries)
    .innerJoin(
      outlets,
      and(
        eq(outlets.id, ledgerEntries.outletId),
        eq(outlets.tenantId, ledgerEntries.tenantId),
      ),
    )
    .leftJoin(shipments, and(
      eq(shipments.id, ledgerEntries.shipmentId),
      eq(shipments.tenantId, ledgerEntries.tenantId),
      eq(shipments.outletId, ledgerEntries.outletId),
    ))
    .where(rangePredicate(context, range))
    .orderBy(desc(ledgerEntries.effectiveAt), desc(ledgerEntries.id))
    .limit(pagination.limit)
    .offset(offset);

  return {
    totalCount,
    rows: entries.map(({ alreadyAdjusted, ...entry }) => ({
      ...entry,
      adjustmentState:
        entry.entryType === "ADJUSTMENT"
          || entry.entryType === "RECONCILIATION"
          || entry.reversesEntryId
          ? "INELIGIBLE"
          : alreadyAdjusted
            ? "ADJUSTED"
            : "AVAILABLE",
    })),
  };
}

export async function listLedgerReconciliations(
  tx: TenantTransaction,
  context: TenantContext,
  range: LedgerDateRange,
): Promise<LedgerReconciliationRow[]> {
  requireTenantAdmin(context);
  requireDateRange(range.start, range.end);

  return tx
    .select({
      id: reconciliationRuns.id,
      outletId: reconciliationRuns.outletId,
      outletName: outlets.name,
      cadence: reconciliationRuns.cadence,
      reconciledEntryType: reconciliationRuns.reconciledEntryType,
      periodStart: reconciliationRuns.periodStart,
      periodEnd: reconciliationRuns.periodEnd,
      sourceTotalIdr: reconciliationRuns.sourceTotalIdr,
      ledgerTotalIdr: reconciliationRuns.ledgerTotalIdr,
      varianceIdr: reconciliationRuns.varianceIdr,
      status: reconciliationRuns.status,
      createdAt: reconciliationRuns.createdAt,
    })
    .from(reconciliationRuns)
    .innerJoin(
      outlets,
      and(
        eq(outlets.id, reconciliationRuns.outletId),
        eq(outlets.tenantId, reconciliationRuns.tenantId),
      ),
    )
    .where(
      and(
        eq(reconciliationRuns.tenantId, context.tenantId),
        range.outletId
          ? eq(reconciliationRuns.outletId, range.outletId)
          : undefined,
        gte(reconciliationRuns.periodStart, range.start),
        lte(reconciliationRuns.periodEnd, range.end),
      ),
    )
    .orderBy(desc(reconciliationRuns.createdAt), desc(reconciliationRuns.id))
    .limit(100);
}

function latestReconciliationRuns(context: TenantContext) {
  return sql`WITH latest_reconciliation_runs AS (
    SELECT DISTINCT ON (
      run.outlet_id,
      run.cadence,
      run.reconciled_entry_type,
      run.period_start,
      run.period_end
    )
      run.id,
      run.tenant_id,
      run.outlet_id,
      run.cadence,
      run.reconciled_entry_type,
      run.period_start,
      run.period_end,
      run.source_total_idr,
      run.ledger_total_idr,
      run.variance_idr,
      run.status,
      run.created_at
    FROM reconciliation_runs run
    WHERE run.tenant_id = ${context.tenantId}
    ORDER BY
      run.outlet_id,
      run.cadence,
      run.reconciled_entry_type,
      run.period_start,
      run.period_end,
      run.created_at DESC,
      run.id DESC
  )`;
}

export async function summarizeLatestReconciliationVariances(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<LedgerReconciliationVarianceSummary> {
  requireTenantAdmin(context);
  const latest = latestReconciliationRuns(context);
  const result = await tx.execute<{
    total_signed_variance_idr: number;
    variance_count: number;
  }>(sql`${latest}
    SELECT
      count(*)::int AS variance_count,
      coalesce(sum(variance_idr), 0)::bigint AS total_signed_variance_idr
    FROM latest_reconciliation_runs
    WHERE status = 'VARIANCE'`);
  const varianceCount = Number(result.rows[0]?.variance_count ?? 0);
  const totalSignedVarianceIdr = requireWholeIdr(
    Number(result.rows[0]?.total_signed_variance_idr ?? 0),
    true,
  );
  return { totalSignedVarianceIdr, varianceCount };
}

export async function listLatestReconciliationVariances(
  tx: TenantTransaction,
  context: TenantContext,
  pagination: { limit: number; offset: number },
): Promise<LedgerReconciliationVariancePage> {
  requireTenantAdmin(context);
  requireWorkspacePagination(pagination);
  const latest = latestReconciliationRuns(context);

  const countResult = await tx.execute<{ total_count: number }>(sql`${latest}
    SELECT count(*)::int AS total_count
    FROM latest_reconciliation_runs
    WHERE status = 'VARIANCE'`);
  const totalCount = Number(countResult.rows[0]?.total_count ?? 0);
  if (totalCount === 0) return { rows: [], totalCount };

  const result = await tx.execute<{
    id: string;
    outlet_id: string;
    outlet_name: string;
    cadence: LedgerReconciliationRow["cadence"];
    reconciled_entry_type: LedgerReconciliationRow["reconciledEntryType"];
    period_start: Date;
    period_end: Date;
    source_total_idr: number;
    ledger_total_idr: number;
    variance_idr: number;
    status: LedgerReconciliationRow["status"];
    created_at: Date;
  }>(sql`${latest}
    SELECT
      run.id,
      run.outlet_id,
      outlet.name AS outlet_name,
      run.cadence,
      run.reconciled_entry_type,
      run.period_start,
      run.period_end,
      run.source_total_idr,
      run.ledger_total_idr,
      run.variance_idr,
      run.status,
      run.created_at
    FROM latest_reconciliation_runs run
    INNER JOIN outlets outlet
      ON outlet.id = run.outlet_id
      AND outlet.tenant_id = run.tenant_id
    WHERE run.status = 'VARIANCE'
    ORDER BY run.created_at DESC, run.id DESC
    LIMIT ${pagination.limit}
    OFFSET ${pagination.offset}`);

  return {
    totalCount,
    rows: result.rows.map((row) => ({
      id: row.id,
      outletId: row.outlet_id,
      outletName: row.outlet_name,
      cadence: row.cadence,
      reconciledEntryType: row.reconciled_entry_type,
      periodStart: new Date(row.period_start),
      periodEnd: new Date(row.period_end),
      sourceTotalIdr: Number(row.source_total_idr),
      ledgerTotalIdr: Number(row.ledger_total_idr),
      varianceIdr: Number(row.variance_idr),
      status: row.status,
      createdAt: new Date(row.created_at),
    })),
  };
}

export async function listLedgerEntriesForShipment(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
) {
  requireTenantAdmin(context);
  return tx
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.tenantId, context.tenantId),
        eq(ledgerEntries.shipmentId, shipmentId),
      ),
    )
    .orderBy(ledgerEntries.effectiveAt, ledgerEntries.id);
}

async function requireTenantOutlet(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
) {
  const [outlet] = await tx
    .select({ id: outlets.id })
    .from(outlets)
    .where(
      and(
        eq(outlets.id, outletId),
        eq(outlets.tenantId, context.tenantId),
      ),
    )
    .limit(1);
  if (!outlet) throw new LedgerUnavailableError();
}

async function insertLedgerReconciliation(
  tx: TenantTransaction,
  context: TenantContext,
  input: ReconciliationInput,
  capturedLedgerTotalIdr?: number,
) {
  requireDateRange(input.periodStart, input.periodEnd);
  const sourceTotalIdr = requireWholeIdr(input.sourceTotalIdr);
  const sourceEventId = requireSourceEventId(input.sourceEventId);

  let ledgerTotalIdr: number;
  if (capturedLedgerTotalIdr === undefined) {
    const [totals] = await tx
      .select({ ledgerTotalIdr: adjustedTypeAmount(input.reconciledEntryType) })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.tenantId, context.tenantId),
          eq(ledgerEntries.outletId, input.outletId),
          gte(ledgerEntries.effectiveAt, input.periodStart),
          lt(ledgerEntries.effectiveAt, input.periodEnd),
        ),
      );
    if (!totals) throw new LedgerUnavailableError();
    ledgerTotalIdr = requireWholeIdr(totals.ledgerTotalIdr, true);
  } else {
    ledgerTotalIdr = requireWholeIdr(capturedLedgerTotalIdr, true);
  }
  const varianceIdr = requireWholeIdr(sourceTotalIdr - ledgerTotalIdr, true);
  const [run] = await tx
    .insert(reconciliationRuns)
    .values({
      tenantId: context.tenantId,
      outletId: input.outletId,
      cadence: input.cadence,
      reconciledEntryType: input.reconciledEntryType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currency: "IDR",
      sourceTotalIdr,
      ledgerTotalIdr,
      varianceIdr,
      status: varianceIdr === 0 ? "MATCHED" : "VARIANCE",
      sourceEventId,
      actorUserId: context.userId,
    })
    .returning();
  if (!run) throw new LedgerUnavailableError();

  const [entry] = await tx
    .insert(ledgerEntries)
    .values({
      tenantId: context.tenantId,
      outletId: input.outletId,
      reconciliationRunId: run.id,
      entryType: "RECONCILIATION",
      financialClass: "MEMO",
      amountIdr: varianceIdr,
      currency: "IDR",
      effectiveAt: input.periodEnd,
      sourceEvent: "RECONCILIATION_CLOSED",
      sourceEventId,
      actorType: "USER",
      actorUserId: context.userId,
    })
    .returning();
  if (!entry) throw new LedgerUnavailableError();

  return { run, entry };
}

type LedgerReconciliationCapturedTotals = {
  sourceTotals: LedgerReconciliationSourceTotals;
  ledgerTotals: LedgerReconciliationSourceTotals;
};

async function captureLedgerReconciliationTotals(
  tx: TenantTransaction,
  context: TenantContext,
  input: Pick<
    LedgerReconciliationPeriodInput,
    "outletId" | "periodStart" | "periodEnd"
  >,
): Promise<LedgerReconciliationCapturedTotals> {
  const result = await tx.execute<{
    source_cod_principal: number;
    source_shipping: number;
    source_insurance: number;
    source_cod_revenue: number;
    source_cod_vat: number;
    source_upstream_payment: number;
    ledger_cod_principal: number;
    ledger_shipping: number;
    ledger_insurance: number;
    ledger_cod_revenue: number;
    ledger_cod_vat: number;
    ledger_upstream_payment: number;
  }>(sql`
    WITH issued_source AS (
      SELECT
        coalesce(sum(CASE WHEN provider_order.is_cod
          THEN cod_total.goods_value_idr ELSE 0 END), 0) AS cod_principal,
        coalesce(sum(provider_order.shipping_amount_idr), 0) AS shipping,
        coalesce(sum(coalesce(provider_order.insurance_amount_idr, 0)), 0) AS insurance,
        coalesce(sum(CASE WHEN provider_order.is_cod
          THEN cod_total.service_fee_idr ELSE 0 END), 0) AS cod_revenue,
        coalesce(sum(CASE WHEN provider_order.is_cod
          THEN cod_total.vat_amount_idr ELSE 0 END), 0) AS cod_vat
      FROM provider_order_snapshots provider_order
      INNER JOIN provider_batches batch
        ON batch.id = provider_order.batch_id
        AND batch.tenant_id = provider_order.tenant_id
      LEFT JOIN shipment_cod_totals cod_total
        ON cod_total.shipment_id = provider_order.shipment_id
        AND cod_total.tenant_id = provider_order.tenant_id
      WHERE provider_order.tenant_id = ${context.tenantId}
        AND batch.outlet_id = ${input.outletId}
        AND provider_order.status = 'ISSUED'
        AND provider_order.resolved_at >= ${input.periodStart}
        AND provider_order.resolved_at < ${input.periodEnd}
    ), recovery_source AS (
      SELECT coalesce(sum(
        provider_order.shipping_amount_idr
          + coalesce(provider_order.insurance_amount_idr, 0)
      ), 0) AS upstream_payment
      FROM provider_unpaid_recoveries recovery
      INNER JOIN provider_order_snapshots provider_order
        ON provider_order.id = recovery.provider_order_snapshot_id
        AND provider_order.batch_id = recovery.batch_id
        AND provider_order.tenant_id = recovery.tenant_id
      INNER JOIN provider_batches batch
        ON batch.id = recovery.batch_id
        AND batch.tenant_id = recovery.tenant_id
      WHERE recovery.tenant_id = ${context.tenantId}
        AND batch.outlet_id = ${input.outletId}
        AND recovery.status = 'COMPLETED'
        AND provider_order.status = 'ISSUED'
        AND provider_order.is_cod = false
        AND provider_order.is_paid = true
        AND recovery.completed_at >= ${input.periodStart}
        AND recovery.completed_at < ${input.periodEnd}
    ), ledger_snapshot AS (
      SELECT
        coalesce(sum(CASE
          WHEN entry.entry_type = 'COD_PRINCIPAL_COLLECTABLE'
            OR (entry.entry_type = 'ADJUSTMENT'
              AND original.entry_type = 'COD_PRINCIPAL_COLLECTABLE')
          THEN entry.amount_idr ELSE 0 END), 0) AS cod_principal,
        coalesce(sum(CASE
          WHEN entry.entry_type = 'MENGANTAR_SHIPPING_COST'
            OR (entry.entry_type = 'ADJUSTMENT'
              AND original.entry_type = 'MENGANTAR_SHIPPING_COST')
          THEN entry.amount_idr ELSE 0 END), 0) AS shipping,
        coalesce(sum(CASE
          WHEN entry.entry_type = 'MENGANTAR_INSURANCE_COST'
            OR (entry.entry_type = 'ADJUSTMENT'
              AND original.entry_type = 'MENGANTAR_INSURANCE_COST')
          THEN entry.amount_idr ELSE 0 END), 0) AS insurance,
        coalesce(sum(CASE
          WHEN entry.entry_type = 'GERAICUAN_COD_SERVICE_FEE_REVENUE'
            OR (entry.entry_type = 'ADJUSTMENT'
              AND original.entry_type = 'GERAICUAN_COD_SERVICE_FEE_REVENUE')
          THEN entry.amount_idr ELSE 0 END), 0) AS cod_revenue,
        coalesce(sum(CASE
          WHEN entry.entry_type = 'COD_SERVICE_FEE_VAT_PAYABLE'
            OR (entry.entry_type = 'ADJUSTMENT'
              AND original.entry_type = 'COD_SERVICE_FEE_VAT_PAYABLE')
          THEN entry.amount_idr ELSE 0 END), 0) AS cod_vat,
        coalesce(sum(CASE
          WHEN entry.entry_type = 'NON_COD_UPSTREAM_PAYMENT'
            OR (entry.entry_type = 'ADJUSTMENT'
              AND original.entry_type = 'NON_COD_UPSTREAM_PAYMENT')
          THEN entry.amount_idr ELSE 0 END), 0) AS upstream_payment
      FROM ledger_entries entry
      LEFT JOIN ledger_entries original
        ON original.id = entry.reverses_entry_id
        AND original.tenant_id = entry.tenant_id
      WHERE entry.tenant_id = ${context.tenantId}
        AND entry.outlet_id = ${input.outletId}
        AND entry.effective_at >= ${input.periodStart}
        AND entry.effective_at < ${input.periodEnd}
    )
    SELECT
      issued_source.cod_principal AS source_cod_principal,
      issued_source.shipping AS source_shipping,
      issued_source.insurance AS source_insurance,
      issued_source.cod_revenue AS source_cod_revenue,
      issued_source.cod_vat AS source_cod_vat,
      recovery_source.upstream_payment AS source_upstream_payment,
      ledger_snapshot.cod_principal AS ledger_cod_principal,
      ledger_snapshot.shipping AS ledger_shipping,
      ledger_snapshot.insurance AS ledger_insurance,
      ledger_snapshot.cod_revenue AS ledger_cod_revenue,
      ledger_snapshot.cod_vat AS ledger_cod_vat,
      ledger_snapshot.upstream_payment AS ledger_upstream_payment
    FROM issued_source
    CROSS JOIN recovery_source
    CROSS JOIN ledger_snapshot
  `);
  const row = result.rows[0];
  if (!row) throw new LedgerUnavailableError();

  return {
    sourceTotals: {
      COD_PRINCIPAL_COLLECTABLE: requireWholeIdr(Number(row.source_cod_principal)),
      MENGANTAR_SHIPPING_COST: requireWholeIdr(Number(row.source_shipping)),
      MENGANTAR_INSURANCE_COST: requireWholeIdr(Number(row.source_insurance)),
      GERAICUAN_COD_SERVICE_FEE_REVENUE: requireWholeIdr(Number(row.source_cod_revenue)),
      COD_SERVICE_FEE_VAT_PAYABLE: requireWholeIdr(Number(row.source_cod_vat)),
      NON_COD_UPSTREAM_PAYMENT: requireWholeIdr(Number(row.source_upstream_payment)),
    },
    ledgerTotals: {
      COD_PRINCIPAL_COLLECTABLE: requireWholeIdr(Number(row.ledger_cod_principal), true),
      MENGANTAR_SHIPPING_COST: requireWholeIdr(Number(row.ledger_shipping), true),
      MENGANTAR_INSURANCE_COST: requireWholeIdr(Number(row.ledger_insurance), true),
      GERAICUAN_COD_SERVICE_FEE_REVENUE: requireWholeIdr(Number(row.ledger_cod_revenue), true),
      COD_SERVICE_FEE_VAT_PAYABLE: requireWholeIdr(Number(row.ledger_cod_vat), true),
      NON_COD_UPSTREAM_PAYMENT: requireWholeIdr(Number(row.ledger_upstream_payment), true),
    },
  };
}

export async function recordLedgerReconciliation(
  tx: TenantTransaction,
  context: TenantContext,
  input: ReconciliationInput,
) {
  requireTenantAdmin(context);
  await requireTenantOutlet(tx, context, input.outletId);
  return insertLedgerReconciliation(tx, context, input);
}

function reconciliationSourceEventId(
  attemptId: string,
  entryType: LedgerReconciliationSourceType,
) {
  return `reconciliation:${attemptId}:${entryType}`;
}

async function loadLedgerReconciliationReplay(
  tx: TenantTransaction,
  context: TenantContext,
  input: LedgerReconciliationPeriodInput,
) {
  const expectedSourceIds = LEDGER_RECONCILIATION_SOURCE_TYPES.map((entryType) =>
    reconciliationSourceEventId(input.attemptId, entryType)
  );
  const runs = await tx
    .select()
    .from(reconciliationRuns)
    .where(
      and(
        eq(reconciliationRuns.tenantId, context.tenantId),
        inArray(reconciliationRuns.sourceEventId, expectedSourceIds),
      ),
    );
  if (runs.length === 0) return null;
  if (runs.length !== LEDGER_RECONCILIATION_SOURCE_TYPES.length) {
    throw new LedgerUnavailableError();
  }

  const runByType = new Map(
    runs.map((run) => [run.reconciledEntryType, run]),
  );
  const orderedRuns = LEDGER_RECONCILIATION_SOURCE_TYPES.map((entryType) => {
    const run = runByType.get(entryType);
    if (
      !run
      || run.actorUserId !== context.userId
      || run.outletId !== input.outletId
      || run.cadence !== input.cadence
      || run.periodStart.getTime() !== input.periodStart.getTime()
      || run.periodEnd.getTime() !== input.periodEnd.getTime()
      || run.sourceEventId !== reconciliationSourceEventId(
        input.attemptId,
        entryType,
      )
    ) {
      throw new LedgerUnavailableError();
    }
    return run;
  });

  const entries = await tx
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.tenantId, context.tenantId),
        inArray(
          ledgerEntries.reconciliationRunId,
          orderedRuns.map((run) => run.id),
        ),
      ),
    );
  if (entries.length !== LEDGER_RECONCILIATION_SOURCE_TYPES.length) {
    throw new LedgerUnavailableError();
  }
  const entryByRunId = new Map(
    entries.map((entry) => [entry.reconciliationRunId, entry]),
  );
  const reconciliations = orderedRuns.map((run) => {
    const entry = entryByRunId.get(run.id);
    if (
      !entry
      || entry.entryType !== "RECONCILIATION"
      || entry.financialClass !== "MEMO"
      || entry.sourceEvent !== "RECONCILIATION_CLOSED"
      || entry.sourceEventId !== run.sourceEventId
      || entry.actorType !== "USER"
      || entry.actorUserId !== context.userId
      || entry.amountIdr !== run.varianceIdr
      || entry.effectiveAt.getTime() !== run.periodEnd.getTime()
    ) {
      throw new LedgerUnavailableError();
    }
    return { run, entry };
  });

  return {
    sourceTotals: Object.fromEntries(
      orderedRuns.map((run) => [
        run.reconciledEntryType,
        run.sourceTotalIdr,
      ]),
    ) as LedgerReconciliationSourceTotals,
    reconciliations,
  };
}

export async function reconcileLedgerPeriod(
  tx: TenantTransaction,
  context: TenantContext,
  input: LedgerReconciliationPeriodInput,
) {
  requireTenantAdmin(context);
  requireDateRange(input.periodStart, input.periodEnd);
  requireAttemptId(input.attemptId);
  if (input.cadence !== "DAILY" && input.cadence !== "MONTHLY") {
    throw new LedgerUnavailableError();
  }

  const preflight = await loadLedgerReconciliationReplay(tx, context, input);
  if (preflight) return preflight;

  const lockedOutlet = await tx.execute<{ id: string }>(sql`
    SELECT id
    FROM ${outlets}
    WHERE id = ${input.outletId}
      AND tenant_id = ${context.tenantId}
    FOR UPDATE
  `);
  if (lockedOutlet.rows.length !== 1) throw new LedgerUnavailableError();

  const replayAfterLock = await loadLedgerReconciliationReplay(
    tx,
    context,
    input,
  );
  if (replayAfterLock) return replayAfterLock;

  const captured = await captureLedgerReconciliationTotals(tx, context, input);
  const reconciliations = [];

  for (const reconciledEntryType of LEDGER_RECONCILIATION_SOURCE_TYPES) {
    reconciliations.push(
      await insertLedgerReconciliation(tx, context, {
        outletId: input.outletId,
        cadence: input.cadence,
        reconciledEntryType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        sourceTotalIdr: captured.sourceTotals[reconciledEntryType],
        sourceEventId: reconciliationSourceEventId(
          input.attemptId,
          reconciledEntryType,
        ),
      }, captured.ledgerTotals[reconciledEntryType]),
    );
  }

  return { sourceTotals: captured.sourceTotals, reconciliations };
}
