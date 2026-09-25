"use server";

import { redirect } from "next/navigation";

import { db } from "@/db/client";
import {
  issueShipmentInvoice as issueInvoice,
  type IssueShipmentInvoiceResult,
} from "@/db/shipment-invoice-repository";
import { resolveShipmentRouteKey } from "@/db/shipment-number-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseShipmentRouteKey } from "@/lib/shipment-number";

async function requireTenantPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  return principal;
}

/**
 * PR-76: issue (or return) the one invoice of a shipment, by its route number
 * (`10013`, `GC-10013` or a legacy UUID). Tenant Admin and Operator alike; the
 * tenant comes from the session, so another tenant's number is NOT_FOUND.
 */
export async function issueShipmentInvoice(
  shipmentNumber: string,
): Promise<IssueShipmentInvoiceResult> {
  const principal = await requireTenantPrincipal();
  const key = typeof shipmentNumber === "string" ? parseShipmentRouteKey(shipmentNumber) : null;
  if (!key) return { ok: false, code: "NOT_FOUND" };

  return withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    const resolved = await resolveShipmentRouteKey(tx, context, key);
    if (!resolved) return { ok: false, code: "NOT_FOUND" } as const;
    return issueInvoice(tx, context, resolved.shipmentId);
  });
}
