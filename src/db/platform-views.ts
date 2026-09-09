import "server-only";

import {
  bigint,
  boolean,
  pgView,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import {
  estimateCredentialSources,
  identityStatuses,
  ledgerEntryTypes,
  ledgerFinancialClasses,
  membershipRoles,
  providerBatchStatuses,
  providerOrderStatuses,
  providerUnpaidRecoveryStatuses,
  reconciliationCadences,
  reconciliationStatuses,
  shipmentStatuses,
  tenantStatuses,
} from "@/db/schema";

export const platformMonitoringTenant = pgView("platform_monitoring_tenant", {
  id: uuid("id").notNull(),
  name: text("name").notNull(),
  status: text("status", { enum: tenantStatuses }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}).existing();

export const platformMonitoringOutlet = pgView("platform_monitoring_outlet", {
  id: uuid("id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  hasPickup: boolean("has_pickup").notNull(),
  hasOrigin: boolean("has_origin").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}).existing();

export const platformMonitoringMembership = pgView(
  "platform_monitoring_membership",
  {
    tenantId: uuid("tenant_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: membershipRoles }).notNull(),
    status: text("status", { enum: identityStatuses }).notNull(),
  },
).existing();

export const platformMonitoringShipment = pgView(
  "platform_monitoring_shipment",
  {
    id: uuid("id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    status: text("status", { enum: shipmentStatuses }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
).existing();

export const platformMonitoringEstimate = pgView("platform_monitoring_estimate", {
  id: uuid("id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  outletId: uuid("outlet_id").notNull(),
  shipmentId: uuid("shipment_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}).existing();

export const platformMonitoringProviderBatch = pgView(
  "platform_monitoring_provider_batch",
  {
    id: uuid("id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    courier: text("courier").notNull(),
    credentialSource: text("credential_source", {
      enum: estimateCredentialSources,
    }).notNull(),
    status: text("status", { enum: providerBatchStatuses }).notNull(),
    safeErrorCode: text("safe_error_code"),
    submissionAttemptedAt: timestamp("submission_attempted_at", {
      withTimezone: true,
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    providerAccountBucket: bigint("provider_account_bucket", {
      mode: "number",
    }).notNull(),
  },
).existing();

export const platformMonitoringProviderOrder = pgView(
  "platform_monitoring_provider_order",
  {
    id: uuid("id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    status: text("status", { enum: providerOrderStatuses }).notNull(),
    isCod: boolean("is_cod").notNull(),
    isPaid: boolean("is_paid"),
    safeResponseCode: text("safe_response_code"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
).existing();

export const platformMonitoringUnpaidRecovery = pgView(
  "platform_monitoring_unpaid_recovery",
  {
    id: uuid("id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    providerOrderSnapshotId: uuid("provider_order_snapshot_id").notNull(),
    status: text("status", {
      enum: providerUnpaidRecoveryStatuses,
    }).notNull(),
    safeResponseCode: text("safe_response_code"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
).existing();

export const platformMonitoringConnectionHealth = pgView(
  "platform_monitoring_connection_health",
  {
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
).existing();

export const platformMonitoringAuditEvent = pgView(
  "platform_monitoring_audit_event",
  {
    id: uuid("id").notNull(),
    actorId: text("actor_id"),
    actorRole: text("actor_role", {
      enum: ["SUPER_ADMIN", "TENANT_MEMBER"],
    }),
    tenantId: uuid("tenant_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    outcome: text("outcome", { enum: ["SUCCESS", "DENIED"] }).notNull(),
    fromStatus: text("from_status", { enum: tenantStatuses }),
    toStatus: text("to_status", { enum: tenantStatuses }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
).existing();

export const platformMonitoringLedgerHourly = pgView(
  "platform_monitoring_ledger_hourly",
  {
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    effectiveHour: timestamp("effective_hour", { withTimezone: true }).notNull(),
    entryType: text("entry_type", { enum: ledgerEntryTypes }).notNull(),
    financialClass: text("financial_class", {
      enum: ledgerFinancialClasses,
    }).notNull(),
    entryCount: bigint("entry_count", { mode: "number" }).notNull(),
    amountIdr: bigint("amount_idr", { mode: "number" }).notNull(),
  },
).existing();

export const platformMonitoringReconciliationLatest = pgView(
  "platform_monitoring_reconciliation_latest",
  {
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    cadence: text("cadence", { enum: reconciliationCadences }).notNull(),
    reconciledEntryType: text("reconciled_entry_type", {
      enum: ledgerEntryTypes,
    }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    sourceTotalIdr: bigint("source_total_idr", { mode: "number" }).notNull(),
    ledgerTotalIdr: bigint("ledger_total_idr", { mode: "number" }).notNull(),
    varianceIdr: bigint("variance_idr", { mode: "number" }).notNull(),
    status: text("status", { enum: reconciliationStatuses }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
).existing();
