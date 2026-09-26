import "server-only";

import { includesInvoices, type BatchPrintQuery } from "@/app/app/label/cetak/batch-query";
import { LabelUnavailableError, loadPrintableLabel, type PrintableLabel } from "@/db/label-print-repository";
import { issueShipmentInvoice, loadShipmentInvoice, type ShipmentInvoice } from "@/db/shipment-invoice-repository";
import { resolveShipmentRouteKey } from "@/db/shipment-number-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

export type BatchPrintItem =
  | { kind: "ready"; tenantNumber: number; label: PrintableLabel; invoice: ShipmentInvoice | null }
  | { kind: "skipped"; tenantNumber: number; reason: "NOT_FOUND" | "NOT_ISSUED" };

/**
 * The shipments of one batch print, in the requested order. A number that is unknown
 * here (or another tenant's) or has no resi yet is skipped and named, never printed.
 * Read-only (review 2026-09-26): opening the view never issues an invoice — a GET that
 * wrote permanent rows could be triggered by a link from another site. Missing invoices
 * are issued only through `issueMissingBatchInvoices`, behind an explicit button.
 */
export async function loadBatchPrint(
  tx: TenantTransaction,
  context: TenantContext,
  query: Pick<BatchPrintQuery, "numbers" | "content">,
): Promise<BatchPrintItem[]> {
  const items: BatchPrintItem[] = [];
  for (const tenantNumber of query.numbers) {
    const resolved = await resolveShipmentRouteKey(tx, context, { canonical: true, kind: "number", tenantNumber });
    if (!resolved) {
      items.push({ kind: "skipped", reason: "NOT_FOUND", tenantNumber });
      continue;
    }
    let label: PrintableLabel;
    try {
      label = await loadPrintableLabel(tx, context, resolved.shipmentId);
    } catch (error) {
      if (!(error instanceof LabelUnavailableError)) throw error;
      items.push({ kind: "skipped", reason: error.reason === "NOT_FOUND" ? "NOT_FOUND" : "NOT_ISSUED", tenantNumber });
      continue;
    }
    const invoice = includesInvoices(query.content)
      ? await loadShipmentInvoice(tx, context, resolved.shipmentId)
      : null;
    items.push({ invoice, kind: "ready", label, tenantNumber });
  }
  return items;
}

/**
 * PR-76 for a batch: issues the one invoice of each listed shipment that has a resi and
 * none yet (the repository's idempotent insert), so a repeat or a double click adds
 * nothing. Returns how many shipments now carry an invoice.
 */
export async function issueMissingBatchInvoices(
  tx: TenantTransaction,
  context: TenantContext,
  numbers: readonly number[],
): Promise<number> {
  let issued = 0;
  for (const tenantNumber of numbers) {
    const resolved = await resolveShipmentRouteKey(tx, context, { canonical: true, kind: "number", tenantNumber });
    if (!resolved) continue;
    const result = await issueShipmentInvoice(tx, context, resolved.shipmentId);
    if (result.ok) issued += 1;
  }
  return issued;
}
