import "server-only";

import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import { TENANT_OPERATIONAL_TIMEZONE } from "@/db/shipment-event-predicates";
import {
  auditEvents,
  printEvents,
  providerOrderSnapshots,
  shipmentDrafts,
  shipmentHandoverEvents,
  shipments,
  users,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  HANDOVER_ATTENTION_HOURS,
  type HandoverMethod,
  type HandoverRefusal,
  type normalizeHandoverScan,
} from "@/lib/shipment-handover";

/**
 * T-267 / DATA-24: "Tandai sudah diserahkan". Every read and write is scoped by the context's own
 * tenant column (row-level security is the second guard, never the only one), and every write
 * runs inside the caller's `withTenantContext` transaction with the shipments locked first.
 */

/** One batch never exceeds one print batch (PR-87 `MAX_BATCH_SHIPMENTS`). */
export const HANDOVER_BATCH_MAX = 50;

const SHIPMENT_NUMBER_MIN = 10_000;
const SHIPMENT_NUMBER_MAX = 2_147_483_647;

/**
 * The instant of the shipment's current handover, or NULL when it has none: the latest event
 * (highest sequence) when that event is HANDED_OVER. An UNDONE latest event reads as none.
 */
export function handedOverAtSql(context: TenantContext, shipmentId: SQL | typeof shipments.id = shipments.id) {
  return sql<Date | null>`(
    SELECT CASE WHEN latest.kind = 'HANDED_OVER' THEN latest.created_at END
    FROM ${shipmentHandoverEvents} AS latest
    WHERE latest.tenant_id = ${context.tenantId}
      AND latest.shipment_id = ${shipmentId}
    ORDER BY latest.sequence DESC
    LIMIT 1
  )`;
}

/** Spec 19 LBL-HANDED-OVER's predicate: the shipment's current handover state is "handed over". */
export function handedOverPredicate(context: TenantContext) {
  return sql`${handedOverAtSql(context)} IS NOT NULL`;
}

/**
 * Spec 19 QUE-HANDOVER-OVERDUE: handed over at least HANDOVER_ATTENTION_HOURS ago and Mengantar
 * still reports no pickup scan (the shipment is still ISSUED). Measured against the transaction's
 * clock, not each statement's (T-268, PR-52): a page's count and its rows, read by separate
 * statements of one transaction, agree at the 24-hour boundary.
 */
export function handoverOverduePredicate(context: TenantContext) {
  return sql`(${shipments.status} = 'ISSUED' AND ${handedOverAtSql(context)} <= transaction_timestamp() - make_interval(hours => ${HANDOVER_ATTENTION_HOURS}::int))`;
}

const wibDayStart = sql`(date_trunc('day', current_timestamp AT TIME ZONE ${TENANT_OPERATIONAL_TIMEZONE}) AT TIME ZONE ${TENANT_OPERATIONAL_TIMEZONE})`;

/**
 * Spec 19 LBL-HANDED-OVER-TODAY: shipments whose current handover was recorded today (WIB),
 * whatever Mengantar reported since (a parcel picked up an hour later still counts).
 */
export async function countHandedOverToday(tx: TenantTransaction, context: TenantContext) {
  const handedOverAt = handedOverAtSql(context);
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
    .from(shipments)
    .where(and(
      eq(shipments.tenantId, context.tenantId),
      sql`${handedOverAt} >= ${wibDayStart}`,
      sql`${handedOverAt} < ${wibDayStart} + interval '1 day'`,
    ));
  return row?.count ?? 0;
}

export type ShipmentHandoverRecord = {
  handedOverAt: Date;
  method: HandoverMethod;
  note: string | null;
  actorName: string | null;
};

