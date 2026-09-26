import "server-only";

import { and, desc, eq, inArray, max, sql } from "drizzle-orm";

import {
  outlets,
  providerBatches,
  providerOrderHistoryEvents,
  providerOrderSnapshots,
  providerOrderStatusObservations,
  providerSettlementItems,
  providerSettlementPulls,
  shipments,
} from "@/db/schema";
import { deriveProviderAccountKey } from "@/db/order-batch-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import { BASIS_POINTS, MENGANTAR_COD_FEE_BASIS_POINTS } from "@/lib/mengantar-cod-fee";
import {
  IDR_UNITS,
  parseIdrUnits,
  type ProviderOrderStatus,
  type ProviderSettlementSnapshot,
} from "@/lib/mengantar-settlement";
import {
  decideProviderDeliveryTransition,
  type ProviderDeliveryDecision,
} from "@/lib/provider-delivery-status";
import type { ShipmentStatus } from "@/lib/shipment-queue";

const PULL_WINDOW_MS = 60_000;
const MATCH_CHUNK = 500;
const REVIEW_LIMIT = 100;
// The only invoice state observed to mean money was released to the account.
export const SETTLED_INVOICE_STATUS = "statusCleared";

/**
 * Mirrors the account identity `validateMengantarTransportScope` derives for order
 * batches; `provider-settlement-repository.integration.test.ts` fails if they drift.
 */
export function providerSettlementAccountKey(
  tenantId: string,
  outletId: string,
  credentialSource: "private" | "platform_default",
) {
  return deriveProviderAccountKey(
    credentialSource === "platform_default" ? "platform_default" : `managed://mengantar/${tenantId}/${outletId}`,
  );
}

export class ProviderSettlementDeniedError extends Error {
  constructor() {
    super("Provider settlement access is not authorized.");
  }
}

export class ProviderSettlementThrottledError extends Error {
  constructor() {
    super("Provider settlement pull was requested too recently.");
  }
}

function requireTenantAdmin(context: TenantContext) {
  if (context.role !== "TENANT_ADMIN") throw new ProviderSettlementDeniedError();
}

/**
 * Claims the actor's pull slot before any provider I/O. Commit it in its own
 * transaction: failed or slow fetches still consume the slot, and concurrent tabs
 * serialize on the rate-limit row, so one admin cannot fan out against a shared key.
 */
export async function claimProviderSettlementPull(
  tx: TenantTransaction,
  context: TenantContext,
  outletId: string,
  now = Date.now(),
) {
  requireTenantAdmin(context);
  const [outlet] = await tx.select({ id: outlets.id }).from(outlets)
    .where(and(eq(outlets.id, outletId), eq(outlets.tenantId, context.tenantId))).limit(1);
  if (!outlet) throw new ProviderSettlementDeniedError();
  const windowStart = now - PULL_WINDOW_MS;
  const claimed = await tx.execute<{ count: number }>(sql`
    INSERT INTO shipment_rate_limits (tenant_id, actor_id, operation, count, last_request)
    VALUES (${context.tenantId}, ${context.userId}, 'settlement-pull', 1, ${now})
    ON CONFLICT (tenant_id, actor_id, operation) DO UPDATE
    SET count = 1, last_request = ${now}
    WHERE shipment_rate_limits.last_request <= ${windowStart}
    RETURNING count
  `);
  if (claimed.rows.length !== 1) throw new ProviderSettlementThrottledError();
}

export type RecordProviderSettlementPullInput = {
  outletId: string;
  credentialSource: "private" | "platform_default";
  providerAccountKey: string;
  period: { start: Date; end: Date };
  snapshot: ProviderSettlementSnapshot;
};

type MatchedOrder = { shipmentId: string; outletId: string };

