import "server-only";

import { eq } from "drizzle-orm";

import { tenants } from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";

/**
 * T-293: a demo gerai (`tenants.is_demo`, set by the local seed) never makes a mutating or
 * account-wide Mengantar call: order, cancel, pay-unpaid, reconciliation, status pull.
 */
export class MengantarDemoTenantError extends Error {
  constructor() {
    super("Demo tenants make no Mengantar order calls.");
  }
}

export const DEMO_TENANT_MESSAGE =
  "Ini gerai demo: tidak ada yang dikirim ke Mengantar dan resi asli tidak diterbitkan. Gunakan gerai uji live untuk kiriman sungguhan.";

export const DEMO_TENANT_STATUS_PULL_MESSAGE =
  "Ini gerai demo: status tidak diambil dari Mengantar. Status kiriman demo tetap seperti data contoh.";

/**
 * Refuses inside the caller's tenant transaction, before any provider request, batch, claim or
 * pull slot; fails closed. An order or pay-unpaid attempt has already counted against its rate
 * limit (committed earlier, local only).
 */
export async function assertNotDemoTenant(tx: TenantTransaction, context: TenantContext) {
  const [tenant] = await tx.select({ isDemo: tenants.isDemo }).from(tenants).where(eq(tenants.id, context.tenantId));
  if (tenant?.isDemo !== false) throw new MengantarDemoTenantError();
}
