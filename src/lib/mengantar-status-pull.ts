import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db/client";
import {
  claimProviderSettlementPull,
  providerSettlementAccountKey,
  recordProviderSettlementPull,
} from "@/db/provider-settlement-repository";
import { providerSettlementPulls } from "@/db/schema";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import {
  lockMengantarAccountAuthority,
  MengantarConfigurationError,
  resolveMengantarAccountCredentials,
  sameMengantarAccountAuthority,
} from "@/lib/mengantar-credentials";
import { fetchMengantarSettlement } from "@/lib/mengantar-settlement";

type Principal = { userId: string; tenantId: string };

/**
 * The read-only Mengantar status pull (T-204), shared by the "Perbarui status" action and the
 * automatic follow-up (T-284): one claimed slot per tenant member per minute, committed before
 * provider I/O; the outlet's own account; provider I/O outside any transaction; the authority
 * re-checked before writing. Throws the repository's and the provider client's typed errors.
 */
export async function runMengantarStatusPull(
  principal: Principal,
  outletId: string,
  period: { start: Date; end: Date },
) {
  await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    claimProviderSettlementPull(tx, context, outletId));
  const prepared = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    await lockMengantarAccountAuthority(tx, context, outletId);
    return resolveMengantarAccountCredentials(tx, context, outletId);
  });
  const snapshot = await fetchMengantarSettlement(prepared.credentials, period);
  return withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    await lockMengantarAccountAuthority(tx, context, outletId);
    const current = await resolveMengantarAccountCredentials(tx, context, outletId);
    if (!sameMengantarAccountAuthority(prepared.authority, current.authority)) {
      throw new MengantarConfigurationError();
    }
    return recordProviderSettlementPull(tx, context, {
      credentialSource: current.source,
      outletId,
      period,
      providerAccountKey: providerSettlementAccountKey(context.tenantId, outletId, current.source),
      snapshot,
    });
  });
}

/** T-284: an outlet whose last pull is older than this is followed up on the next owner visit. */
export const AUTO_STATUS_PULL_AFTER_MS = 15 * 60_000;
/** The window the automatic pull reads: open parcels of the last two weeks. */
export const AUTO_STATUS_PULL_DAYS = 14;

/**
 * The ready outlet whose last pull is the oldest (never pulled first), when that pull is older
 * than AUTO_STATUS_PULL_AFTER_MS; null when every outlet is fresh. Pure over its inputs.
 */
export function stalestOutlet(
  outletIds: readonly string[],
  lastPullAt: ReadonlyMap<string, Date>,
  now: Date,
): string | null {
  let pick: { id: string; at: number } | null = null;
  for (const id of outletIds) {
    const at = lastPullAt.get(id)?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (now.getTime() - at < AUTO_STATUS_PULL_AFTER_MS) continue;
    if (!pick || at < pick.at) pick = { at, id };
  }
  return pick?.id ?? null;
}

/**
 * T-284 (owner 2026-10-06: "pastikan untuk resi dan sistem ini auto dari mengantar"): run once
 * after a Tenant Admin's page response (`after()`), so statuses follow Mengantar without a click.
 * One outlet per visit (the claim allows one pull per member per minute), read-only, and every
 * failure is swallowed into a name-only log line — a visit never fails because of it. Nothing is
 * returned to the page; the next render shows the result.
 */
export async function autoPullMengantarStatus(principal: Principal & { role: string }, now = new Date()) {
  if (principal.role !== "TENANT_ADMIN") return null;
  try {
    const outletId = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
      const outlets = await listReadyShipmentOutlets(tx, context);
      if (outlets.length === 0) return null;
      const ids = outlets.map((outlet) => outlet.id);
      const rows = await tx
        .select({ createdAt: providerSettlementPulls.createdAt, outletId: providerSettlementPulls.outletId })
        .from(providerSettlementPulls)
        .where(and(eq(providerSettlementPulls.tenantId, context.tenantId), inArray(providerSettlementPulls.outletId, ids)))
        .orderBy(desc(providerSettlementPulls.createdAt))
        .limit(200);
      const last = new Map<string, Date>();
      for (const row of rows) if (!last.has(row.outletId)) last.set(row.outletId, row.createdAt);
      return stalestOutlet(ids, last, now);
    });
    if (!outletId) return null;
    const period = { end: now, start: new Date(now.getTime() - AUTO_STATUS_PULL_DAYS * 86_400_000) };
    return await runMengantarStatusPull(principal, outletId, period);
  } catch (error) {
    console.warn(JSON.stringify({ event: "mengantar.status.autopull", outcome: "skipped", reason: error instanceof Error ? error.constructor.name : "unknown" }));
    return null;
  }
}

/**
 * Schedules `autoPullMengantarStatus` after the current response (Next.js `after`). An active
 * gerai's Tenant Admin only; outside a request scope (render tests, prerender) nothing is scheduled.
 */
export function scheduleAutoStatusPull(principal: Principal & { role: string; tenantStatus?: string }) {
  if (principal.role !== "TENANT_ADMIN" || (principal.tenantStatus && principal.tenantStatus !== "ACTIVE")) return false;
  try {
    after(() => autoPullMengantarStatus(principal));
    return true;
  } catch {
    return false;
  }
}
