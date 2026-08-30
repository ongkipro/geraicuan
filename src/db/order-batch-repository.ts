import "server-only";

import { createHash } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { appendLedgerForIssuedProviderOrder } from "@/db/ledger-repository";
import {
  providerBatches,
  providerOrderSnapshots,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

export type OrderConfirmation = {
  shipmentId: string;
  estimateSnapshotId: string;
  estimateServiceId: string;
};

export type ProviderOrderSource = {
  shipmentId: string;
  pickupAddressId: string;
  courier: string;
  providerService: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  destinationAreaId: string;
  packageContent: string;
  weightGrams: number;
  quantity: number;
  declaredValueIdr: number;
  isCod: boolean;
  providerCodAmountIdr: number | null;
};

export type ProviderBatchScope = {
  tenantId: string;
  outletId: string;
  pickupAddressId: string;
  courier: string;
  credentialSource: (typeof providerBatches.$inferSelect)["credentialSource"];
};

export type ProviderAccountKeyResolver = (
  scope: Readonly<ProviderBatchScope>,
) => Promise<string>;

export type PreparedProviderBatch = ProviderBatchScope & {
  id: string;
  created: boolean;
  status: (typeof providerBatches.$inferSelect)["status"];
  providerAccountKey: string;
  orders: ProviderOrderSource[];
};

export type ProviderOrderResult = {
  shipmentId: string;
  providerOrderId: string;
  isPaid: boolean;
  cnoteNo: string | null;
};

export class OrderBatchUnavailableError extends Error {
  constructor() {
    super("Provider order confirmation is unavailable.");
  }
}

export function deriveProviderAccountKey(accountIdentity: string): string {
  if (!accountIdentity.trim()) throw new OrderBatchUnavailableError();
  return createHash("sha256").update(accountIdentity, "utf8").digest("hex");
}

export function providerCourierFromService(providerService: string): string {
  const normalized = providerService.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.startsWith("SICEPAT")) return "SiCepat";
  if (normalized.startsWith("NINJA")) return "Ninja";
  if (normalized.startsWith("JT")) return "JT";
  if (normalized.startsWith("JNE")) return "JNE";
  if (normalized.startsWith("SAP")) return "SAP";
  if (!normalized) throw new OrderBatchUnavailableError();
  return providerService.trim();
}

export function requiresProviderAccountSerialization(courier: string): boolean {
  return ["JT", "Ninja", "SiCepat"].includes(providerCourierFromService(courier));
}

type SelectedOrderRow = {
  shipmentId: string;
  outletId: string;
  pickupAddressId: string;
  estimateSnapshotId: string;
  estimateServiceId: string;
  credentialSource: "private" | "platform_default";
  providerService: string;
  currency: "IDR";
  shippingAmountIdr: number;
  insuranceAmountIdr: number | null;
  destinationAreaId: string;
  packageContent: string;
  weightGrams: number;
  quantity: number;
  declaredValueIdr: number;
  isCod: boolean;
  providerCodAmountIdr: number | null;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
};

