"use server";

import { recordLabelPrint } from "@/app/app/label/[shipmentId]/actions";
import { MAX_BATCH_SHIPMENTS } from "@/app/app/label/cetak/batch-query";

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
