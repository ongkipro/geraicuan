import "server-only";

import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  sql,
} from "drizzle-orm";

import {
  outlets,
  printEvents,
  providerBatches,
  providerOrderSnapshots,
  shipmentCodTotals,
  shipmentDrafts,
  shipmentParties,
  shipments,
  users,
} from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import type { AnalyticsRange } from "@/lib/analytics-range";
import { codChargeBreakdown, type CodChargeBreakdown } from "@/lib/mengantar-cod-fee";
import { paymentMethodOf, type PaymentMethod } from "@/lib/payment-method";

export type PrintableLabel = {
  shipmentId: string;
  publicReference: string;
  awb: string;
  courier: string;
  providerService: string;
  issuedAt: Date;
  isCod: boolean;
  /**
   * T-186: COD Ongkir prints the shipping charge as the only amount the courier
   * collects and never a goods breakdown.
   */
  paymentMethod: PaymentMethod;
  shippingAmountIdr: number;
  insuranceAmountIdr: number | null;
  providerCodAmountIdr: number | null;
  /**
   * T-193: goods + shipping + Biaya COD (Mengantar's fee, VAT inside) + rounding
   * = the COD amount. Null for COD Ongkir, non-COD, and a pre-T-175 version 1
   * amount, whose lines cannot add up with Mengantar's actual fee.
   */
  codBreakdown: CodChargeBreakdown | null;
  package: {
    content: string;
    weightGrams: number;
    quantity: number;
    lengthCm: number | null;
    widthCm: number | null;
    heightCm: number | null;
    declaredValueIdr: number;
  };
  destinationAreaLabel: string;
  /** The shipment's own outlet, printed on the T-176 sender stub. */
  outletName: string;
  sender: { name: string; phone: string; address: string };
  recipient: { name: string; phone: string; address: string };
  printCount: number;
  lastPrintedAt: Date | null;
};

export type PrintEventRecord = {
  sequence: number | null;
  printedAt: Date;
  outcome: "PRINTED" | "BLOCKED";
  reasonCode: string | null;
  actorNameMasked: string;
  actorRole: "TENANT_ADMIN" | "OPERATOR";
};

export type PrintableShipmentRow = {
  shipmentId: string;
  publicReference: string;
  awb: string | null;
  courier: string;
  providerService: string;
  status: "ISSUED" | "AWAITING_UPSTREAM_PAYMENT" | "CANCELLED";
  issuedAt: Date | null;
  destinationAreaLabel: string;
  recipientName: string;
  recipientPhone: string;
  isCod: boolean;
  /** T-190: so the list never prints a COD Ongkir charge as a COD total. */
  paymentMethod: PaymentMethod;
  providerCodAmountIdr: number | null;
  printCount: number;
};

/**
 * PR-52 print-state entry on Cetak resi; `semua` is every printable (ISSUED) resi.
 * T-238: `batal` lists resi Mengantar has since cancelled (shipment CANCELLED, order
 * still ISSUED with its AWB); they are never printable and never in `semua`.
 */
export type LabelPrintStateFilter = "semua" | "belum" | "sudah" | "batal";

export type LabelPrintSummary = {
  "LBL-ALL": number;
  "LBL-PRINTED": number;
  "LBL-UNPRINTED": number;
  "LBL-CANCELLED": number;
};

export type LabelIndexPage = {
  rows: PrintableShipmentRow[];
  summary: LabelPrintSummary;
};

export type LabelUnavailableReason =
  | "NOT_FOUND"
  | "NOT_ISSUED"
  | "AWAITING_UPSTREAM_PAYMENT"
  // T-238: Mengantar reported the order cancelled; refused and recorded as such.
  | "CANCELLED";

export type PrintAttemptResult =
  | { outcome: "PRINTED"; sequence: number; printedAt: Date; awb: string }
  | {
      outcome: "BLOCKED";
      reason: Exclude<LabelUnavailableReason, "NOT_FOUND">;
      printedAt: Date;
    };