function idempotencyKey(
  tenantId: string,
  outletId: string,
  pickupAddressId: string,
  courier: string,
  credentialSource: ProviderBatchScope["credentialSource"],
  providerAccountKey: string,
  rows: readonly SelectedOrderRow[],
) {
  const canonical = {
    tenantId,
    outletId,
    pickupAddressId,
    courier,
    credentialSource,
    providerAccountKey,
    selections: rows
      .map((row) => ({
        shipmentId: row.shipmentId,
        estimateSnapshotId: row.estimateSnapshotId,
        estimateServiceId: row.estimateServiceId,
        providerService: row.providerService,
      }))
      .sort((left, right) => left.shipmentId.localeCompare(right.shipmentId)),
  };
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

async function loadAndLockSelections(
  tx: TenantTransaction,
  context: TenantContext,
  confirmations: readonly OrderConfirmation[],
): Promise<SelectedOrderRow[]> {
  const canonical = confirmations
    .map((confirmation) => ({
      shipmentId: confirmation.shipmentId,
      estimateSnapshotId: confirmation.estimateSnapshotId,
      estimateServiceId: confirmation.estimateServiceId,
    }))
    .sort((left, right) => left.shipmentId.localeCompare(right.shipmentId));

  if (
    canonical.length === 0 ||
    new Set(canonical.map((item) => item.shipmentId)).size !== canonical.length
  ) {
    throw new OrderBatchUnavailableError();
  }

  const selected = await tx.execute<SelectedOrderRow>(sql`
    WITH requested AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(canonical)}::jsonb) AS item(
        "shipmentId" uuid,
        "estimateSnapshotId" uuid,
        "estimateServiceId" uuid
      )
    )
    SELECT
      shipment.id AS "shipmentId",
      shipment.outlet_id AS "outletId",
      outlet.default_pickup_address_id AS "pickupAddressId",
      estimate.id AS "estimateSnapshotId",
      service.id AS "estimateServiceId",
      estimate.credential_source AS "credentialSource",
      service.provider_service AS "providerService",
      service.currency AS "currency",
      service.shipping_amount_idr AS "shippingAmountIdr",
      service.insurance_amount_idr AS "insuranceAmountIdr",
      draft.destination_area_id AS "destinationAreaId",
      draft.package_content AS "packageContent",
      draft.package_weight_grams AS "weightGrams",
      draft.package_quantity AS "quantity",
      draft.declared_value_idr AS "declaredValueIdr",
      draft.is_cod AS "isCod",
      cod.provider_cod_amount_idr AS "providerCodAmountIdr",
      sender.name AS "senderName",
      sender.phone AS "senderPhone",
      sender.address AS "senderAddress",
      recipient.name AS "recipientName",
      recipient.phone AS "recipientPhone",
      recipient.address AS "recipientAddress"
    FROM requested
    JOIN shipments AS shipment
      ON shipment.id = requested."shipmentId"
      AND shipment.tenant_id = ${context.tenantId}
      AND shipment.status = 'ESTIMATED'
    JOIN outlets AS outlet
      ON outlet.id = shipment.outlet_id
      AND outlet.tenant_id = shipment.tenant_id
      AND outlet.default_pickup_address_id IS NOT NULL
      AND outlet.default_origin_area_id IS NOT NULL
    JOIN shipment_drafts AS draft
      ON draft.shipment_id = shipment.id
      AND draft.tenant_id = shipment.tenant_id
    JOIN shipment_estimate_snapshots AS estimate
      ON estimate.id = requested."estimateSnapshotId"
      AND estimate.shipment_id = shipment.id
      AND estimate.outlet_id = shipment.outlet_id
      AND estimate.tenant_id = shipment.tenant_id
      AND estimate.origin_area_id = outlet.default_origin_area_id
      AND estimate.destination_area_id = draft.destination_area_id
      AND estimate.weight_grams = draft.package_weight_grams
      AND estimate.is_cod_requested = draft.is_cod
      AND NOT EXISTS (
        SELECT 1
        FROM shipment_estimate_snapshots AS newer
        WHERE newer.shipment_id = estimate.shipment_id
          AND newer.tenant_id = estimate.tenant_id
          AND (
            newer.retrieved_at > estimate.retrieved_at
            OR (newer.retrieved_at = estimate.retrieved_at AND newer.id > estimate.id)
          )
      )
    JOIN shipment_estimate_services AS service
      ON service.id = requested."estimateServiceId"
      AND service.snapshot_id = estimate.id
      AND service.tenant_id = estimate.tenant_id
      AND service.currency = 'IDR'
      AND (NOT draft.is_cod OR service.cod_eligible)
    LEFT JOIN shipment_cod_totals AS cod
      ON cod.shipment_id = shipment.id
      AND cod.snapshot_id = estimate.id
      AND cod.estimate_service_id = service.id
      AND cod.tenant_id = shipment.tenant_id
    JOIN shipment_parties AS sender
      ON sender.shipment_id = shipment.id
      AND sender.tenant_id = shipment.tenant_id
      AND sender.role = 'SENDER'
    JOIN shipment_parties AS recipient
      ON recipient.shipment_id = shipment.id
      AND recipient.tenant_id = shipment.tenant_id
      AND recipient.role = 'RECIPIENT'
    WHERE NOT draft.is_cod OR cod.id IS NOT NULL
    ORDER BY shipment.id
    FOR UPDATE OF shipment
  `);

  if (selected.rows.length !== canonical.length) throw new OrderBatchUnavailableError();
  return selected.rows;
}

type ExistingConfirmationRow = {
  batchId: string;
  status: (typeof providerBatches.$inferSelect)["status"];
  outletId: string;
  pickupAddressId: string;
  courier: string;
  credentialSource: (typeof providerBatches.$inferSelect)["credentialSource"];
  providerAccountKey: string;
};

async function loadExistingConfirmationBatches(
  tx: TenantTransaction,
  context: TenantContext,
  confirmations: readonly OrderConfirmation[],
): Promise<PreparedProviderBatch[] | null> {
  if (confirmations.length === 0) return null;
  const requested = confirmations.map((confirmation) => ({
    shipmentId: confirmation.shipmentId,
    estimateSnapshotId: confirmation.estimateSnapshotId,
    estimateServiceId: confirmation.estimateServiceId,
  }));
  const existing = await tx.execute<ExistingConfirmationRow>(sql`
    WITH requested AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(requested)}::jsonb) AS item(
        "shipmentId" uuid,
        "estimateSnapshotId" uuid,
        "estimateServiceId" uuid
      )
    )
    SELECT
      batch.id AS "batchId",
      batch.status,
      batch.outlet_id AS "outletId",
      batch.pickup_address_id AS "pickupAddressId",
      batch.courier,
      batch.credential_source AS "credentialSource",
      batch.provider_account_key AS "providerAccountKey"
    FROM requested
    JOIN provider_order_snapshots AS provider_order
      ON provider_order.shipment_id = requested."shipmentId"
      AND provider_order.estimate_snapshot_id = requested."estimateSnapshotId"
      AND provider_order.estimate_service_id = requested."estimateServiceId"
      AND provider_order.tenant_id = ${context.tenantId}
    JOIN provider_batches AS batch
      ON batch.id = provider_order.batch_id
      AND batch.tenant_id = provider_order.tenant_id
  `);
  if (existing.rows.length === 0) return null;
  if (existing.rows.length !== confirmations.length) throw new OrderBatchUnavailableError();

  const batches = new Map<string, ExistingConfirmationRow>();
  for (const row of existing.rows) batches.set(row.batchId, row);
  return [...batches.values()].map((batch) => ({
    id: batch.batchId,
    created: false,
    status: batch.status,
    tenantId: context.tenantId,
    outletId: batch.outletId,
    pickupAddressId: batch.pickupAddressId,
    courier: batch.courier,
    credentialSource: batch.credentialSource,
    providerAccountKey: batch.providerAccountKey,
    orders: [],
  }));
}

export async function prepareProviderBatches(
  tx: TenantTransaction,
  context: TenantContext,
  confirmations: readonly OrderConfirmation[],
  resolveProviderAccountKey: ProviderAccountKeyResolver,
): Promise<PreparedProviderBatch[]> {
  const existing = await loadExistingConfirmationBatches(tx, context, confirmations);
  if (existing) return existing;
  const selected = await loadAndLockSelections(tx, context, confirmations);
  const groups = new Map<string, SelectedOrderRow[]>();

  for (const row of selected) {
    const courier = providerCourierFromService(row.providerService);
    const groupKey = JSON.stringify([
      row.outletId,
      row.pickupAddressId,
      courier,
      row.credentialSource,
    ]);
    const group = groups.get(groupKey);
    if (group) group.push(row);
    else groups.set(groupKey, [row]);
  }

  const prepared: PreparedProviderBatch[] = [];
  for (const rows of groups.values()) {
    rows.sort((left, right) => left.shipmentId.localeCompare(right.shipmentId));
    const first = rows[0]!;
    const courier = providerCourierFromService(first.providerService);
    const scope: ProviderBatchScope = {
      tenantId: context.tenantId,
      outletId: first.outletId,
      pickupAddressId: first.pickupAddressId,
      courier,
      credentialSource: first.credentialSource,
    };
    const providerAccountKey = await resolveProviderAccountKey(scope);
    if (!/^[0-9a-f]{64}$/.test(providerAccountKey)) {
      throw new OrderBatchUnavailableError();
    }
    const digest = idempotencyKey(
      context.tenantId,
      first.outletId,
      first.pickupAddressId,
      courier,
      first.credentialSource,
      providerAccountKey,
      rows,
    );

    const inserted = await tx
      .insert(providerBatches)
      .values({
        tenantId: context.tenantId,
        outletId: first.outletId,
        pickupAddressId: first.pickupAddressId,
        courier,
        credentialSource: first.credentialSource,
        providerAccountKey,
        idempotencyKey: digest,
      })
      .onConflictDoNothing({
        target: [providerBatches.tenantId, providerBatches.idempotencyKey],
      })
      .returning({ id: providerBatches.id, status: providerBatches.status });

    const created = inserted[0];
    if (!created) {
      const existing = await tx
        .select({
          id: providerBatches.id,
          status: providerBatches.status,
          outletId: providerBatches.outletId,
          pickupAddressId: providerBatches.pickupAddressId,
          courier: providerBatches.courier,
          credentialSource: providerBatches.credentialSource,
          providerAccountKey: providerBatches.providerAccountKey,
        })
        .from(providerBatches)
        .where(
          and(
            eq(providerBatches.tenantId, context.tenantId),
            eq(providerBatches.idempotencyKey, digest),
          ),
        )
        .limit(1);
      if (
        !existing[0]
        || existing[0].outletId !== scope.outletId
        || existing[0].pickupAddressId !== scope.pickupAddressId
        || existing[0].courier !== scope.courier
        || existing[0].credentialSource !== scope.credentialSource
        || existing[0].providerAccountKey !== providerAccountKey
      ) {
        throw new OrderBatchUnavailableError();
      }
      prepared.push({
        id: existing[0].id,
        created: false,
        status: existing[0].status,
        ...scope,
        providerAccountKey,
        orders: [],
      });
      continue;
    }

    await tx.insert(providerOrderSnapshots).values(
      rows.map((row, position) => ({
        tenantId: context.tenantId,
        batchId: created.id,
        shipmentId: row.shipmentId,
        estimateSnapshotId: row.estimateSnapshotId,
        estimateServiceId: row.estimateServiceId,
        position,
        providerService: row.providerService,
        currency: row.currency,
        shippingAmountIdr: row.shippingAmountIdr,
        insuranceAmountIdr: row.insuranceAmountIdr,
        isCod: row.isCod,
        providerCodAmountIdr: row.providerCodAmountIdr,
      })),
    );

    await tx
      .update(shipments)
      .set({ status: "SUBMISSION_QUEUED", updatedAt: sql`now()` })
      .where(
        and(
          eq(shipments.tenantId, context.tenantId),
          eq(shipments.status, "ESTIMATED"),
          inArray(shipments.id, rows.map((row) => row.shipmentId)),
        ),
      );

    prepared.push({
      id: created.id,
      created: true,
      status: created.status,
      ...scope,
      providerAccountKey,
      orders: rows.map((row) => ({
        shipmentId: row.shipmentId,
        pickupAddressId: row.pickupAddressId,
        courier,
        providerService: row.providerService,
        senderName: row.senderName,
        senderPhone: row.senderPhone,
        senderAddress: row.senderAddress,
        recipientName: row.recipientName,
        recipientPhone: row.recipientPhone,
        recipientAddress: row.recipientAddress,
        destinationAreaId: row.destinationAreaId,
        packageContent: row.packageContent,
        weightGrams: row.weightGrams,
        quantity: row.quantity,
        declaredValueIdr: row.declaredValueIdr,
        isCod: row.isCod,
        providerCodAmountIdr: row.providerCodAmountIdr,
      })),
    });
  }

  return prepared;
}

export async function claimProviderBatch(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
): Promise<boolean> {
  const claimed = await tx
    .update(providerBatches)
    .set({
      status: "SUBMITTING",
      submissionAttemptedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(providerBatches.id, batchId),
        eq(providerBatches.tenantId, context.tenantId),
        eq(providerBatches.status, "SUBMISSION_QUEUED"),
      ),
    )
    .returning({ id: providerBatches.id });
  return claimed.length === 1;
}

async function queuedBatchShipmentIds(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
) {
  return tx
    .select({ shipmentId: providerOrderSnapshots.shipmentId })
    .from(providerOrderSnapshots)
    .where(
      and(
        eq(providerOrderSnapshots.batchId, batchId),
        eq(providerOrderSnapshots.tenantId, context.tenantId),
        eq(providerOrderSnapshots.status, "SUBMISSION_QUEUED"),
      ),
    )
    .orderBy(asc(providerOrderSnapshots.position));
}

export async function markProviderBatchUnknown(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
  safeErrorCode: string,
) {
  const batch = await tx
    .update(providerBatches)
    .set({ status: "SUBMISSION_UNKNOWN", safeErrorCode, updatedAt: sql`now()` })
    .where(
      and(
        eq(providerBatches.id, batchId),
        eq(providerBatches.tenantId, context.tenantId),
        eq(providerBatches.status, "SUBMITTING"),
      ),
    )
    .returning({ id: providerBatches.id });
  if (batch.length !== 1) throw new OrderBatchUnavailableError();

  const unresolvedMembers = await queuedBatchShipmentIds(tx, context, batchId);
  await tx
    .update(providerOrderSnapshots)
    .set({
      status: "SUBMISSION_UNKNOWN",
      safeResponseCode: safeErrorCode,
      resolvedAt: sql`now()`,
    })
    .where(
      and(
        eq(providerOrderSnapshots.batchId, batchId),
        eq(providerOrderSnapshots.tenantId, context.tenantId),
        eq(providerOrderSnapshots.status, "SUBMISSION_QUEUED"),
      ),
    );
  if (unresolvedMembers.length > 0) {
    await tx
      .update(shipments)
      .set({ status: "SUBMISSION_UNKNOWN", updatedAt: sql`now()` })
      .where(
        and(
          eq(shipments.tenantId, context.tenantId),
          eq(shipments.status, "SUBMISSION_QUEUED"),
          inArray(shipments.id, unresolvedMembers.map((member) => member.shipmentId)),
        ),
      );
  }
}

export async function completeProviderOrder(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
  result: ProviderOrderResult,
) {
  const [batch] = await tx
    .select({ status: providerBatches.status })
    .from(providerBatches)
    .where(
      and(
        eq(providerBatches.id, batchId),
        eq(providerBatches.tenantId, context.tenantId),
      ),
    )
    .limit(1);
  if (batch?.status !== "SUBMITTING") throw new OrderBatchUnavailableError();

  const orders = await tx
    .select({
      id: providerOrderSnapshots.id,
      shipmentId: providerOrderSnapshots.shipmentId,
      isCod: providerOrderSnapshots.isCod,
      status: providerOrderSnapshots.status,
      providerOrderId: providerOrderSnapshots.providerOrderId,
    })
    .from(providerOrderSnapshots)
    .where(
      and(
        eq(providerOrderSnapshots.batchId, batchId),
        eq(providerOrderSnapshots.tenantId, context.tenantId),
      ),
    );
  const order = orders.find((candidate) => candidate.shipmentId === result.shipmentId);
  const providerOrderId = result.providerOrderId.trim();
  if (
    !order
    || order.status !== "SUBMISSION_QUEUED"
    || !providerOrderId
    || orders.some(
      (candidate) =>
        candidate.id !== order.id
        && candidate.providerOrderId?.trim() === providerOrderId,
    )
  ) {
    throw new OrderBatchUnavailableError();
  }

  const cnoteNo = result.cnoteNo?.trim() || null;
  const status = cnoteNo
    ? "ISSUED"
    : !order.isCod && result.isPaid === false
      ? "AWAITING_UPSTREAM_PAYMENT"
      : null;
  if (!status) throw new OrderBatchUnavailableError();

  const completedOrder = await tx
    .update(providerOrderSnapshots)
    .set({
      status,
      providerOrderId,
      isPaid: result.isPaid,
      cnoteNo,
      safeResponseCode: "ORDER_ACCEPTED",
      resolvedAt: sql`now()`,
    })
    .where(
      and(
        eq(providerOrderSnapshots.id, order.id),
        eq(providerOrderSnapshots.tenantId, context.tenantId),
        eq(providerOrderSnapshots.status, "SUBMISSION_QUEUED"),
      ),
    )
    .returning({ id: providerOrderSnapshots.id });
  if (completedOrder.length !== 1) throw new OrderBatchUnavailableError();

  const completedShipment = await tx
    .update(shipments)
    .set({ status, updatedAt: sql`now()` })
    .where(
      and(
        eq(shipments.id, order.shipmentId),
        eq(shipments.tenantId, context.tenantId),
        eq(shipments.status, "SUBMISSION_QUEUED"),
      ),
    )
    .returning({ id: shipments.id });
  if (completedShipment.length !== 1) throw new OrderBatchUnavailableError();
  if (status === "ISSUED") {
    await appendLedgerForIssuedProviderOrder(tx, context, order.id);
  }
}

export async function completeProviderBatch(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
) {
  const orders = await tx
    .select({ status: providerOrderSnapshots.status })
    .from(providerOrderSnapshots)
    .where(
      and(
        eq(providerOrderSnapshots.batchId, batchId),
        eq(providerOrderSnapshots.tenantId, context.tenantId),
      ),
    );
  if (
    orders.length === 0
    || orders.some(
      (order) =>
        order.status !== "ISSUED"
        && order.status !== "AWAITING_UPSTREAM_PAYMENT",
    )
  ) {
    throw new OrderBatchUnavailableError();
  }

  const completed = await tx
    .update(providerBatches)
    .set({ status: "COMPLETED", safeErrorCode: null, completedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(providerBatches.id, batchId),
        eq(providerBatches.tenantId, context.tenantId),
        eq(providerBatches.status, "SUBMITTING"),
      ),
    )
    .returning({ id: providerBatches.id });
  if (completed.length !== 1) throw new OrderBatchUnavailableError();
}
