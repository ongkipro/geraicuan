import "server-only";

import { createHash } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { appendLedgerForIssuedProviderOrder } from "@/db/ledger-repository";
import { mengantarCourierOfService } from "@/lib/mengantar-couriers";
import {
  providerBatches,
  providerOrderSnapshots,
  shipments,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  lockMengantarAccountAuthority,
  MengantarConfigurationError,
} from "@/lib/mengantar-credentials";

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
  destinationAreaLabel: string;
  /** NULL when the area was never re-checked against the Mengantar account. */
  destinationAreaVerifiedAt: Date | null;
  packageContent: string;
  weightGrams: number;
  quantity: number;
  declaredValueIdr: number;
  isCod: boolean;
  providerCodAmountIdr: number | null;
  isHazardous: boolean;
  recipientAddressLandmark: string | null;
  shippingInstruction: string | null;
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

export const PROVIDER_BATCH_CLAIM_STALE_AFTER_SECONDS = 120;

async function requireCurrentMengantarSource(
  tx: TenantTransaction,
  context: TenantContext,
  scope: Pick<ProviderBatchScope, "credentialSource" | "outletId">,
) {
  try {
    const authority = await lockMengantarAccountAuthority(
      tx,
      context,
      scope.outletId,
    );
    if (authority.source !== scope.credentialSource) {
      throw new OrderBatchUnavailableError();
    }
  } catch (error) {
    if (error instanceof MengantarConfigurationError) {
      throw new OrderBatchUnavailableError();
    }
    throw error;
  }
}

export function deriveProviderAccountKey(accountIdentity: string): string {
  if (!accountIdentity.trim()) throw new OrderBatchUnavailableError();
  return createHash("sha256").update(accountIdentity, "utf8").digest("hex");
}

export function providerCourierFromService(providerService: string): string {
  // The ladder this replaced named five couriers, so `iDexpressCargo` fell
  // through and became a courier of its own. The list is now the provider's own
  // catalogue (see `src/lib/mengantar-couriers.ts`), and a service key no known
  // courier claims is still returned as it came rather than dropped.
  if (!providerService.trim().replace(/[^A-Za-z0-9]/g, "")) {
    throw new OrderBatchUnavailableError();
  }
  return mengantarCourierOfService(providerService) ?? providerService.trim();
}

export function requiresProviderAccountSerialization(courier: string): boolean {
  return ["JT", "Ninja", "SiCepat"].includes(providerCourierFromService(courier));
}

/** Draft-owned operational columns both order loaders read (PR-47). */
type DraftOperationalColumns = {
  destinationAreaVerifiedAt: Date | null;
  isHazardous: boolean;
  recipientAddressLandmark: string | null;
  shippingInstruction: string | null;
};

const DRAFT_OPERATIONAL_SELECT = sql`
  draft.destination_area_verified_at AS "destinationAreaVerifiedAt",
  draft.is_hazardous AS "isHazardous",
  draft.recipient_address_landmark AS "recipientAddressLandmark",
  draft.shipping_instruction AS "shippingInstruction"
`;

function draftOperationalColumns(row: DraftOperationalColumns): DraftOperationalColumns {
  return {
    destinationAreaVerifiedAt: row.destinationAreaVerifiedAt,
    isHazardous: row.isHazardous,
    recipientAddressLandmark: row.recipientAddressLandmark,
    shippingInstruction: row.shippingInstruction,
  };
}