export class LabelUnavailableError extends Error {
  constructor(readonly reason: LabelUnavailableReason) {
    super("Shipment label is unavailable.");
    this.name = "LabelUnavailableError";
  }
}

export class PrintAttemptConflictError extends Error {
  constructor() {
    super("Label print attempt conflicts with an existing event.");
    this.name = "PrintAttemptConflictError";
  }
}

const AWB_SUFFIX_PATTERN = /^[a-z0-9]{3,24}$/i;

function maskActorName(name: string | null) {
  const initial = Array.from(name?.trim() ?? "")[0];
  return initial ? `${initial}••••` : "Pengguna tersimpan";
}

async function loadPrintCandidate(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
) {
  const [row] = await tx
    .select({
      shipmentStatus: shipments.status,
      providerOrderSnapshotId: providerOrderSnapshots.id,
      providerStatus: providerOrderSnapshots.status,
      cnoteNo: providerOrderSnapshots.cnoteNo,
    })
    .from(shipments)
    .leftJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .where(
      and(
        eq(shipments.id, shipmentId),
        eq(shipments.tenantId, context.tenantId),
      ),
    )
    .limit(1);

  if (!row) throw new LabelUnavailableError("NOT_FOUND");
  if (row.shipmentStatus === "CANCELLED") throw new LabelUnavailableError("CANCELLED");
  if (row.shipmentStatus === "AWAITING_UPSTREAM_PAYMENT") {
    throw new LabelUnavailableError("AWAITING_UPSTREAM_PAYMENT");
  }
  const awb = row.cnoteNo?.trim();
  if (
    row.shipmentStatus !== "ISSUED" ||
    row.providerStatus !== "ISSUED" ||
    !row.providerOrderSnapshotId ||
    !awb ||
    awb.length > 160
  ) {
    throw new LabelUnavailableError("NOT_ISSUED");
  }

  return {
    awb,
    providerOrderSnapshotId: row.providerOrderSnapshotId,
  };
}