async function matchTenantOrders(
  tx: TenantTransaction,
  context: TenantContext,
  providerAccountKey: string,
  cnoteNumbers: string[],
) {
  const matches = new Map<string, MatchedOrder>();
  for (let index = 0; index < cnoteNumbers.length; index += MATCH_CHUNK) {
    const chunk = cnoteNumbers.slice(index, index + MATCH_CHUNK);
    const rows = await tx.select({
      cnoteNo: providerOrderSnapshots.cnoteNo,
      shipmentId: providerOrderSnapshots.shipmentId,
      outletId: shipments.outletId,
    })
      .from(providerOrderSnapshots)
      .innerJoin(providerBatches, and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ))
      .innerJoin(shipments, and(
        eq(shipments.id, providerOrderSnapshots.shipmentId),
        eq(shipments.tenantId, providerOrderSnapshots.tenantId),
      ))
      .where(and(
        eq(providerOrderSnapshots.tenantId, context.tenantId),
        // Same Mengantar account only: a shared platform key sees other tenants' AWBs.
        eq(providerBatches.providerAccountKey, providerAccountKey),
        inArray(providerOrderSnapshots.cnoteNo, chunk),
      ));
    for (const row of rows) {
      if (row.cnoteNo) matches.set(row.cnoteNo, { shipmentId: row.shipmentId, outletId: row.outletId });
    }
  }
  return matches;
}

/** Distinct provider values a pull could not place; capped so one broken page cannot flood a message. */
const MAX_REPORTED_UNRECOGNISED = 5;

type ObservedOrder = ProviderOrderStatus & MatchedOrder;

export type ProviderDeliveryTransitionResult = {
  appliedCount: number;
  refusedCount: number;
  /** Sorted, de-duplicated and capped; surfaced to the operator who ran the pull. */
  unrecognisedStatuses: string[];
};

/**
 * T-169 / PR-57. Turns the provider statuses this pull just observed into
 * shipment lifecycle transitions.
 *
 * Every read and every write carries the server-derived tenant id in SQL;
 * row-level security repeats it underneath but is never the only control. The
 * scope is the tenant, not one outlet: the pull matches the provider's own
 * orders for this account, and an account spans the tenant's outlets, so a
 * shipment the provider reported on is transitioned wherever it sits. Each
 * observation row still records the shipment's own outlet. (An earlier version
 * also filtered the write by `outlet_id`, which could never exclude anything —
 * that id is read from the same shipment row the predicate then matched — and
 * a guard that asserted the predicate's SQL text passed on the tautology.)
 *
 * The shipment rows are locked before their status is read, so the state a
 * decision is taken on is the state it is written against — a second concurrent
 * pull waits and then re-decides.
 *
 * The decision itself is `decideProviderDeliveryTransition`, which never
 * produces a state the provider did not report and never a move the transition
 * graph does not allow. Its outcome is stored on the observation row, so an
 * unrecognised or refused status leaves a record instead of silently doing
 * nothing. COD principal and the ledger are untouched: this writes
 * `shipments.status` and nothing else.
 */
