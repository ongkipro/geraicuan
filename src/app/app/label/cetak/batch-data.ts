import "server-only";

import { includesInvoices, type BatchPrintQuery } from "@/app/app/label/cetak/batch-query";
import { LabelUnavailableError, loadPrintableLabel, type PrintableLabel } from "@/db/label-print-repository";
import { issueShipmentInvoice, type ShipmentInvoice } from "@/db/shipment-invoice-repository";
import { resolveShipmentRouteKey } from "@/db/shipment-number-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

export type BatchPrintItem =
  | { kind: "ready"; tenantNumber: number; label: PrintableLabel; invoice: ShipmentInvoice | null }
  | { kind: "skipped"; tenantNumber: number; reason: "NOT_FOUND" | "NOT_ISSUED" };

/**
 * The shipments of one batch print, in the requested order. A number that is unknown
 * here (or another tenant's) or has no resi yet is skipped and named, never printed.
 * For invoice content the one invoice of each shipment is issued if absent (PR-76, the
 * repository's idempotent insert), so a repeated or reloaded batch issues nothing new.
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
    const issued = includesInvoices(query.content)
      ? await issueShipmentInvoice(tx, context, resolved.shipmentId)
      : null;
    items.push({ invoice: issued?.ok ? issued.invoice : null, kind: "ready", label, tenantNumber });
  }
  return items;
}
