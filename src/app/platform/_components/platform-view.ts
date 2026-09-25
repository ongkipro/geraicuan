import "server-only";

import { notFound, redirect } from "next/navigation";

import { resolvePlatformAccess } from "@/app/platform/platform-access";
import { db } from "@/db/client";
import { recordPlatformMonitoringAccess, withPlatformContext } from "@/db/platform-context";
import {
  listAuditEvents,
  listTenantUsage,
  readFilterOptions,
  readPlatformClock,
  readPlatformCounts,
  readPlatformHealth,
  readTenantDetail,
  readTrend,
} from "@/db/platform-monitoring-repository";
import { readPlatformTenantFinanceSummary } from "@/db/platform-tenant-repository";
import { loadPlatformTenantShipmentPrefix } from "@/db/shipment-number-repository";
import { parsePlatformFilters, type PlatformRoute } from "@/lib/platform-monitoring-filters";

import { PLATFORM_PAGE_SIZE } from "./platform-format";

export type PlatformPageKind = "overview" | "tenant-list" | "tenant-detail" | "audit";
type SearchParams = Record<string, string | string[] | undefined>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTES: Record<PlatformPageKind, PlatformRoute> = {
  audit: "/platform/audit",
  overview: "/platform",
  "tenant-detail": "/platform/tenant/[tenantId]",
  "tenant-list": "/platform/tenant",
};

/** A region that failed reads as `null` so its siblings still render (spec 10 §6). */
async function settle<T>(wanted: boolean, read: () => Promise<T>): Promise<T | null> {
  if (!wanted) return null;
  try {
    return await read();
  } catch {
    return null;
  }
}

/** The Super Admin principal, or the Super Admin login with the matching notice. */
export async function requirePlatformPrincipal() {
  const access = await resolvePlatformAccess();
  if (access.status !== "authorized") {
    redirect(`/login/super-admin?notice=${access.status === "anonymous" ? "session-required" : "access-unavailable"}`);
  }
  return access.principal;
}

/**
 * One read of a platform monitoring page inside the Super Admin platform context: the URL
 * filters, the regions that page shows, and the monitoring-access audit event every view writes
 * (spec 18 `/platform/*`). Every reader shares the transaction's one connection, so they run in turn.
 */
export async function loadPlatformView(kind: PlatformPageKind, rawParams: SearchParams, tenantId?: string) {
  if (tenantId !== undefined && !UUID_PATTERN.test(tenantId)) notFound();
  const principal = await requirePlatformPrincipal();
  const route = ROUTES[kind];
  const is = (...kinds: PlatformPageKind[]) => kinds.includes(kind);

  const data = await withPlatformContext(db, principal.userId, async (tx) => {
    const now = await readPlatformClock(tx);
    const globalOptions = await readFilterOptions(tx, { kind: "global" });
    const rawTenant = tenantId ?? (Array.isArray(rawParams.tenant) ? rawParams.tenant[0] : rawParams.tenant);
    const knownTenant = rawTenant && globalOptions.tenants.some((tenant) => tenant.id === rawTenant) ? rawTenant : undefined;
    const options = knownTenant ? await readFilterOptions(tx, { kind: "tenant", tenantId: knownTenant }) : globalOptions;
    const parsed = parsePlatformFilters(rawParams, {
      forcedTenantId: tenantId,
      knownCouriers: options.couriers,
      knownOutletIds: options.outlets.map((outlet) => outlet.id),
      knownTenantIds: globalOptions.tenants.map((tenant) => tenant.id),
      now,
      route,
    });
    const filters = parsed.filters;
    const usageLimit = kind === "overview" ? 5 : PLATFORM_PAGE_SIZE;
    const auditLimit = kind === "audit" ? PLATFORM_PAGE_SIZE : kind === "overview" ? 5 : 10;
    return {
      audit: await settle(is("overview", "audit", "tenant-detail"), () => listAuditEvents(tx, filters, auditLimit)),
      counts: await settle(is("overview", "tenant-detail"), () => readPlatformCounts(tx, filters)),
      detail: await settle(is("tenant-detail"), () => readTenantDetail(tx, filters)),
      filters,
      finance: await settle(is("tenant-detail"), () => readPlatformTenantFinanceSummary(tx, filters)),
      health: await settle(is("overview"), () => readPlatformHealth(tx, filters, now)),
      issues: parsed.issues,
      now,
      tenants: globalOptions.tenants,
      trend: await settle(is("overview"), () => readTrend(tx, filters)),
      usage: await settle(is("overview", "tenant-list"), () => listTenantUsage(tx, filters, usageLimit)),
    };
  });

  if (kind === "tenant-detail" && !data.detail) notFound();
  const scope = data.filters.scope;
  await recordPlatformMonitoringAccess(db, principal.userId, {
    route,
    scope: data.detail ? "tenant" : scope.kind,
    tenantId: data.detail ? data.detail.tenant.id : scope.kind === "tenant" ? scope.tenantId : undefined,
  });
  const prefix = data.detail
    ? await loadPlatformTenantShipmentPrefix(db, principal.userId, data.detail.tenant.id).catch(() => null)
    : null;
  return { ...data, prefix };
}

export type PlatformView = Awaited<ReturnType<typeof loadPlatformView>>;