async function applyProviderDeliveryTransitions(
  tx: TenantTransaction,
  context: TenantContext,
  observations: ObservedOrder[],
): Promise<{ decisions: Map<string, ProviderDeliveryDecision & { fromStatus: ShipmentStatus }> } & ProviderDeliveryTransitionResult> {
  const decisions = new Map<string, ProviderDeliveryDecision & { fromStatus: ShipmentStatus }>();
  const empty = { decisions, appliedCount: 0, refusedCount: 0, unrecognisedStatuses: [] };
  if (observations.length === 0) return empty;

  // Locked in a stable order so two pulls over overlapping shipments cannot deadlock.
  const locked = await tx
    .select({ id: shipments.id, outletId: shipments.outletId, status: shipments.status })
    .from(shipments)
    .where(and(
      eq(shipments.tenantId, context.tenantId),
      inArray(shipments.id, observations.map((observation) => observation.shipmentId)),
    ))
    .orderBy(shipments.id)
    .for("update");
  const currentById = new Map(locked.map((row) => [row.id, row]));

  const applyGroups = new Map<ShipmentStatus, string[]>();
  const unrecognised = new Set<string>();
  let refusedCount = 0;
  for (const observation of observations) {
    const current = currentById.get(observation.shipmentId);
    // The match join already proved the shipment is this tenant's; a row missing
    // here means it moved out from under the pull, so decide nothing about it.
    if (!current) continue;
    const decision = decideProviderDeliveryTransition(observation.status, current.status, {
      returnCnoteNo: observation.returnCnoteNo,
    });
    decisions.set(observation.shipmentId, { ...decision, fromStatus: current.status });
    if (decision.outcome === "UNRECOGNISED") unrecognised.add(decision.normalizedStatus);
    if (decision.outcome === "REFUSED") refusedCount += 1;
    if (decision.outcome !== "APPLIED" || decision.mappedStatus === null) continue;
    const group = applyGroups.get(decision.mappedStatus) ?? [];
    group.push(observation.shipmentId);
    applyGroups.set(decision.mappedStatus, group);
  }

  let appliedCount = 0;
  for (const [status, shipmentIds] of applyGroups) {
    const updated = await tx
      .update(shipments)
      .set({ status, updatedAt: sql`now()` })
      .where(and(
        eq(shipments.tenantId, context.tenantId),
        inArray(shipments.id, shipmentIds),
      ))
      .returning({ id: shipments.id });
    appliedCount += updated.length;
  }

  return {
    decisions,
    appliedCount,
    refusedCount,
    unrecognisedStatuses: [...unrecognised].sort().slice(0, MAX_REPORTED_UNRECOGNISED),
  };
}

