"use server";

import { recordLabelPrint } from "@/app/app/label/[shipmentId]/actions";
import { issueMissingBatchInvoices } from "@/app/app/label/cetak/batch-data";
import { MAX_BATCH_SHIPMENTS } from "@/app/app/label/cetak/batch-query";
import { requireTenantPrincipal } from "@/app/app/pengiriman/_list/tenant-page";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";

export type BatchLabelPrintResult = {
  printed: number;
  blocked: number;
  failed: number;
  /** The attempt id each shipment's next request must carry (a retry reuses a failed one). */
  nextAttemptIds: Record<string, string>;
};

/**
 * PR-87 batch step "Cetak label": records one print request per shipment through the
 * single-shipment `recordLabelPrint` (same session guard, validation and idempotent
 * attempt id), one after another.
 */
export async function recordBatchLabelPrints(
  entries: { shipmentId: string; attemptId: string }[],
): Promise<BatchLabelPrintResult> {
  const result: BatchLabelPrintResult = { blocked: 0, failed: 0, nextAttemptIds: {}, printed: 0 };
  if (!Array.isArray(entries)) return result;
  for (const entry of entries.slice(0, MAX_BATCH_SHIPMENTS)) {
    const form = new FormData();
    form.set("shipmentId", String(entry?.shipmentId));
    form.set("attemptId", String(entry?.attemptId));
    const outcome = await recordLabelPrint({}, form);
    if (outcome.printed) result.printed += 1;
    else if (outcome.blocked) result.blocked += 1;
    else result.failed += 1;
    if (outcome.nextAttemptId) result.nextAttemptIds[String(entry?.shipmentId)] = outcome.nextAttemptId;
  }
  return result;
}

/**
 * PR-76/PR-87: the explicit "Terbitkan invoice" of a batch (a POST, never a page load).
 * Numbers are re-validated here; both tenant roles may issue, as on the invoice page.
 */
export async function issueBatchInvoices(numbers: number[]): Promise<{ issued: number }> {
  const principal = await requireTenantPrincipal();
  const valid = Array.isArray(numbers)
    ? [...new Set(numbers.filter((n) => Number.isSafeInteger(n) && n >= 10_000))].slice(0, MAX_BATCH_SHIPMENTS)
    : [];
  if (valid.length === 0) return { issued: 0 };
  const issued = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    issueMissingBatchInvoices(tx, context, valid));
  return { issued };
}