type SelectedOrderRow = DraftOperationalColumns & {
  shipmentId: string;
  outletId: string;
  pickupAddressId: string;
  estimateSnapshotId: string;
  estimateServiceId: string;
  credentialSource: "private" | "platform_default";
  providerService: string;
  currency: "IDR";
  shippingAmountIdr: number;
  /**
   * T-146: what Mengantar actually deducts at settlement — `estimatedSpecialPrice`
   * falling back to `estimatedPrice` then `price` — kept separate from
   * `shippingAmountIdr` (`price`, the buyer's basis) so the buyer-facing figure
   * never moves. Same COALESCE order `shipment-draft-experience.tsx` uses for
   * COD-SELLER-PAYOUT-IDR.
   */
  providerChargedShippingIdr: number;
  insuranceAmountIdr: number | null;
  destinationAreaId: string;
  destinationAreaLabel: string;
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
      -- T-157: the pickup point chosen for this shipment. A pre-T-157 draft has
      -- none, and falls back to the outlet's default pair.
      COALESCE(draft.pickup_address_id, outlet.default_pickup_address_id) AS "pickupAddressId",
      estimate.id AS "estimateSnapshotId",
      service.id AS "estimateServiceId",
      estimate.credential_source AS "credentialSource",
      service.provider_service AS "providerService",
      service.currency AS "currency",
      service.shipping_amount_idr AS "shippingAmountIdr",
      COALESCE(
        service.special_price_idr,
        service.normal_price_idr,
        service.shipping_amount_idr
      ) AS "providerChargedShippingIdr",
      service.insurance_amount_idr AS "insuranceAmountIdr",
      estimate.destination_area_id AS "destinationAreaId",
      estimate.destination_area_label AS "destinationAreaLabel",
      draft.package_content AS "packageContent",
      draft.package_weight_grams AS "weightGrams",
      draft.package_quantity AS "quantity",
      draft.declared_value_idr AS "declaredValueIdr",
      draft.is_cod AS "isCod",
      cod.provider_cod_amount_idr AS "providerCodAmountIdr",
      ${DRAFT_OPERATIONAL_SELECT},
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
      AND estimate.origin_area_id = COALESCE(draft.origin_area_id, outlet.default_origin_area_id)
      AND estimate.destination_area_id = draft.destination_area_id
      AND estimate.destination_area_label = draft.destination_area_label
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
      AND recipient.destination_area_id = draft.destination_area_id
      AND recipient.destination_area_label = draft.destination_area_label
    WHERE NOT draft.is_cod OR cod.id IS NOT NULL
    ORDER BY shipment.id
    FOR UPDATE OF shipment
  `);

  if (selected.rows.length !== canonical.length) throw new OrderBatchUnavailableError();
  return selected.rows;
}

type ExistingConfirmationRow = DraftOperationalColumns & {
  batchId: string;
  status: (typeof providerBatches.$inferSelect)["status"];
  orderStatus: (typeof providerOrderSnapshots.$inferSelect)["status"];
  shipmentStatus: (typeof shipments.$inferSelect)["status"];
  submissionAttemptedAt: Date | null;
  batchOrderCount: number;
  outletId: string;
  pickupAddressId: string;
  courier: string;
  credentialSource: (typeof providerBatches.$inferSelect)["credentialSource"];
  providerAccountKey: string;
} & SelectedOrderRow;

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
      batch.submission_attempted_at AS "submissionAttemptedAt",
      (
        SELECT count(*)::int
        FROM provider_order_snapshots AS batch_member
        WHERE batch_member.batch_id = batch.id
          AND batch_member.tenant_id = batch.tenant_id
      ) AS "batchOrderCount",
      batch.outlet_id AS "outletId",
      batch.courier,
      batch.credential_source AS "credentialSource",
      batch.provider_account_key AS "providerAccountKey",
      shipment.id AS "shipmentId",
      shipment.status AS "shipmentStatus",
      COALESCE(draft.pickup_address_id, outlet.default_pickup_address_id) AS "pickupAddressId",
      provider_order.estimate_snapshot_id AS "estimateSnapshotId",
      provider_order.estimate_service_id AS "estimateServiceId",
      provider_order.provider_service AS "providerService",
      provider_order.status AS "orderStatus",
      provider_order.currency,
      provider_order.shipping_amount_idr AS "shippingAmountIdr",
      COALESCE(
        provider_order.provider_charged_shipping_idr,
        provider_order.shipping_amount_idr
      ) AS "providerChargedShippingIdr",
      provider_order.insurance_amount_idr AS "insuranceAmountIdr",
      provider_order.destination_area_id AS "destinationAreaId",
      provider_order.destination_area_label AS "destinationAreaLabel",
      draft.package_content AS "packageContent",
      draft.package_weight_grams AS "weightGrams",
      draft.package_quantity AS "quantity",
      draft.declared_value_idr AS "declaredValueIdr",
      draft.is_cod AS "isCod",
      provider_order.provider_cod_amount_idr AS "providerCodAmountIdr",
      ${DRAFT_OPERATIONAL_SELECT},
      sender.name AS "senderName",
      sender.phone AS "senderPhone",
      sender.address AS "senderAddress",
      recipient.name AS "recipientName",
      recipient.phone AS "recipientPhone",
      recipient.address AS "recipientAddress"
    FROM requested
    JOIN provider_order_snapshots AS provider_order
      ON provider_order.shipment_id = requested."shipmentId"
      AND provider_order.estimate_snapshot_id = requested."estimateSnapshotId"
      AND provider_order.estimate_service_id = requested."estimateServiceId"
      AND provider_order.tenant_id = ${context.tenantId}
    JOIN provider_batches AS batch
      ON batch.id = provider_order.batch_id
      AND batch.tenant_id = provider_order.tenant_id
    JOIN shipments AS shipment
      ON shipment.id = provider_order.shipment_id
      AND shipment.tenant_id = provider_order.tenant_id
    JOIN outlets AS outlet
      ON outlet.id = batch.outlet_id
      AND outlet.tenant_id = batch.tenant_id
    JOIN shipment_drafts AS draft
      ON draft.shipment_id = shipment.id
      AND draft.tenant_id = shipment.tenant_id
      AND draft.destination_area_id = provider_order.destination_area_id
      AND draft.destination_area_label = provider_order.destination_area_label
      -- T-157: the batch must still be leaving from the pickup point this
      -- shipment chose (or, for a pre-T-157 draft, the outlet default).
      AND COALESCE(draft.pickup_address_id, outlet.default_pickup_address_id) = batch.pickup_address_id
    JOIN shipment_parties AS sender
      ON sender.shipment_id = shipment.id
      AND sender.tenant_id = shipment.tenant_id
      AND sender.role = 'SENDER'
    JOIN shipment_parties AS recipient
      ON recipient.shipment_id = shipment.id
      AND recipient.tenant_id = shipment.tenant_id
      AND recipient.role = 'RECIPIENT'
      AND recipient.destination_area_id = provider_order.destination_area_id
      AND recipient.destination_area_label = provider_order.destination_area_label
  `);
  if (existing.rows.length === 0) return null;
  if (existing.rows.length !== confirmations.length) throw new OrderBatchUnavailableError();

  const submittingBatchIds = [...new Set(
    existing.rows
      .filter((row) => row.status === "SUBMITTING")
      .map((row) => row.batchId),
  )];
  let recoveredStaleClaim = false;
  for (const batchId of submittingBatchIds) {
    recoveredStaleClaim = await markStaleProviderBatchUnknown(
      tx,
      context,
      batchId,
      "ORDER_SUBMISSION_INTERRUPTED",
    ) || recoveredStaleClaim;
  }
  if (recoveredStaleClaim) {
    return loadExistingConfirmationBatches(tx, context, confirmations);
  }

  const batches = new Map<string, ExistingConfirmationRow[]>();
  for (const row of existing.rows) {
    const rows = batches.get(row.batchId);
    if (rows) rows.push(row);
    else batches.set(row.batchId, [row]);
  }
  return [...batches.values()].map((rows) => {
    const batch = rows[0]!;
    const resumable = batch.status === "SUBMISSION_QUEUED"
      && batch.submissionAttemptedAt === null;
    if (
      (batch.status === "SUBMISSION_QUEUED" && !resumable)
      || (resumable && (
        batch.batchOrderCount !== rows.length
        || rows.some(
          (row) => row.orderStatus !== "SUBMISSION_QUEUED"
            || row.shipmentStatus !== "SUBMISSION_QUEUED",
        )
      ))
    ) {
      throw new OrderBatchUnavailableError();
    }

    return {
      id: batch.batchId,
      created: false,
      status: batch.status,
      tenantId: context.tenantId,
      outletId: batch.outletId,
      pickupAddressId: batch.pickupAddressId,
      courier: batch.courier,
      credentialSource: batch.credentialSource,
      providerAccountKey: batch.providerAccountKey,
      orders: resumable
        ? rows
            .sort((left, right) => left.shipmentId.localeCompare(right.shipmentId))
            .map((row) => ({
              shipmentId: row.shipmentId,
              pickupAddressId: row.pickupAddressId,
              courier: batch.courier,
              providerService: row.providerService,
              senderName: row.senderName,
              senderPhone: row.senderPhone,
              senderAddress: row.senderAddress,
              recipientName: row.recipientName,
              recipientPhone: row.recipientPhone,
              recipientAddress: row.recipientAddress,
              destinationAreaId: row.destinationAreaId,
              destinationAreaLabel: row.destinationAreaLabel,
              packageContent: row.packageContent,
              weightGrams: row.weightGrams,
              quantity: row.quantity,
              declaredValueIdr: row.declaredValueIdr,
              isCod: row.isCod,
              providerCodAmountIdr: row.providerCodAmountIdr,
              ...draftOperationalColumns(row),
            }))
        : [],
    };
  });
}