export async function recordProviderSettlementPull(
  tx: TenantTransaction,
  context: TenantContext,
  input: RecordProviderSettlementPullInput,
) {
  requireTenantAdmin(context);
  if (!/^[0-9a-f]{64}$/.test(input.providerAccountKey)) throw new ProviderSettlementDeniedError();
  const { snapshot } = input;

  const providerAwbs = new Set([
    ...snapshot.items.map((item) => item.cnoteNo),
    ...snapshot.orderStatuses.map((order) => order.cnoteNo),
  ]);
  const candidates = new Set([...providerAwbs, ...snapshot.refunds.flatMap((refund) => refund.referenceTokens)]);
  const matches = await matchTenantOrders(tx, context, input.providerAccountKey, [...candidates]);

  const itemRows = snapshot.items.flatMap((item) => {
    const match = matches.get(item.cnoteNo);
    return match ? [{ ...item, ...match }] : [];
  });
  const refundRows = snapshot.refunds.flatMap((refund) => {
    const matched = refund.referenceTokens.filter((token) => matches.has(token));
    // One refund amount cannot be split across several of our AWBs without guessing.
    if (matched.length !== 1) return [];
    return [{
      ...refund,
      ...matches.get(matched[0])!,
      itemType: "REFUND" as const,
      cnoteNo: matched[0],
      codAmountIdr: null,
      codFeeIdr: null,
      shippingAmountIdr: null,
    }];
  });
  const statusByShipment = new Map<string, ObservedOrder>();
  for (const order of snapshot.orderStatuses) {
    const match = matches.get(order.cnoteNo);
    if (match) statusByShipment.set(match.shipmentId, { ...order, ...match });
  }
  const unmatchedAwbCount = input.credentialSource === "private"
    ? [...providerAwbs].filter((awb) => !matches.has(awb)).length
    : null;

  const [pull] = await tx.insert(providerSettlementPulls).values({
    tenantId: context.tenantId,
    outletId: input.outletId,
    actorUserId: context.userId,
    credentialSource: input.credentialSource,
    providerAccountKey: input.providerAccountKey,
    periodStart: input.period.start,
    periodEnd: input.period.end,
    // A shared platform account's totals include other tenants' volume.
    invoiceCount: input.credentialSource === "private" ? snapshot.invoiceCount : null,
    orderCount: input.credentialSource === "private" ? snapshot.orderCount : null,
    matchedItemCount: itemRows.length + refundRows.length,
    matchedStatusCount: statusByShipment.size,
    unmatchedAwbCount,
  }).returning({ id: providerSettlementPulls.id });

  const settlementRows = [...itemRows, ...refundRows];
  const inserted = settlementRows.length === 0 ? [] : await tx.insert(providerSettlementItems).values(
    settlementRows.map((row) => ({
      tenantId: context.tenantId,
      pullId: pull.id,
      shipmentId: row.shipmentId,
      outletId: row.outletId,
      itemType: row.itemType,
      providerInvoiceId: row.providerInvoiceId,
      invoiceNumber: row.invoiceNumber,
      invoiceStatus: row.invoiceStatus,
      invoiceCreatedAt: row.invoiceCreatedAt,
      cnoteNo: row.cnoteNo,
      amountIdr: row.amountIdr,
      codAmountIdr: row.codAmountIdr,
      codFeeIdr: row.codFeeIdr,
      shippingAmountIdr: row.shippingAmountIdr,
    })),
  ).onConflictDoNothing().returning({ id: providerSettlementItems.id });

  // T-169: the lifecycle decision is taken before the evidence is stored, so
  // each observation row records what it did rather than only what was seen.
  const transitions = await applyProviderDeliveryTransitions(tx, context, [...statusByShipment.values()]);

  if (statusByShipment.size > 0) {
    await tx.insert(providerOrderStatusObservations).values([...statusByShipment.values()].map((row) => {
      const decision = transitions.decisions.get(row.shipmentId);
      return {
        tenantId: context.tenantId,
        pullId: pull.id,
        shipmentId: row.shipmentId,
        outletId: row.outletId,
        cnoteNo: row.cnoteNo,
        providerStatus: row.status,
        fromStatus: decision?.fromStatus ?? null,
        mappedStatus: decision?.mappedStatus ?? null,
        transitionOutcome: decision?.outcome ?? null,
        lastHistoryDesc: row.lastHistoryDesc ?? null,
        lastHistoryAt: row.lastHistoryAt ?? null,
        podCode: row.podCode ?? null,
        cnoteNoRts: row.returnCnoteNo ?? null,
        lastUndeliveredCode: row.lastUndeliveredCode ?? null,
        isBreach: row.isBreach ?? null,
        claimStatus: row.claimStatus ?? null,
        ticketStatus: row.ticketStatus ?? null,
      };
    }));
  }

  const historyEventCount = await recordProviderHistoryEvents(tx, context, [...statusByShipment.values()]);
  await recordReturnConsignments(tx, context, [...statusByShipment.values()]);

  return {
    pullId: pull.id,
    invoiceCount: input.credentialSource === "private" ? snapshot.invoiceCount : null,
    orderCount: input.credentialSource === "private" ? snapshot.orderCount : null,
    matchedItemCount: settlementRows.length,
    newItemCount: inserted.length,
    matchedStatusCount: statusByShipment.size,
    unmatchedAwbCount,
    appliedTransitionCount: transitions.appliedCount,
    refusedTransitionCount: transitions.refusedCount,
    unrecognisedStatuses: transitions.unrecognisedStatuses,
    historyEventCount,
  };
}

const HISTORY_INSERT_CHUNK = 500;

/**
 * T-238 / DATA-18: the courier's tracking events this pull saw, appended once
 * each (the table's unique key makes a repeated pull a no-op). Tenant id comes
 * from the server context; the shipment and outlet from the account-scoped
 * match. Returns how many were new.
 */