export async function loadPrintableLabel(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<PrintableLabel> {
  await loadPrintCandidate(tx, context, shipmentId);

  const [row] = await tx
    .select({
      shipmentId: shipments.id,
      publicReference: shipments.publicReference,
      shipmentStatus: shipments.status,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      packageContent: shipmentDrafts.packageContent,
      packageWeightGrams: shipmentDrafts.packageWeightGrams,
      packageQuantity: shipmentDrafts.packageQuantity,
      packageLengthCm: shipmentDrafts.packageLengthCm,
      packageWidthCm: shipmentDrafts.packageWidthCm,
      packageHeightCm: shipmentDrafts.packageHeightCm,
      declaredValueIdr: shipmentDrafts.declaredValueIdr,
      codShippingOnly: shipmentDrafts.codShippingOnly,
      outletName: outlets.name,
      courier: providerBatches.courier,
      providerService: providerOrderSnapshots.providerService,
      providerStatus: providerOrderSnapshots.status,
      cnoteNo: providerOrderSnapshots.cnoteNo,
      issuedAt: providerOrderSnapshots.resolvedAt,
      isCod: providerOrderSnapshots.isCod,
      shippingAmountIdr: providerOrderSnapshots.shippingAmountIdr,
      insuranceAmountIdr: providerOrderSnapshots.insuranceAmountIdr,
      providerCodAmountIdr: providerOrderSnapshots.providerCodAmountIdr,
      goodsValueIdr: shipmentCodTotals.goodsValueIdr,
      codShippingAmountIdr: shipmentCodTotals.shippingAmountIdr,
      calculatedProviderCodAmountIdr: shipmentCodTotals.providerCodAmountIdr,
      codFormulaVersion: shipmentCodTotals.codFormulaVersion,
    })
    .from(shipments)
    .innerJoin(
      shipmentDrafts,
      and(
        eq(shipmentDrafts.shipmentId, shipments.id),
        eq(shipmentDrafts.tenantId, shipments.tenantId),
      ),
    )
    .innerJoin(
      outlets,
      and(
        eq(outlets.id, shipments.outletId),
        eq(outlets.tenantId, shipments.tenantId),
      ),
    )
    .innerJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .innerJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
      ),
    )
    .leftJoin(
      shipmentCodTotals,
      and(
        eq(shipmentCodTotals.shipmentId, shipments.id),
        eq(shipmentCodTotals.tenantId, shipments.tenantId),
      ),
    )
    .where(
      and(
        eq(shipments.id, shipmentId),
        eq(shipments.tenantId, context.tenantId),
        eq(shipments.status, "ISSUED"),
        eq(providerOrderSnapshots.status, "ISSUED"),
      ),
    )
    .limit(1);

  const awb = row?.cnoteNo?.trim();
  if (
    !row ||
    !awb ||
    awb.length > 160 ||
    !row.issuedAt ||
    (row.isCod && row.providerCodAmountIdr === null) ||
    (!row.isCod && row.providerCodAmountIdr !== null) ||
    // A label states what the courier collects, so the order, the draft's
    // method and the recorded formula must tell one story (T-186).
    (row.codShippingOnly && (row.codFormulaVersion !== 3
      || row.calculatedProviderCodAmountIdr !== row.providerCodAmountIdr))
  ) {
    throw new LabelUnavailableError("NOT_ISSUED");
  }

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
        eq(shipmentParties.tenantId, context.tenantId),
        eq(shipmentParties.shipmentId, shipmentId),
        inArray(shipmentParties.role, ["SENDER", "RECIPIENT"]),
      ),
    );
  const sender = parties.find((party) => party.role === "SENDER");
  const recipient = parties.find((party) => party.role === "RECIPIENT");
  if (!sender || !recipient) throw new LabelUnavailableError("NOT_ISSUED");

  const [summary] = await tx
    .select({
      printCount: sql<number>`count(*) filter (
        where ${printEvents.outcome} = 'PRINTED'
      )::integer`.mapWith(Number),
      lastPrintedAt: sql<string | null>`max(${printEvents.printedAt}) filter (
        where ${printEvents.outcome} = 'PRINTED'
      )`,
    })
    .from(printEvents)
    .where(
      and(
        eq(printEvents.tenantId, context.tenantId),
        eq(printEvents.shipmentId, shipmentId),
      ),
    );

  const paymentMethod = paymentMethodOf(row.isCod, row.codShippingOnly);
  // The goods + shipping + fee breakdown belongs to full COD only; printing it
  // on COD Ongkir would tell the courier to collect goods the buyer paid for.
  const codBreakdown =
    paymentMethod === "COD" &&
    row.goodsValueIdr !== null &&
    row.codShippingAmountIdr !== null &&
    row.providerCodAmountIdr !== null &&
    row.providerCodAmountIdr === row.calculatedProviderCodAmountIdr
      ? codChargeBreakdown({
          goodsValueIdr: row.goodsValueIdr,
          shippingAmountIdr: row.codShippingAmountIdr,
          providerCodAmountIdr: row.providerCodAmountIdr,
        })
      : null;

  return {
    shipmentId: row.shipmentId,
    publicReference: row.publicReference,
    awb,
    courier: row.courier,
    providerService: row.providerService,
    issuedAt: row.issuedAt,
    isCod: row.isCod,
    paymentMethod,
    shippingAmountIdr: row.shippingAmountIdr,
    insuranceAmountIdr: row.insuranceAmountIdr,
    providerCodAmountIdr: row.providerCodAmountIdr,
    codBreakdown,
    package: {
      content: row.packageContent,
      weightGrams: row.packageWeightGrams,
      quantity: row.packageQuantity,
      lengthCm: row.packageLengthCm,
      widthCm: row.packageWidthCm,
      heightCm: row.packageHeightCm,
      declaredValueIdr: row.declaredValueIdr,
    },
    destinationAreaLabel: row.destinationAreaLabel,
    outletName: row.outletName,
    sender: {
      name: sender.name,
      phone: sender.phone,
      address: sender.address,
    },
    recipient: {
      name: recipient.name,
      phone: recipient.phone,
      address: recipient.address,
    },
    printCount: summary?.printCount ?? 0,
    lastPrintedAt: summary?.lastPrintedAt
      ? new Date(summary.lastPrintedAt)
      : null,
  };
}

