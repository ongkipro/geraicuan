"use server";

import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { tenantLandingPath } from "@/lib/cms-shell-navigation";

/**
 * T-263: the page a tenant sign-in opens, read from the session the sign-in just set — the
 * Operator's queue or the Tenant Admin's Dasbor (`tenantLandingPath`). It only names a path the
 * principal may open; every page still runs its own guard. Without a tenant session it answers
 * `/app`, whose guard sends the browser back to the login.
 */
export async function tenantLandingAction(): Promise<"/app" | "/app/label"> {
  try {
    const principal = await requireCmsScope("tenant", { allowPendingApproval: true });
    return principal.scope === "tenant" ? tenantLandingPath(principal.role, principal.tenantStatus) : "/app";
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) return "/app";
    throw error;
  }
}