async function recordProviderHistoryEvents(tx: TenantTransaction, context: TenantContext, observations: ObservedOrder[]) {
  const rows = observations.flatMap((observation) => (observation.historyEvents ?? []).map((event) => ({
    tenantId: context.tenantId,
    shipmentId: observation.shipmentId,
    outletId: observation.outletId,
    occurredAt: event.occurredAt,
    description: event.description,
    source: event.source,
  })));
  let inserted = 0;
  for (let index = 0; index < rows.length; index += HISTORY_INSERT_CHUNK) {
    const written = await tx.insert(providerOrderHistoryEvents)
      .values(rows.slice(index, index + HISTORY_INSERT_CHUNK))
      .onConflictDoNothing()
      .returning({ id: providerOrderHistoryEvents.id });
    inserted += written.length;
  }
  return inserted;
}

/**
 * T-238: the return resi (`cnote_no_rts`) onto the order, where both roles read
 * it. Only a reported value is written; an absent one never clears it, and the
 * observation row keeps what each pull saw.
 */
async function recordReturnConsignments(tx: TenantTransaction, context: TenantContext, observations: ObservedOrder[]) {
  const reported = observations.filter((observation) => observation.returnCnoteNo);
  if (reported.length === 0) return;
  await tx.execute(sql`
    UPDATE provider_order_snapshots AS snapshot
    SET return_cnote_no = reported.return_cnote_no
    FROM (VALUES ${sql.join(reported.map((observation) =>
      sql`(${observation.shipmentId}::uuid, ${observation.returnCnoteNo}::text)`), sql`, `)}) AS reported(shipment_id, return_cnote_no)
    WHERE snapshot.tenant_id = ${context.tenantId}
      AND snapshot.shipment_id = reported.shipment_id
      AND snapshot.return_cnote_no IS DISTINCT FROM reported.return_cnote_no
  `);
}

export type ProviderDeliveryStatusBasis = {
  /** Newest provider observation in scope, or null when there is none to state. */
  lastObservedAt: Date | null;
  /**
   * False for an OPERATOR: the provider evidence tables are Tenant Admin only
   * (T-146), so the surface states the mechanism of the lag instead of a time
   * it could not read.
   */
  observationVisible: boolean;
};

/**
 * PR-57: what every surface showing a delivery outcome needs in order to say
 * the outcome is provider-reported and how far behind it may be. Tenant- and
 * outlet-scoped in SQL, and never queried for a role that may not read it.
 */
export async function loadProviderDeliveryStatusBasis(
  tx: TenantTransaction,
  context: TenantContext,
  filter: { outletId?: string } = {},
): Promise<ProviderDeliveryStatusBasis> {
  if (context.role !== "TENANT_ADMIN") return { lastObservedAt: null, observationVisible: false };
  const [row] = await tx
    .select({ lastObservedAt: max(providerOrderStatusObservations.observedAt) })
    .from(providerOrderStatusObservations)
    .where(and(
      eq(providerOrderStatusObservations.tenantId, context.tenantId),
      filter.outletId ? eq(providerOrderStatusObservations.outletId, filter.outletId) : undefined,
    ));
  return { lastObservedAt: row?.lastObservedAt ?? null, observationVisible: true };
}

/**
 * SETTLE-EXPECTED-IDR in exact ten-thousandths of a rupiah: the COD amount
 * submitted, less the shipping the ledger recorded, less Mengantar's COD fee
 * `COD × 333 / 10000` unrounded. Evidence (tests/fixtures/mengantar-cod-identities.json,
 * T-178): Mengantar pays `COD_AMOUNT − estimatedSpecialPrice` (2,866/2,866) and
 * that price is the discounted shipping plus the fee (1,642/1,643 joined orders);
 * the quote-basis shipping in the ledger carries no fee (`codFee` is 0 at quote time).
 */
export function expectedSettlementUnits(providerCodAmountIdr: bigint, ledgerShippingIdr: bigint) {
  const feeUnits = providerCodAmountIdr * BigInt(MENGANTAR_COD_FEE_BASIS_POINTS) * IDR_UNITS / BigInt(BASIS_POINTS);
  return (providerCodAmountIdr - ledgerShippingIdr) * IDR_UNITS - feeUnits;
}

