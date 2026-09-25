import "server-only";

import { redirect } from "next/navigation";

import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

/** The pre-v3 page guard, unchanged: a tenant principal or the tenant login. */
export async function requireTenantPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  return principal;
}
