import "server-only";

import { issueShipmentInvoice, type IssueShipmentInvoiceResult } from "@/db/shipment-invoice-repository";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

/** Carries a dry-run result out of the savepoint it rolls back. */
class InvoicePreview extends Error {
  constructor(readonly result: IssueShipmentInvoiceResult) {
    super("invoice preview");
  }
}

/**
 * R6-X (critique 2026-09-30T19-21-59Z #7): the invoice issuance would write, without writing it.
 * The very issuance statement runs inside a savepoint that is always rolled back, so the preview
 * is the same template, lines and refusal as "Terbitkan" and no row, number or audit survives.
 * An invoice already issued is returned as stored.
 */
export async function dryRunShipmentInvoice(
  tx: TenantTransaction,
  context: TenantContext,
  shipmentId: string,
): Promise<IssueShipmentInvoiceResult> {
  try {
    await tx.transaction(async (savepoint) => {
      throw new InvoicePreview(await issueShipmentInvoice(savepoint, context, shipmentId));
    });
  } catch (error) {
    if (error instanceof InvoicePreview) return error.result;
    throw error;
  }
  throw new Error("Invoice preview did not roll back.");
}