/** PR-55 Riwayat cetak resi row: one recorded print attempt. */
export type PrintHistoryRow = {
  actorRole: "TENANT_ADMIN" | "OPERATOR";
  outcome: "PRINTED" | "BLOCKED";
  outletName: string;
  printEventId: string;
  printedAt: Date;
  publicReference: string;
  reasonCode: string | null;
  /**
   * Spec 19 RPT-PRN-REPRINTS. Successful prints after the first, read off the
   * recorded sequences of this shipment's whole print record rather than of
   * the filtered window: a reprint is an audit fact about the shipment, and a
   * narrower window would report a second print as a first one.
   */
  reprintCount: number;
  sequence: number | null;
  shipmentId: string;
};

export type PrintHistoryPage = {
  generatedAt: Date;
  rows: PrintHistoryRow[];
  /** Spec 19 RPT-PRN-EVENTS: events the filters match, not rows listed. */
  totalCount: number;
};

const PRINT_HISTORY_MAX_ROWS = 200;

/**
 * PR-55 Riwayat cetak resi.
 *
 * Tenant Admin only: the page is an audit record, and the read refuses rather
 * than trusting the surface that calls it. The tenant predicate is the
 * `print_events` table's own column, not row-level security alone, and the
 * outlet dimension is the shipment's outlet — `print_events` has none.
 */