export async function prepareProviderBatches(
  tx: TenantTransaction,
  context: TenantContext,
  confirmations: readonly OrderConfirmation[],
  resolveProviderAccountKey: ProviderAccountKeyResolver,
): Promise<PreparedProviderBatch[]> {
  const existing = await loadExistingConfirmationBatches(tx, context, confirmations);
  if (existing) {
    for (const batch of existing) {
      if (batch.orders.length === 0) continue;
      await requireCurrentMengantarSource(tx, context, batch);
      const providerAccountKey = await resolveProviderAccountKey(batch);
      if (providerAccountKey !== batch.providerAccountKey) {
        throw new OrderBatchUnavailableError();
      }
    }
    return existing;
  }
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
    await requireCurrentMengantarSource(tx, context, scope);
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
        destinationAreaId: row.destinationAreaId,
        destinationAreaLabel: row.destinationAreaLabel,
        currency: row.currency,
        shippingAmountIdr: row.shippingAmountIdr,
        providerChargedShippingIdr: row.providerChargedShippingIdr,
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
        destinationAreaLabel: row.destinationAreaLabel,
        packageContent: row.packageContent,
        weightGrams: row.weightGrams,
        quantity: row.quantity,
        declaredValueIdr: row.declaredValueIdr,
        isCod: row.isCod,
        providerCodAmountIdr: row.providerCodAmountIdr,
        ...draftOperationalColumns(row),
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

export async function markStaleProviderBatchUnknown(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
  safeErrorCode: string,
): Promise<boolean> {
  const lockedBatch = await tx.execute<{ id: string }>(sql`
    SELECT id
    FROM ${providerBatches}
    WHERE id = ${batchId}
      AND tenant_id = ${context.tenantId}
      AND status = 'SUBMITTING'
      AND submission_attempted_at <= now() - (${PROVIDER_BATCH_CLAIM_STALE_AFTER_SECONDS} * interval '1 second')
    FOR UPDATE
  `);
  if (lockedBatch.rows.length === 0) return false;

  const members = await tx.execute<{
    shipmentId: string;
    status: (typeof providerOrderSnapshots.$inferSelect)["status"];
  }>(sql`
    SELECT shipment_id AS "shipmentId", status
    FROM ${providerOrderSnapshots}
    WHERE batch_id = ${batchId}
      AND tenant_id = ${context.tenantId}
    ORDER BY position
    FOR UPDATE
  `);
  if (members.rows.length === 0) throw new OrderBatchUnavailableError();

  const terminalStatuses = new Set(["ISSUED", "AWAITING_UPSTREAM_PAYMENT"]);
  if (members.rows.every((member) => terminalStatuses.has(member.status))) {
    await tx
      .update(providerBatches)
      .set({
        status: "COMPLETED",
        safeErrorCode: null,
        completedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(providerBatches.id, batchId),
          eq(providerBatches.tenantId, context.tenantId),
          eq(providerBatches.status, "SUBMITTING"),
        ),
      );
    return true;
  }
  if (members.rows.some((member) => !terminalStatuses.has(member.status)
    && member.status !== "SUBMISSION_QUEUED")) {
    throw new OrderBatchUnavailableError();
  }

  await tx
    .update(providerBatches)
    .set({ status: "SUBMISSION_UNKNOWN", safeErrorCode, updatedAt: sql`now()` })
    .where(
      and(
        eq(providerBatches.id, batchId),
        eq(providerBatches.tenantId, context.tenantId),
        eq(providerBatches.status, "SUBMITTING"),
      ),
    );
  const unresolvedMembers = members.rows.filter(
    (member) => member.status === "SUBMISSION_QUEUED",
  );
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
  return true;
}

export async function completeProviderOrder(
  tx: TenantTransaction,
  context: TenantContext,
  batchId: string,
  result: ProviderOrderResult,
) {
  const [batch] = await tx
    .update(providerBatches)
    .set({ submissionAttemptedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(providerBatches.id, batchId),
        eq(providerBatches.tenantId, context.tenantId),
        eq(providerBatches.status, "SUBMITTING"),
      ),
    )
    .returning({ status: providerBatches.status });
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
