import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { SafeOutletReadiness } from "@/app/app/pengaturan/outlet-settings-types";
import { db } from "@/db/client";
import { listOutletReadiness, type OutletReadiness } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope, type CmsScopeOptions } from "@/lib/cms-auth";
import {
  parseUiAuditScenarioForRoute,
  UI_AUDIT_HEADER,
  type UiAuditScenario,
} from "@/lib/ui-audit-scenario";

import { orderOutlets, pickActiveOutlet } from "./settings-logic";

/** PR-60: settings are store setup, which a gerai still awaiting approval may do. */
export const STORE_SETUP = { allowPendingApproval: true } as const;

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

/** "25 Sep 2026, 10.13 WIB" (spec 10 §7). */
export function formatWib(value: Date) {
  return `${dateTimeFormatter.format(value)} WIB`;
}

/**
 * UX-v3.3: Pengaturan and Anggota are Tenant Admin only, checked on the server. Anyone
 * without a tenant session goes to the tenant login; an Operator goes to the dashboard.
 */
export async function requireTenantAdmin(options: CmsScopeOptions = STORE_SETUP) {
  let principal;
  try {
    principal = await requireCmsScope("tenant", options);
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  if (principal.role !== "TENANT_ADMIN") redirect("/app");
  return principal;
}

/** Development-only browser-audit scenario for this route (never read in production). */
export async function readAuditScenario(
  route: Parameters<typeof parseUiAuditScenarioForRoute>[1],
): Promise<UiAuditScenario | null> {
  if (process.env.NODE_ENV !== "development") return null;
  return parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), route);
}

export function toSafeOutlet(outlet: OutletReadiness): SafeOutletReadiness {
  return {
    id: outlet.id,
    name: outlet.name,
    defaultPickupAddressId: outlet.defaultPickupAddressId,
    defaultPickupAddressLabel: outlet.defaultPickupAddressLabel,
    defaultOriginAreaId: outlet.defaultOriginAreaId,
    defaultOriginAreaLabel: outlet.defaultOriginAreaLabel,
    connectionIssue: outlet.connectionIssue,
    connectionSource: outlet.connectionSource,
    connectionStatus: outlet.connectionStatus,
    connectionUpdatedAtLabel: outlet.connectionUpdatedAt ? formatWib(outlet.connectionUpdatedAt) : null,
    readinessStatus: outlet.readinessStatus,
    updatedAtLabel: formatWib(outlet.updatedAt),
    privateConnectionRequired: outlet.privateConnectionRequired,
  };
}

/** The tenant's outlets (needing attention first) and the one `?outlet=` names, else the first. */
export async function loadSettingsOutlets(
  principal: Awaited<ReturnType<typeof requireTenantAdmin>>,
  requestedOutlet: string | string[] | undefined,
) {
  const outlets = orderOutlets(await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => listOutletReadiness(tx, context),
    STORE_SETUP,
  ));
  return { active: pickActiveOutlet(outlets, requestedOutlet), outlets };
}