/**
 * The capture that established the settlement identities matched each one to
 * within half a sen, so that is the precision the expectation is known to:
 * a provider that pays the fee unrounded lands on the expectation exactly, one
 * that rounds it to the sen lands within this. Any larger difference — one sen
 * short included — is a mismatch.
 */
export const SETTLEMENT_MATCH_TOLERANCE_IDR = 0.005;

export type ProviderSettlementClass =
  | "AMOUNT_MISMATCH"
  | "DELIVERED_UNPAID"
  | "RETURN_CHARGE"
  | "REFUND"
  | "MATCHED"
  | "IN_PROGRESS";

export type ProviderSettlementReviewRow = {
  shipmentId: string;
  publicReference: string;
  cnoteNo: string;
  outletName: string;
  isCod: boolean;
  settledIdr: number | null;
  providerCodAmountIdr: number | null;
  providerShippingIdr: number | null;
  chargeIdr: number;
  refundIdr: number;
  latestProviderStatus: string | null;
  expectedPayoutIdr: number | null;
  varianceIdr: number | null;
  settlementClass: ProviderSettlementClass;
};

export function classifyProviderSettlement(row: {
  isCod: boolean;
  settledIdr: number | null;
  varianceIdr: number | null;
  chargeIdr: number;
  refundIdr: number;
  latestProviderStatus: string | null;
}): ProviderSettlementClass {
  const status = row.latestProviderStatus?.toUpperCase() ?? "";
  if (
    row.settledIdr !== null
    && (row.varianceIdr === null || Math.abs(row.varianceIdr) > SETTLEMENT_MATCH_TOLERANCE_IDR)
  ) return "AMOUNT_MISMATCH";
  // A settled AWB with a later claim or return charge still needs attention, never "matched".
  if (row.refundIdr !== 0) return "REFUND";
  if (row.chargeIdr !== 0) return "RETURN_CHARGE";
  if (row.settledIdr !== null) return "MATCHED";
  if (status === "RTS") return "RETURN_CHARGE";
  // "UNDELIVERED" also contains "DELIVERED"; match the category, not a substring.
  if (row.isCod && /^DELIVERED(\b|_|$)/.test(status)) return "DELIVERED_UNPAID";
  return "IN_PROGRESS";
}

export type ProviderSettlementPullSummary = {
  createdAt: Date;
  credentialSource: "private" | "platform_default";
  invoiceCount: number | null;
  matchedItemCount: number;
  matchedStatusCount: number;
  orderCount: number | null;
  outletName: string;
  periodEnd: Date;
  periodStart: Date;
  unmatchedAwbCount: number | null;
};

