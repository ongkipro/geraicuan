"use server";

import { recordLabelPrint } from "@/app/app/label/[shipmentId]/actions";
import { issueMissingBatchInvoices } from "@/app/app/label/cetak/batch-data";
import { MAX_BATCH_SHIPMENTS } from "@/app/app/label/cetak/batch-query";
import { parseLabelQuery } from "@/app/app/label/label-query";
import { requireTenantPrincipal } from "@/app/app/pengiriman/_list/tenant-page";
import { db } from "@/db/client";
import { loadLabelIndexPage } from "@/db/label-print-repository";
import { withTenantContext } from "@/db/tenant-context";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import { shipmentNumberFromReference } from "@/lib/shipment-number";

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

export type UnprintedSelection = {
  /** Shipment numbers to select: the newest first, as the list orders them, at most MAX_BATCH_SHIPMENTS. */
  numbers: number[];
  /** LBL-UNPRINTED for the same filter: every unprinted resi, not only the ones returned. */
  total: number;
};

/**
 * T-266 "Pilih semua belum dicetak": every unprinted resi the Cetak resi list would show for the
 * caller's own filter (period, resi suffix), across its pages. The tenant is the session's, never
 * an input; the filter is re-parsed here from the page's search parameters, and the print state
 * is always "belum" whatever the URL says. The same loader as the list, so the two cannot differ.
 */
export async function selectUnprintedLabels(params: Record<string, string>): Promise<UnprintedSelection> {
  const principal = await requireTenantPrincipal();
  const search: Record<string, string> = {};
  if (params && typeof params === "object") {
    for (const key of ["q", "rentang", "khusus", "dari", "sampai", "tz"]) {
      const value = (params as Record<string, unknown>)[key];
      if (typeof value === "string") search[key] = value.slice(0, 64);
    }
  }
  const query = parseLabelQuery(search);
  if (query.awbSuffixError) return { numbers: [], total: 0 };
  const range = parseAnalyticsRange(search, new Date());
  const page = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    loadLabelIndexPage(tx, context, { awbSuffix: query.awbSuffix || undefined, printState: "belum", range, status: "issued" }));
  return {
    numbers: page.rows.slice(0, MAX_BATCH_SHIPMENTS).map((row) => Number(shipmentNumberFromReference(row.publicReference))),
    total: page.summary["LBL-UNPRINTED"],
  };
}
