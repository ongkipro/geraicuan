import "server-only";
import { eq, sql, type SQL } from "drizzle-orm";

import { printEvents, providerOrderSnapshots, shipments } from "@/db/schema";
import { TENANT_OPERATIONAL_TIMEZONE, wibDayStart } from "@/db/shipment-event-predicates";
import { handedOverAtSql } from "@/db/shipment-handover-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

/**
 * T-274 (critique 2026-09-30T19-21-59Z P3 #12): Cetak resi's end-of-day line, "Hari ini: n dicetak ·
 * n diserahkan · n tertunda". One statement on one clock:
 * - LBL-PRINTED-TODAY: shipments whose first PRINTED event falls in today (WIB), any status now;
 *   a reprint of an older label does not count again.
 * - LBL-HANDED-OVER-TODAY: the current handover recorded today (WIB) — `countHandedOverToday`'s rule.
 * - LBL-READY-PENDING: still ISSUED with an issued resi, printed, not handed over, first printed
 *   before today — the Tertunda group of Siap diserahkan.
 * `at` fixes the clock (tests); omitted, it is the transaction's clock, the one the tiles use, so
 * read in the tiles' transaction the line and the Tertunda count agree.
 */
export type LabelDaySummary = {
  "LBL-HANDED-OVER-TODAY": number;
  "LBL-PRINTED-TODAY": number;
  "LBL-READY-PENDING": number;
};

export async function loadLabelDaySummary(tx: TenantTransaction, context: TenantContext, at?: Date): Promise<LabelDaySummary> {
  const dayStart: SQL = at
    ? sql`(date_trunc('day', ${at.toISOString()}::timestamptz AT TIME ZONE ${TENANT_OPERATIONAL_TIMEZONE}) AT TIME ZONE ${TENANT_OPERATIONAL_TIMEZONE})`
    : wibDayStart;
  const firstPrintedAt = sql`(
    SELECT min(first_print.printed_at)
    FROM ${printEvents} AS first_print
    WHERE first_print.tenant_id = ${context.tenantId}
      AND first_print.shipment_id = ${shipments.id}
      AND first_print.outcome = 'PRINTED'
  )`;
  const handedOverAt = handedOverAtSql(context);
  // The Cetak resi list's issued-resi rule (label-print-repository), as a predicate on the shipment.
  const issuedResi = sql`EXISTS (
    SELECT 1 FROM ${providerOrderSnapshots} AS resi
    WHERE resi.tenant_id = ${context.tenantId}
      AND resi.shipment_id = ${shipments.id}
      AND resi.status = 'ISSUED'
      AND char_length(btrim(resi.cnote_no)) BETWEEN 1 AND 160
  )`;
  const today = (instant: SQL) => sql`(${instant} >= ${dayStart} AND ${instant} < ${dayStart} + interval '1 day')`;
  const [row] = await tx
    .select({
      handedOverToday: sql<number>`count(*) FILTER (WHERE ${today(handedOverAt)})::int`.mapWith(Number),
      pending: sql<number>`count(*) FILTER (WHERE ${shipments.status} = 'ISSUED' AND ${issuedResi} AND ${handedOverAt} IS NULL AND ${firstPrintedAt} < ${dayStart})::int`.mapWith(Number),
      printedToday: sql<number>`count(*) FILTER (WHERE ${today(firstPrintedAt)})::int`.mapWith(Number),
    })
    .from(shipments)
    .where(eq(shipments.tenantId, context.tenantId));
  return {
    "LBL-HANDED-OVER-TODAY": row?.handedOverToday ?? 0,
    "LBL-PRINTED-TODAY": row?.printedToday ?? 0,
    "LBL-READY-PENDING": row?.pending ?? 0,
  };
}