/** The current handover of one shipment (detail, label), or null when none is recorded. */
export async function loadShipmentHandover(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<ShipmentHandoverRecord | null> {
  const [latest] = await tx
    .select({
      kind: shipmentHandoverEvents.kind,
      method: shipmentHandoverEvents.method,
      note: shipmentHandoverEvents.note,
      createdAt: shipmentHandoverEvents.createdAt,
      actorName: users.name,
    })
    .from(shipmentHandoverEvents)
    .leftJoin(users, eq(users.id, shipmentHandoverEvents.actorUserId))
    .where(and(
      eq(shipmentHandoverEvents.tenantId, context.tenantId),
      eq(shipmentHandoverEvents.shipmentId, shipmentId),
    ))
    .orderBy(sql`${shipmentHandoverEvents.sequence} DESC`)
    .limit(1);
  if (!latest || latest.kind !== "HANDED_OVER" || !latest.method) return null;
  return { actorName: latest.actorName, handedOverAt: latest.createdAt, method: latest.method, note: latest.note };
}

export type HandoverMarkRow = {
  number: number;
  publicReference: string | null;
  outcome: "MARKED" | "ALREADY" | "REFUSED";
  reason?: HandoverRefusal;
};

type LockedShipment = {
  id: string;
  tenant_number: number;
  public_reference: string;
  status: string;
};

async function lockShipments(tx: TenantTransaction, context: TenantContext, where: SQL) {
  // One statement, a stable order (id): two overlapping batches take their locks in the same
  // order and never deadlock; the second waits and then sees the first one's events.
  const locked = await tx.execute<LockedShipment>(sql`
    SELECT id, tenant_number, public_reference, status
    FROM ${shipments}
    WHERE tenant_id = ${context.tenantId} AND ${where}
    ORDER BY id
    FOR UPDATE
  `);
  return locked.rows;
}

/** Per shipment, under the lock: the order's resi, whether a label was printed, the latest event. */
async function loadHandoverFacts(tx: TenantTransaction, context: TenantContext, shipmentIds: string[]) {
  if (shipmentIds.length === 0) return new Map<string, { awb: string | null; orderIssued: boolean; printed: boolean; latestKind: string | null; latestSequence: number }>();
  const rows = await tx
    .select({
      shipmentId: shipments.id,
      cnoteNo: providerOrderSnapshots.cnoteNo,
      orderStatus: providerOrderSnapshots.status,
      printed: sql<boolean>`EXISTS (
        SELECT 1 FROM ${printEvents} AS printed
        WHERE printed.tenant_id = ${context.tenantId}
          AND printed.shipment_id = ${shipments.id}
          AND printed.outcome = 'PRINTED'
      )`,
      latestKind: sql<string | null>`(
        SELECT latest.kind FROM ${shipmentHandoverEvents} AS latest
        WHERE latest.tenant_id = ${context.tenantId} AND latest.shipment_id = ${shipments.id}
        ORDER BY latest.sequence DESC LIMIT 1
      )`,
      latestSequence: sql<number>`coalesce((
        SELECT max(latest.sequence) FROM ${shipmentHandoverEvents} AS latest
        WHERE latest.tenant_id = ${context.tenantId} AND latest.shipment_id = ${shipments.id}
      ), 0)`.mapWith(Number),
    })
    .from(shipments)
    .leftJoin(
      providerOrderSnapshots,
      and(eq(providerOrderSnapshots.shipmentId, shipments.id), eq(providerOrderSnapshots.tenantId, shipments.tenantId)),
    )
    .where(and(eq(shipments.tenantId, context.tenantId), inArray(shipments.id, shipmentIds)));
  return new Map(rows.map((row) => {
    const awb = row.cnoteNo?.trim() || null;
    return [row.shipmentId, {
      awb,
      latestKind: row.latestKind,
      latestSequence: row.latestSequence,
      orderIssued: row.orderStatus === "ISSUED" && awb !== null && awb.length <= 160,
      printed: row.printed === true,
    }];
  }));
}

function refusalFor(status: string, facts: { orderIssued: boolean; printed: boolean } | undefined): HandoverRefusal | null {
  if (status === "CANCELLED") return "ORDER_CANCELLED";
  if (["IN_TRANSIT", "DELIVERED", "PROBLEM", "RTS_QUEUED", "RTS_IN_TRANSIT", "RTS_RECEIVED"].includes(status)) return "PICKED_UP";
  if (status !== "ISSUED" || !facts?.orderIssued) return "NOT_ISSUED";
  if (!facts.printed) return "NOT_PRINTED";
  return null;
}

async function appendHandoverEvent(
  tx: TenantTransaction,
  context: TenantContext,
  input: { shipmentId: string; sequence: number } & ({ kind: "HANDED_OVER"; method: HandoverMethod; note: string | null } | { kind: "UNDONE" }),
) {
  const [event] = await tx
    .insert(shipmentHandoverEvents)
    .values({
      tenantId: context.tenantId,
      shipmentId: input.shipmentId,
      sequence: input.sequence,
      kind: input.kind,
      method: input.kind === "HANDED_OVER" ? input.method : null,
      note: input.kind === "HANDED_OVER" ? input.note : null,
      actorUserId: context.userId,
      actorRole: context.role,
    })
    .returning({ id: shipmentHandoverEvents.id });
  if (!event) throw new Error("Handover event was not recorded.");
  // T-259: the gerai is always recorded. No note, recipient or courier text in the audit trail.
  await tx.insert(auditEvents).values({
    actorId: context.userId,
    actorRole: "TENANT_MEMBER",
    tenantId: context.tenantId,
    action: input.kind === "HANDED_OVER" ? "SHIPMENT_HANDOVER_RECORDED" : "SHIPMENT_HANDOVER_UNDONE",
    targetType: "SHIPMENT",
    targetId: input.shipmentId,
    outcome: "SUCCESS",
    metadata: input.kind === "HANDED_OVER"
      ? { eventId: event.id, hasNote: input.note !== null, method: input.method, sequence: input.sequence }
      : { eventId: event.id, sequence: input.sequence },
  });
  return event.id;
}

export class HandoverInputError extends Error {
  constructor() {
    super("Handover input is invalid.");
    this.name = "HandoverInputError";
  }
}

/**
 * Marks the chosen shipments (by the tenant's own shipment numbers) as handed over, in one
 * transaction. Eligible: resi issued, label printed at least once, still ISSUED. Already handed
 * over → "ALREADY" (no second event). Anything else is refused with its reason; the eligible
 * rest is still marked. Idempotent: a retry of the same batch adds nothing.
 */
export async function markShipmentsHandedOver(
  tx: TenantTransaction,
  context: TenantContext,
  input: { numbers: readonly number[]; method: HandoverMethod; note: string | null },
): Promise<HandoverMarkRow[]> {
  const numbers = [...new Set(input.numbers)];
  if (
    numbers.length === 0
    || numbers.length > HANDOVER_BATCH_MAX
    || !numbers.every((number) => Number.isSafeInteger(number) && number >= SHIPMENT_NUMBER_MIN && number <= SHIPMENT_NUMBER_MAX)
  ) {
    throw new HandoverInputError();
  }

  const locked = await lockShipments(tx, context, inArray(shipments.tenantNumber, numbers)!);
  const facts = await loadHandoverFacts(tx, context, locked.map((row) => row.id));
  const byNumber = new Map(locked.map((row) => [Number(row.tenant_number), row]));

  const results: HandoverMarkRow[] = [];
  for (const number of numbers) {
    const shipment = byNumber.get(number);
    if (!shipment) {
      results.push({ number, outcome: "REFUSED", publicReference: null, reason: "NOT_FOUND" });
      continue;
    }
    const fact = facts.get(shipment.id);
    const refusal = refusalFor(shipment.status, fact);
    if (refusal) {
      results.push({ number, outcome: "REFUSED", publicReference: shipment.public_reference, reason: refusal });
      continue;
    }
    if (fact!.latestKind === "HANDED_OVER") {
      results.push({ number, outcome: "ALREADY", publicReference: shipment.public_reference });
      continue;
    }
    await appendHandoverEvent(tx, context, {
      kind: "HANDED_OVER",
      method: input.method,
      note: input.note,
      sequence: fact!.latestSequence + 1,
      shipmentId: shipment.id,
    });
    results.push({ number, outcome: "MARKED", publicReference: shipment.public_reference });
  }
  return results;
}

export type HandoverScanTarget = {
  awb: string | null;
  handoverType: HandoverMethod | null;
  number: number;
  publicReference: string;
  /** READY = in Siap diserahkan (resi issued, printed, ISSUED, not handed over). */
  state: "READY" | "HANDED_OVER" | HandoverRefusal;
};

/**
 * T-270 "Scan resi": the one shipment of the context's tenant a scanned code names — its resi
 * (exact, case-insensitive), its prefixed nomor kiriman, or its unprefixed number — and its
 * handover state, with the same eligibility rules as `markShipmentsHandedOver`. A resi match wins
 * over a number match (an all-digit resi can look like a nomor kiriman). null = nothing of this
 * tenant's; another gerai's shipment is never read (tenant column here, RLS behind it). Read only.
 */
export async function findHandoverScanTarget(
  tx: TenantTransaction,
  context: TenantContext,
  scan: NonNullable<ReturnType<typeof normalizeHandoverScan>>,
): Promise<HandoverScanTarget | null> {
  const awbMatch = sql`upper(btrim(${providerOrderSnapshots.cnoteNo})) = ${scan.code}`;
  const [row] = await tx
    .select({
      shipmentId: shipments.id,
      tenantNumber: shipments.tenantNumber,
      publicReference: shipments.publicReference,
      status: shipments.status,
      handoverType: shipmentDrafts.handoverType,
    })
    .from(shipments)
    .leftJoin(
      providerOrderSnapshots,
      and(eq(providerOrderSnapshots.shipmentId, shipments.id), eq(providerOrderSnapshots.tenantId, shipments.tenantId)),
    )
    .leftJoin(
      shipmentDrafts,
      and(eq(shipmentDrafts.shipmentId, shipments.id), eq(shipmentDrafts.tenantId, shipments.tenantId)),
    )
    .where(and(
      eq(shipments.tenantId, context.tenantId),
      or(
        awbMatch,
        scan.reference ? sql`upper(${shipments.publicReference}) = ${scan.reference}` : undefined,
        scan.number !== null ? eq(shipments.tenantNumber, scan.number) : undefined,
      ),
    ))
    .orderBy(sql`(${awbMatch}) IS TRUE DESC`, sql`${shipments.createdAt} DESC`)
    .limit(1);
  if (!row) return null;
  const fact = (await loadHandoverFacts(tx, context, [row.shipmentId])).get(row.shipmentId);
  const refusal = refusalFor(row.status, fact);
  return {
    awb: fact?.awb ?? null,
    handoverType: row.handoverType === "PICKUP" || row.handoverType === "DROP_OFF" ? row.handoverType : null,
    number: Number(row.tenantNumber),
    publicReference: row.publicReference,
    state: refusal ?? (fact!.latestKind === "HANDED_OVER" ? "HANDED_OVER" : "READY"),
  };
}

export type HandoverUndoOutcome =
  | { outcome: "UNDONE" }
  | { outcome: "ALREADY" }
  | { outcome: "REFUSED"; reason: "NOT_FOUND" | "PICKED_UP" | "ORDER_CANCELLED" | "NOT_ISSUED" };

/**
 * "Batalkan penandaan": records an UNDONE event while Mengantar has not reported the pickup scan
 * (the shipment is still ISSUED). No handover to undo → "ALREADY" (no event).
 */
export async function undoShipmentHandover(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<HandoverUndoOutcome> {
  const [shipment] = await lockShipments(tx, context, eq(shipments.id, shipmentId));
  if (!shipment) return { outcome: "REFUSED", reason: "NOT_FOUND" };
  const fact = (await loadHandoverFacts(tx, context, [shipment.id])).get(shipment.id);
  if (fact?.latestKind !== "HANDED_OVER") return { outcome: "ALREADY" };
  if (shipment.status !== "ISSUED") {
    const refusal = refusalFor(shipment.status, fact);
    return { outcome: "REFUSED", reason: refusal === "ORDER_CANCELLED" || refusal === "PICKED_UP" ? refusal : "NOT_ISSUED" };
  }
  await appendHandoverEvent(tx, context, { kind: "UNDONE", sequence: fact.latestSequence + 1, shipmentId: shipment.id });
  return { outcome: "UNDONE" };
}
