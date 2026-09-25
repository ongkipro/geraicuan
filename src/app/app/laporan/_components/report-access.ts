import "server-only";

import { redirect } from "next/navigation";

import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

/**
 * Spec 17 §UX-v3.3: both report pages are Tenant Admin records (PR-55). Same guard as before
 * the rebuild (d0db307): no session → tenant login; an Operator → the dashboard. The
 * repositories refuse any other role as well, so this is not the only control.
 */
export async function requireReportAdmin() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  if (principal.role !== "TENANT_ADMIN") redirect("/app");
  return principal;
}