export async function listProviderSettlementReview(
  tx: TenantTransaction,
  context: TenantContext,
  filter: { outletId?: string } = {},
): Promise<{ rows: ProviderSettlementReviewRow[]; latestPull: ProviderSettlementPullSummary | null; limit: number }> {
  requireTenantAdmin(context);
  const outletFilter = filter.outletId ? sql`AND shipment.outlet_id = ${filter.outletId}` : sql``;
  const result = await tx.execute<{
    shipment_id: string;
    public_reference: string;
    cnote_no: string;
    outlet_name: string;
    is_cod: boolean;
    settled_idr: string | null;
    provider_cod_amount_idr: string | null;
    provider_shipping_idr: string | null;
    charge_idr: string;
    refund_idr: string;
    latest_provider_status: string | null;
    expected_cod_amount_idr: string | null;
    ledger_shipping_idr: string | null;
  }>(sql`
    WITH touched AS (
      SELECT shipment_id, max(cnote_no) AS cnote_no FROM (
        SELECT shipment_id, cnote_no FROM provider_settlement_items WHERE tenant_id = ${context.tenantId}
        UNION ALL
        SELECT shipment_id, cnote_no FROM provider_order_status_observations WHERE tenant_id = ${context.tenantId}
      ) seen
      GROUP BY shipment_id
    ), latest_item AS (
      -- Latest observation per provider invoice line: a later status or corrected amount supersedes earlier pulls.
      SELECT DISTINCT ON (item.provider_invoice_id, item.item_type, item.cnote_no) item.*
      FROM provider_settlement_items item
      WHERE item.tenant_id = ${context.tenantId}
      ORDER BY item.provider_invoice_id, item.item_type, item.cnote_no, item.created_at DESC, item.id DESC
    ), settlement AS (
      -- lazy: distinct settlement invoices for one AWB are summed; a provider re-issue under a new id surfaces as a mismatch.
      SELECT item.shipment_id,
        sum(item.amount_idr) FILTER (WHERE item.item_type = 'SETTLEMENT') AS settled_idr,
        max(item.cod_amount_idr) FILTER (WHERE item.item_type = 'SETTLEMENT') AS provider_cod_amount_idr,
        sum(item.shipping_amount_idr) FILTER (WHERE item.item_type = 'SETTLEMENT') AS provider_shipping_idr,
        coalesce(sum(item.amount_idr) FILTER (WHERE item.item_type = 'CHARGE'), 0) AS charge_idr,
        coalesce(sum(item.amount_idr) FILTER (WHERE item.item_type = 'REFUND'), 0) AS refund_idr,
        max(item.created_at) AS last_seen
      FROM latest_item item
      -- Only cleared invoices move money, for every item type.
      WHERE item.invoice_status = ${SETTLED_INVOICE_STATUS}
      GROUP BY item.shipment_id
    ), latest_status AS (
      SELECT DISTINCT ON (observation.shipment_id)
        observation.shipment_id, observation.cnote_no, observation.provider_status, observation.observed_at
      FROM provider_order_status_observations observation
      WHERE observation.tenant_id = ${context.tenantId}
      ORDER BY observation.shipment_id, observation.observed_at DESC, observation.id DESC
    ), ledger_cost AS (
      SELECT entry.shipment_id,
        coalesce(sum(entry.amount_idr) FILTER (WHERE
          -- Shipping only: the verified payout identity deducts estimatedSpecialPrice; insurance is unverified.
          entry.entry_type = 'MENGANTAR_SHIPPING_COST'
          OR (entry.entry_type = 'ADJUSTMENT' AND original.entry_type = 'MENGANTAR_SHIPPING_COST')
        ), 0) AS provider_cost_idr
      FROM ledger_entries entry
      LEFT JOIN ledger_entries original
        ON original.id = entry.reverses_entry_id AND original.tenant_id = entry.tenant_id
      WHERE entry.tenant_id = ${context.tenantId} AND entry.shipment_id IN (SELECT shipment_id FROM touched)
      GROUP BY entry.shipment_id
    )
    SELECT shipment.id AS shipment_id,
      shipment.public_reference,
      touched.cnote_no,
      outlet.name AS outlet_name,
      coalesce(snapshot.is_cod, false) AS is_cod,
      settlement.settled_idr,
      settlement.provider_cod_amount_idr,
      settlement.provider_shipping_idr,
      coalesce(settlement.charge_idr, 0) AS charge_idr,
      coalesce(settlement.refund_idr, 0) AS refund_idr,
      latest_status.provider_status AS latest_provider_status,
      cod_total.provider_cod_amount_idr AS expected_cod_amount_idr,
      coalesce(ledger_cost.provider_cost_idr, 0) AS ledger_shipping_idr
    FROM touched
    JOIN shipments shipment ON shipment.id = touched.shipment_id AND shipment.tenant_id = ${context.tenantId}
    JOIN outlets outlet ON outlet.id = shipment.outlet_id AND outlet.tenant_id = shipment.tenant_id
    LEFT JOIN settlement ON settlement.shipment_id = touched.shipment_id
    LEFT JOIN latest_status ON latest_status.shipment_id = touched.shipment_id
    LEFT JOIN ledger_cost ON ledger_cost.shipment_id = touched.shipment_id
    LEFT JOIN LATERAL (
      SELECT snapshot.is_cod FROM provider_order_snapshots snapshot
      WHERE snapshot.shipment_id = shipment.id AND snapshot.tenant_id = shipment.tenant_id AND snapshot.cnote_no IS NOT NULL
      ORDER BY snapshot.created_at DESC LIMIT 1
    ) snapshot ON true
    LEFT JOIN shipment_cod_totals cod_total ON cod_total.shipment_id = shipment.id AND cod_total.tenant_id = shipment.tenant_id
    WHERE true ${outletFilter}
    ORDER BY greatest(settlement.last_seen, latest_status.observed_at) DESC NULLS LAST, shipment.id
    LIMIT ${REVIEW_LIMIT}
  `);

  // Money is exact until it is handed to the surface: provider amounts are
  // numeric(18,4) and only ever added or subtracted here in BigInt.
  const units = (value: string | null) => {
    if (value === null) return null;
    const parsed = parseIdrUnits(String(value));
    if (parsed === null) throw new Error("Provider settlement amount is not an exact rupiah value.");
    return parsed;
  };
  const idr = (value: bigint | null) => value === null ? null : Number(value) / Number(IDR_UNITS);
  const rows: ProviderSettlementReviewRow[] = result.rows.map((row) => {
    const settledUnits = units(row.settled_idr);
    // Both are bigint columns (whole rupiah); BigInt refuses anything else.
    const expectedUnits = row.expected_cod_amount_idr === null
      ? null
      : expectedSettlementUnits(BigInt(String(row.expected_cod_amount_idr)), BigInt(String(row.ledger_shipping_idr ?? 0)));
    const settledIdr = idr(settledUnits);
    const base = {
      shipmentId: row.shipment_id,
      publicReference: row.public_reference,
      cnoteNo: row.cnote_no,
      outletName: row.outlet_name,
      isCod: row.is_cod,
      settledIdr,
      providerCodAmountIdr: idr(units(row.provider_cod_amount_idr)),
      providerShippingIdr: idr(units(row.provider_shipping_idr)),
      chargeIdr: idr(units(row.charge_idr))!,
      refundIdr: idr(units(row.refund_idr))!,
      latestProviderStatus: row.latest_provider_status,
      expectedPayoutIdr: idr(expectedUnits),
      varianceIdr: settledUnits !== null && expectedUnits !== null ? idr(settledUnits - expectedUnits) : null,
    };
    return { ...base, settlementClass: classifyProviderSettlement(base) };
  });

  const pullWhere = filter.outletId
    ? and(eq(providerSettlementPulls.tenantId, context.tenantId), eq(providerSettlementPulls.outletId, filter.outletId))
    : eq(providerSettlementPulls.tenantId, context.tenantId);
  const [latestPull] = await tx.select({
    createdAt: providerSettlementPulls.createdAt,
    credentialSource: providerSettlementPulls.credentialSource,
    invoiceCount: providerSettlementPulls.invoiceCount,
    matchedItemCount: providerSettlementPulls.matchedItemCount,
    matchedStatusCount: providerSettlementPulls.matchedStatusCount,
    orderCount: providerSettlementPulls.orderCount,
    outletName: outlets.name,
    periodEnd: providerSettlementPulls.periodEnd,
    periodStart: providerSettlementPulls.periodStart,
    unmatchedAwbCount: providerSettlementPulls.unmatchedAwbCount,
  }).from(providerSettlementPulls)
    .innerJoin(outlets, and(eq(outlets.id, providerSettlementPulls.outletId), eq(outlets.tenantId, providerSettlementPulls.tenantId)))
    .where(pullWhere)
    .orderBy(desc(providerSettlementPulls.createdAt))
    .limit(1);

  return { rows, latestPull: latestPull ?? null, limit: REVIEW_LIMIT };
}