export async function loadPrintHistoryPage(
  tx: TenantTransaction,
  context: TenantContext,
  filter: {
    /** PR-53 window on the printed-at basis. */
    range: AnalyticsRange;
    outletId?: string | null;
  },
): Promise<PrintHistoryPage> {
  if (context.role !== "TENANT_ADMIN") {
    throw new Error("Print history report requires TENANT_ADMIN.");
  }

  const where = and(
    eq(printEvents.tenantId, context.tenantId),
    eq(shipments.tenantId, context.tenantId),
    gte(printEvents.printedAt, filter.range.startInclusive),
    lt(printEvents.printedAt, filter.range.endExclusive),
    filter.outletId ? eq(shipments.outletId, filter.outletId) : undefined,
  );

  const [countRow] = await tx
    .select({
      generatedAt: sql<Date>`statement_timestamp()`.mapWith(
        (value) => value instanceof Date ? value : new Date(String(value)),
      ),
      totalCount: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(printEvents)
    .innerJoin(
      shipments,
      and(
        eq(shipments.id, printEvents.shipmentId),
        eq(shipments.tenantId, printEvents.tenantId),
      ),
    )
    .where(where);

  const rows = await tx
    .select({
      actorRole: printEvents.actorRole,
      outcome: printEvents.outcome,
      outletName: outlets.name,
      printEventId: printEvents.id,
      printedAt: printEvents.printedAt,
      publicReference: shipments.publicReference,
      reasonCode: printEvents.reasonCode,
      // The highest recorded sequence is the number of successful prints, so
      // one less than it is the number of reprints, floored at zero for a
      // shipment whose only events were blocked.
      reprintCount: sql<number>`greatest((
        SELECT coalesce(max(reprint_history.sequence), 0)
        FROM ${printEvents} AS reprint_history
        WHERE reprint_history.tenant_id = ${context.tenantId}
          AND reprint_history.shipment_id = ${printEvents.shipmentId}
          AND reprint_history.outcome = 'PRINTED'
      ) - 1, 0)::int`.mapWith(Number),
      sequence: printEvents.sequence,
      shipmentId: printEvents.shipmentId,
    })
    .from(printEvents)
    .innerJoin(
      shipments,
      and(
        eq(shipments.id, printEvents.shipmentId),
        eq(shipments.tenantId, printEvents.tenantId),
      ),
    )
    .innerJoin(
      outlets,
      and(
        eq(outlets.id, shipments.outletId),
        eq(outlets.tenantId, shipments.tenantId),
      ),
    )
    .where(where)
    .orderBy(desc(printEvents.printedAt), desc(printEvents.id))
    .limit(PRINT_HISTORY_MAX_ROWS);

  return {
    generatedAt: countRow?.generatedAt ?? new Date(),
    rows,
    totalCount: countRow?.totalCount ?? 0,
  };
}

export async function listPrintEvents(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
  limit?: number,
): Promise<PrintEventRecord[]> {
  const query = tx
    .select({
      sequence: printEvents.sequence,
      printedAt: printEvents.printedAt,
      outcome: printEvents.outcome,
      reasonCode: printEvents.reasonCode,
      actorName: users.name,
      actorRole: printEvents.actorRole,
    })
    .from(printEvents)
    .leftJoin(users, eq(users.id, printEvents.actorUserId))
    .where(
      and(
        eq(printEvents.tenantId, context.tenantId),
        eq(printEvents.shipmentId, shipmentId),
      ),
    )
    .orderBy(desc(printEvents.printedAt), desc(printEvents.sequence));

  const rows = limit === undefined
    ? await query
    : await query.limit(Math.max(1, Math.min(Math.trunc(limit), 200)));
  return rows.map((row) => ({
    sequence: row.sequence,
    printedAt: row.printedAt,
    outcome: row.outcome,
    reasonCode: row.reasonCode,
    actorNameMasked: maskActorName(row.actorName),
    actorRole: row.actorRole,
  }));
}

async function loadPrintAttemptReplay(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
  attemptId: string,
): Promise<PrintAttemptResult | null> {
  const [event] = await tx
    .select({
      outcome: printEvents.outcome,
      sequence: printEvents.sequence,
      printedAt: printEvents.printedAt,
      awb: printEvents.awbSnapshot,
      reasonCode: printEvents.reasonCode,
    })
    .from(printEvents)
    .where(
      and(
        eq(printEvents.id, attemptId),
        eq(printEvents.tenantId, context.tenantId),
        eq(printEvents.shipmentId, shipmentId),
        eq(printEvents.actorUserId, context.userId),
      ),
    )
    .limit(1);

  if (!event) return null;
  if (
    event.outcome === "PRINTED"
    && event.sequence !== null
    && event.awb
  ) {
    return {
      outcome: "PRINTED",
      sequence: event.sequence,
      printedAt: event.printedAt,
      awb: event.awb,
    };
  }
  if (
    event.outcome === "BLOCKED"
    && (
      event.reasonCode === "NOT_ISSUED"
      || event.reasonCode === "AWAITING_UPSTREAM_PAYMENT"
      || event.reasonCode === "CANCELLED"
    )
  ) {
    return {
      outcome: "BLOCKED",
      reason: event.reasonCode,
      printedAt: event.printedAt,
    };
  }
  throw new PrintAttemptConflictError();
}

async function replayOrConflict(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
  attemptId: string,
) {
  const replay = await loadPrintAttemptReplay(
    tx,
    context,
    shipmentId,
    attemptId,
  );
  if (replay) return replay;
  throw new PrintAttemptConflictError();
}

export async function appendPrintAttempt(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
  attemptId: string,
): Promise<PrintAttemptResult> {
  const preflight = await loadPrintAttemptReplay(
    tx,
    context,
    shipmentId,
    attemptId,
  );
  if (preflight) return preflight;

  const lockedShipment = await tx.execute<{ id: string }>(sql`
    SELECT id
    FROM ${shipments}
    WHERE id = ${shipmentId}
      AND tenant_id = ${context.tenantId}
    FOR UPDATE
  `);
  if (lockedShipment.rows.length !== 1) {
    throw new LabelUnavailableError("NOT_FOUND");
  }

  const replayAfterLock = await loadPrintAttemptReplay(
    tx,
    context,
    shipmentId,
    attemptId,
  );
  if (replayAfterLock) return replayAfterLock;

  let candidate: Awaited<ReturnType<typeof loadPrintCandidate>>;
  try {
    candidate = await loadPrintCandidate(tx, context, shipmentId);
  } catch (error) {
    if (!(error instanceof LabelUnavailableError)) throw error;
    if (error.reason === "NOT_FOUND") throw error;

    const [row] = await tx
      .select({ providerOrderSnapshotId: providerOrderSnapshots.id })
      .from(providerOrderSnapshots)
      .where(
        and(
          eq(providerOrderSnapshots.shipmentId, shipmentId),
          eq(providerOrderSnapshots.tenantId, context.tenantId),
        ),
      )
      .limit(1);
    if (!row) throw error;

    const [inserted] = await tx
      .insert(printEvents)
      .values({
        id: attemptId,
        tenantId: context.tenantId,
        shipmentId,
        providerOrderSnapshotId: row.providerOrderSnapshotId,
        outcome: "BLOCKED",
        reasonCode: error.reason,
        actorUserId: context.userId,
        actorRole: context.role,
      })
      .onConflictDoNothing()
      .returning({ printedAt: printEvents.printedAt });
    if (inserted) {
      return {
        outcome: "BLOCKED",
        reason: error.reason,
        printedAt: inserted.printedAt,
      };
    }
    return replayOrConflict(tx, context, shipmentId, attemptId);
  }

  const [inserted] = await tx
    .insert(printEvents)
    .values({
      id: attemptId,
      tenantId: context.tenantId,
      shipmentId,
      providerOrderSnapshotId: candidate.providerOrderSnapshotId,
      sequence: sql<number>`(
        SELECT coalesce(max(prior.sequence), 0) + 1
        FROM ${printEvents} AS prior
        WHERE prior.tenant_id = ${context.tenantId}
          AND prior.shipment_id = ${shipmentId}
          AND prior.outcome = 'PRINTED'
      )`,
      outcome: "PRINTED",
      awbSnapshot: candidate.awb,
      actorUserId: context.userId,
      actorRole: context.role,
    })
    .onConflictDoNothing()
    .returning({
      sequence: printEvents.sequence,
      printedAt: printEvents.printedAt,
      awb: printEvents.awbSnapshot,
    });

  if (inserted?.sequence && inserted.awb) {
    return {
      outcome: "PRINTED",
      sequence: inserted.sequence,
      printedAt: inserted.printedAt,
      awb: inserted.awb,
    };
  }
  return replayOrConflict(tx, context, shipmentId, attemptId);
}

/**
 * "Sudah dicetak" as one SQL predicate, so the panel count and the filtered
 * list can never disagree about what a printed label is. The tenant predicate
 * is the table's own column, not row-level security alone.
 */
function printedPredicate(context: TenantContext) {
  return sql`EXISTS (
    SELECT 1
    FROM ${printEvents} AS print_state
    WHERE print_state.tenant_id = ${context.tenantId}
      AND print_state.shipment_id = ${shipments.id}
      AND print_state.outcome = 'PRINTED'
  )`;
}

/**
 * PR-53 issued basis for Cetak resi. `resolved_at` is the instant the provider
 * settled the order; an order still waiting on upstream payment has no settled
 * instant, so its creation instant stands in rather than dropping the row out
 * of every range.
 */
function issuedWithin(range: AnalyticsRange | undefined) {
  return range
    ? and(
        gte(
          sql`coalesce(${providerOrderSnapshots.resolvedAt}, ${providerOrderSnapshots.createdAt})`,
          range.startInclusive,
        ),
        lt(
          sql`coalesce(${providerOrderSnapshots.resolvedAt}, ${providerOrderSnapshots.createdAt})`,
          range.endExclusive,
        ),
      )
    : undefined;
}

function printStatePredicate(
  context: TenantContext,
  printState: LabelPrintStateFilter | undefined,
) {
  if (printState === "sudah") return printedPredicate(context);
  if (printState === "belum") return sql`NOT ${printedPredicate(context)}`;
  return undefined;
}

export async function listPrintableShipments(
  tx: TenantTransaction,
  context: TenantContext,
  filter: {
    status: "issued" | "unpaid";
    awbSuffix?: string;
    printState?: LabelPrintStateFilter;
    /** PR-53 issued-basis window; omitted means the tenant's whole lifetime. */
    range?: AnalyticsRange;
  },
): Promise<PrintableShipmentRow[]> {
  const awbSuffix = filter.awbSuffix?.trim();
  if (awbSuffix && !AWB_SUFFIX_PATTERN.test(awbSuffix)) return [];

  const status = filter.status === "issued"
    ? "ISSUED"
    : "AWAITING_UPSTREAM_PAYMENT";
  const cancelledView = filter.status === "issued" && filter.printState === "batal";
  const rows = await tx
    .select({
      shipmentId: shipments.id,
      publicReference: shipments.publicReference,
      cnoteNo: providerOrderSnapshots.cnoteNo,
      courier: providerBatches.courier,
      providerService: providerOrderSnapshots.providerService,
      status: shipments.status,
      resolvedAt: providerOrderSnapshots.resolvedAt,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      recipientName: shipmentParties.name,
      recipientPhone: shipmentParties.phone,
      isCod: providerOrderSnapshots.isCod,
      codShippingOnly: shipmentDrafts.codShippingOnly,
      providerCodAmountIdr: providerOrderSnapshots.providerCodAmountIdr,
      printCount: sql<number>`(
        SELECT count(*)::integer
        FROM ${printEvents} AS history
        WHERE history.tenant_id = ${context.tenantId}
          AND history.shipment_id = ${shipments.id}
          AND history.outcome = 'PRINTED'
      )`.mapWith(Number),
    })
    .from(shipments)
    .innerJoin(
      shipmentDrafts,
      and(
        eq(shipmentDrafts.shipmentId, shipments.id),
        eq(shipmentDrafts.tenantId, shipments.tenantId),
      ),
    )
    .innerJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .innerJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
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
    .where(
      and(
        eq(shipments.tenantId, context.tenantId),
        eq(shipments.status, cancelledView ? "CANCELLED" : status),
        eq(providerOrderSnapshots.status, status),
        filter.status === "issued"
          ? sql`char_length(btrim(${providerOrderSnapshots.cnoteNo})) BETWEEN 1 AND 160`
          : isNull(providerOrderSnapshots.cnoteNo),
        awbSuffix
          ? ilike(providerOrderSnapshots.cnoteNo, `%${awbSuffix}`)
          : undefined,
        printStatePredicate(context, filter.printState),
        issuedWithin(filter.range),
      ),
    )
    .orderBy(desc(providerOrderSnapshots.resolvedAt), desc(shipments.createdAt))
    .limit(100);

  return rows.map((row) => ({
    shipmentId: row.shipmentId,
    publicReference: row.publicReference,
    awb: row.cnoteNo?.trim() ?? null,
    courier: row.courier,
    providerService: row.providerService,
    status: row.status as PrintableShipmentRow["status"],
    issuedAt: row.status === "AWAITING_UPSTREAM_PAYMENT" ? null : row.resolvedAt,
    destinationAreaLabel: row.destinationAreaLabel,
    recipientName: row.recipientName,
    recipientPhone: row.recipientPhone,
    isCod: row.isCod,
    paymentMethod: paymentMethodOf(row.isCod, row.codShippingOnly),
    providerCodAmountIdr: row.providerCodAmountIdr,
    printCount: row.printCount,
  }));
}

/**
 * PR-52: the Cetak resi list and its state panel in one pass.
 *
 * The counts are scoped exactly like the list they filter — the same tenant,
 * the same status facet and the same AWB suffix — so an entry's number always
 * equals the number of rows choosing it returns.
 */
export async function loadLabelIndexPage(
  tx: TenantTransaction,
  context: TenantContext,
  filter: {
    status: "issued" | "unpaid";
    awbSuffix?: string;
    printState?: LabelPrintStateFilter;
    /** PR-53 issued-basis window; omitted means the tenant's whole lifetime. */
    range?: AnalyticsRange;
  },
): Promise<LabelIndexPage> {
  const awbSuffix = filter.awbSuffix?.trim();
  if (awbSuffix && !AWB_SUFFIX_PATTERN.test(awbSuffix)) {
    return { rows: [], summary: { "LBL-ALL": 0, "LBL-PRINTED": 0, "LBL-UNPRINTED": 0, "LBL-CANCELLED": 0 } };
  }

  const status = filter.status === "issued" ? "ISSUED" : "AWAITING_UPSTREAM_PAYMENT";
  const printed = printedPredicate(context);
  // One pass over both cohorts: the printable one (shipment still `status`) and, for
  // issued resi, the one Mengantar cancelled since (T-238).
  const printable = sql`${shipments.status} = ${status}`;
  const [summaryRow] = await tx
    .select({
      all: sql<number>`count(*) FILTER (WHERE ${printable})::int`.mapWith(Number),
      printed: sql<number>`count(*) FILTER (WHERE ${printable} AND ${printed})::int`.mapWith(Number),
      unprinted: sql<number>`count(*) FILTER (WHERE ${printable} AND NOT ${printed})::int`.mapWith(Number),
      cancelled: sql<number>`count(*) FILTER (WHERE ${shipments.status} = 'CANCELLED')::int`.mapWith(Number),
    })
    .from(shipments)
    // The same four joins the list makes, or a shipment without a draft, batch
    // or recipient party would be counted and never listed.
    .innerJoin(
      shipmentDrafts,
      and(
        eq(shipmentDrafts.shipmentId, shipments.id),
        eq(shipmentDrafts.tenantId, shipments.tenantId),
      ),
    )
    .innerJoin(
      providerOrderSnapshots,
      and(
        eq(providerOrderSnapshots.shipmentId, shipments.id),
        eq(providerOrderSnapshots.tenantId, shipments.tenantId),
      ),
    )
    .innerJoin(
      providerBatches,
      and(
        eq(providerBatches.id, providerOrderSnapshots.batchId),
        eq(providerBatches.tenantId, providerOrderSnapshots.tenantId),
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
    .where(
      and(
        eq(shipments.tenantId, context.tenantId),
        filter.status === "issued"
          ? inArray(shipments.status, ["ISSUED", "CANCELLED"])
          : eq(shipments.status, status),
        eq(providerOrderSnapshots.status, status),
        filter.status === "issued"
          ? sql`char_length(btrim(${providerOrderSnapshots.cnoteNo})) BETWEEN 1 AND 160`
          : isNull(providerOrderSnapshots.cnoteNo),
        awbSuffix
          ? ilike(providerOrderSnapshots.cnoteNo, `%${awbSuffix}`)
          : undefined,
        issuedWithin(filter.range),
      ),
    );

  const rows = await listPrintableShipments(tx, context, filter);

  return {
    rows,
    summary: {
      "LBL-ALL": summaryRow?.all ?? 0,
      "LBL-PRINTED": summaryRow?.printed ?? 0,
      "LBL-UNPRINTED": summaryRow?.unprinted ?? 0,
      "LBL-CANCELLED": summaryRow?.cancelled ?? 0,
    },
  };
}
