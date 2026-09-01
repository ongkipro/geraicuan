import "server-only";

import { sql } from "drizzle-orm";

import type { PlatformTransaction } from "@/db/platform-context";
import {
  platformMonitoringLedgerHourly,
  platformMonitoringReconciliationLatest,
} from "@/db/platform-views";
import type { PlatformFilters } from "@/lib/platform-monitoring-filters";

export type PlatformTenantLedgerSummary = {
  entryCount: number;
  codPrincipalLiabilityIdr: number;
  providerCostIdr: number;
  revenueIdr: number;
  vatPayableIdr: number;
  upstreamRecoveryPaymentIdr: number;
};

export type PlatformTenantReconciliationSummary = {
  cadence: "DAILY" | "MONTHLY";
  reconciledEntryType: string;
  periodStart: Date;
  periodEnd: Date;
  sourceTotalIdr: number;
  ledgerTotalIdr: number;
  varianceIdr: number;
  status: "MATCHED" | "VARIANCE";
  createdAt: Date;
};

export type PlatformTenantFinanceSummary = {
  ledger: PlatformTenantLedgerSummary;
  reconciliations: PlatformTenantReconciliationSummary[];
};

const asNumber = (value: unknown) => Number(value ?? 0);
const asDate = (value: unknown) =>
  value instanceof Date ? value : new Date(String(value));

export async function readPlatformTenantFinanceSummary(
  tx: PlatformTransaction,
  filters: PlatformFilters,
): Promise<PlatformTenantFinanceSummary> {
  if (filters.scope.kind !== "tenant") {
    throw new TypeError("A tenant scope is required for platform finance summaries.");
  }

  const tenantId = filters.scope.tenantId;
  const outletPredicate = filters.outletId
    ? sql`AND ledger.outlet_id = ${filters.outletId}::uuid`
    : sql``;
  const reconciliationOutletPredicate = filters.outletId
    ? sql`AND run.outlet_id = ${filters.outletId}::uuid`
    : sql``;

  const ledgerResult = await tx.execute<Record<string, unknown>>(sql`
    SELECT
      coalesce(sum(ledger.entry_count), 0)::text AS entry_count,
      coalesce(sum(ledger.amount_idr) FILTER (
        WHERE ledger.entry_type = 'COD_PRINCIPAL_COLLECTABLE'
      ), 0)::text AS cod_principal,
      coalesce(sum(ledger.amount_idr) FILTER (
        WHERE ledger.financial_class = 'EXPENSE'
      ), 0)::text AS provider_cost,
      coalesce(sum(ledger.amount_idr) FILTER (
        WHERE ledger.financial_class = 'REVENUE'
      ), 0)::text AS revenue,
      coalesce(sum(ledger.amount_idr) FILTER (
        WHERE ledger.entry_type = 'COD_SERVICE_FEE_VAT_PAYABLE'
      ), 0)::text AS vat_payable,
      coalesce(sum(ledger.amount_idr) FILTER (
        WHERE ledger.entry_type = 'NON_COD_UPSTREAM_PAYMENT'
      ), 0)::text AS upstream_recovery
    FROM ${platformMonitoringLedgerHourly} ledger
    WHERE ledger.tenant_id = ${tenantId}::uuid
      AND ledger.effective_hour >= ${filters.range.startInclusive}
      AND ledger.effective_hour < ${filters.range.endExclusive}
      ${outletPredicate}
  `);
  const ledger = ledgerResult.rows[0] ?? {};

  const reconciliationResult = await tx.execute<Record<string, unknown>>(sql`
    SELECT
      run.cadence,
      run.reconciled_entry_type,
      run.period_start,
      run.period_end,
      run.source_total_idr,
      run.ledger_total_idr,
      run.variance_idr,
      run.status,
      run.created_at
    FROM ${platformMonitoringReconciliationLatest} run
    WHERE run.tenant_id = ${tenantId}::uuid
      AND run.period_start >= ${filters.range.startInclusive}
      AND run.period_end <= ${filters.range.endExclusive}
      ${reconciliationOutletPredicate}
    ORDER BY run.created_at DESC, run.period_end DESC, run.reconciled_entry_type
    LIMIT 50
  `);

  return {
    ledger: {
      entryCount: asNumber(ledger.entry_count),
      codPrincipalLiabilityIdr: asNumber(ledger.cod_principal),
      providerCostIdr: asNumber(ledger.provider_cost),
      revenueIdr: asNumber(ledger.revenue),
      vatPayableIdr: asNumber(ledger.vat_payable),
      upstreamRecoveryPaymentIdr: asNumber(ledger.upstream_recovery),
    },
    reconciliations: reconciliationResult.rows.map((row) => ({
      cadence: row.cadence as PlatformTenantReconciliationSummary["cadence"],
      reconciledEntryType: String(row.reconciled_entry_type),
      periodStart: asDate(row.period_start),
      periodEnd: asDate(row.period_end),
      sourceTotalIdr: asNumber(row.source_total_idr),
      ledgerTotalIdr: asNumber(row.ledger_total_idr),
      varianceIdr: asNumber(row.variance_idr),
      status: row.status as PlatformTenantReconciliationSummary["status"],
      createdAt: asDate(row.created_at),
    })),
  };
}
