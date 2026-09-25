import "server-only";

import { redirect } from "next/navigation";

import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

/** Every contact page is tenant-only (spec 17 UX-v3.3: Operator and Tenant Admin). */
export async function requireContactPagePrincipal() {
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
