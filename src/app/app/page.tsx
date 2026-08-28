import { redirect } from "next/navigation";

import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

export default async function TenantCmsBoundary() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }

  if (principal.scope !== "tenant") {
    redirect("/login/tenant");
  }

  return <main><h1>CMS Tenant</h1><p>Tenant aktif: {principal.tenantId}</p></main>;
}
