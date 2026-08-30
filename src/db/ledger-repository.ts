import "server-only";

import { and, eq, gte, lt, sql } from "drizzle-orm";

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

export async function appendLedgerAdjustment(
  tx: TenantTransaction,
  context: TenantContext,
  reversesEntryId: string,
  effectiveAt = new Date(),
) {
  requireTenantAdmin(context);
  if (!Number.isFinite(effectiveAt.getTime())) throw new LedgerUnavailableError();

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

  const [adjustment] = await tx
    .insert(ledgerEntries)
    .values({
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
    .returning();

  if (!adjustment) throw new LedgerUnavailableError();
  return adjustment;
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

export async function recordLedgerReconciliation(
  tx: TenantTransaction,
  context: TenantContext,
  input: ReconciliationInput,
) {
  requireTenantAdmin(context);
  requireDateRange(input.periodStart, input.periodEnd);
  const sourceTotalIdr = requireWholeIdr(input.sourceTotalIdr);
  const sourceEventId = requireSourceEventId(input.sourceEventId);

  const [outlet] = await tx
    .select({ id: outlets.id })
    .from(outlets)
    .where(
      and(
        eq(outlets.id, input.outletId),
        eq(outlets.tenantId, context.tenantId),
      ),
    )
    .limit(1);
  if (!outlet) throw new LedgerUnavailableError();

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

  const ledgerTotalIdr = requireWholeIdr(totals.ledgerTotalIdr, true);
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
