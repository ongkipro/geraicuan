import "server-only";

import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";

import {
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
import { maskPhone } from "@/lib/pii-redaction";

export type PrintableLabel = {
  shipmentId: string;
  awb: string;
  courier: string;
  providerService: string;
  issuedAt: Date;
  isCod: boolean;
  shippingAmountIdr: number;
  insuranceAmountIdr: number | null;
  providerCodAmountIdr: number | null;
  codBreakdown: {
    goodsValueIdr: number;
    shippingAmountIdr: number;
    serviceFeeIdr: number;
    vatAmountIdr: number;
  } | null;
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
  awb: string | null;
  courier: string;
  providerService: string;
  status: "ISSUED" | "AWAITING_UPSTREAM_PAYMENT";
  issuedAt: Date | null;
  destinationAreaLabel: string;
  recipientName: string;
  recipientPhoneMasked: string;
  isCod: boolean;
  providerCodAmountIdr: number | null;
  printCount: number;
};

export type LabelUnavailableReason =
  | "NOT_FOUND"
  | "NOT_ISSUED"
  | "AWAITING_UPSTREAM_PAYMENT";

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
      shipmentStatus: shipments.status,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      packageContent: shipmentDrafts.packageContent,
      packageWeightGrams: shipmentDrafts.packageWeightGrams,
      packageQuantity: shipmentDrafts.packageQuantity,
      packageLengthCm: shipmentDrafts.packageLengthCm,
      packageWidthCm: shipmentDrafts.packageWidthCm,
      packageHeightCm: shipmentDrafts.packageHeightCm,
      declaredValueIdr: shipmentDrafts.declaredValueIdr,
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
      serviceFeeIdr: shipmentCodTotals.serviceFeeIdr,
      vatAmountIdr: shipmentCodTotals.vatAmountIdr,
      calculatedProviderCodAmountIdr: shipmentCodTotals.providerCodAmountIdr,
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
    (!row.isCod && row.providerCodAmountIdr !== null)
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

  const hasConsistentCodBreakdown =
    row.isCod &&
    row.goodsValueIdr !== null &&
    row.codShippingAmountIdr !== null &&
    row.serviceFeeIdr !== null &&
    row.vatAmountIdr !== null &&
    row.calculatedProviderCodAmountIdr !== null &&
    row.providerCodAmountIdr === row.calculatedProviderCodAmountIdr;

  return {
    shipmentId: row.shipmentId,
    awb,
    courier: row.courier,
    providerService: row.providerService,
    issuedAt: row.issuedAt,
    isCod: row.isCod,
    shippingAmountIdr: row.shippingAmountIdr,
    insuranceAmountIdr: row.insuranceAmountIdr,
    providerCodAmountIdr: row.providerCodAmountIdr,
    codBreakdown: hasConsistentCodBreakdown
      ? {
          goodsValueIdr: row.goodsValueIdr as number,
          shippingAmountIdr: row.codShippingAmountIdr as number,
          serviceFeeIdr: row.serviceFeeIdr as number,
          vatAmountIdr: row.vatAmountIdr as number,
        }
      : null,
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

export async function listPrintableShipments(
  tx: TenantTransaction,
  context: TenantContext,
  filter: { status: "issued" | "unpaid"; awbSuffix?: string },
): Promise<PrintableShipmentRow[]> {
  const awbSuffix = filter.awbSuffix?.trim();
  if (awbSuffix && !AWB_SUFFIX_PATTERN.test(awbSuffix)) return [];

  const status = filter.status === "issued"
    ? "ISSUED"
    : "AWAITING_UPSTREAM_PAYMENT";
  const rows = await tx
    .select({
      shipmentId: shipments.id,
      cnoteNo: providerOrderSnapshots.cnoteNo,
      courier: providerBatches.courier,
      providerService: providerOrderSnapshots.providerService,
      status: shipments.status,
      resolvedAt: providerOrderSnapshots.resolvedAt,
      destinationAreaLabel: shipmentDrafts.destinationAreaLabel,
      recipientName: shipmentParties.name,
      recipientPhone: shipmentParties.phone,
      isCod: providerOrderSnapshots.isCod,
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
        eq(shipments.status, status),
        eq(providerOrderSnapshots.status, status),
        filter.status === "issued"
          ? sql`char_length(btrim(${providerOrderSnapshots.cnoteNo})) BETWEEN 1 AND 160`
          : isNull(providerOrderSnapshots.cnoteNo),
        awbSuffix
          ? ilike(providerOrderSnapshots.cnoteNo, `%${awbSuffix}`)
          : undefined,
      ),
    )
    .orderBy(desc(providerOrderSnapshots.resolvedAt), desc(shipments.createdAt))
    .limit(100);

  return rows.map((row) => ({
    shipmentId: row.shipmentId,
    awb: row.cnoteNo?.trim() ?? null,
    courier: row.courier,
    providerService: row.providerService,
    status: row.status as "ISSUED" | "AWAITING_UPSTREAM_PAYMENT",
    issuedAt: row.status === "ISSUED" ? row.resolvedAt : null,
    destinationAreaLabel: row.destinationAreaLabel,
    recipientName: row.recipientName,
    recipientPhoneMasked: maskPhone(row.recipientPhone),
    isCod: row.isCod,
    providerCodAmountIdr: row.providerCodAmountIdr,
    printCount: row.printCount,
  }));
}
