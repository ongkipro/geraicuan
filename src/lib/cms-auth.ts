import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, requestHostAllowsScope } from "@/lib/auth";
import {
  resolveCmsPrincipal,
  type CmsPrincipal,
} from "@/lib/cms-principal";
import { TENANT_APPROVAL_REQUIRED_HREF } from "@/lib/tenant-approval";

export { resolveCmsPrincipal, type CmsPrincipal } from "@/lib/cms-principal";

export class CmsAuthorizationDeniedError extends Error {
  constructor(public readonly reason: "anonymous" | "forbidden") {
    super("CMS authorization is required.");
  }
}

export type CmsScopeOptions = {
  /**
   * Store setup only (PR-60). Without it, a tenant awaiting approval is sent to
   * the dashboard that says why, and every shipment page, Server Function and
   * route handler stops here — before `withTenantContext`, which refuses it
   * again, and before row-level security, which refuses it a third time.
   */
  allowPendingApproval?: true;
};

export async function requireCmsScope(
  scope: CmsPrincipal["scope"],
  options: CmsScopeOptions = {},
) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) {
    throw new CmsAuthorizationDeniedError("anonymous");
  }
  // Host routing is an additional boundary: a session presented on the other
  // surface's host is refused even when the principal's scope would match.
  if (!requestHostAllowsScope(requestHeaders, scope)) {
    throw new CmsAuthorizationDeniedError("forbidden");
  }

  const principal = await resolveCmsPrincipal(session.user.id);

  if (!principal || principal.scope !== scope) {
    throw new CmsAuthorizationDeniedError("forbidden");
  }
  if (
    principal.scope === "tenant"
    && principal.tenantStatus !== "ACTIVE"
    && !options.allowPendingApproval
  ) {
    redirect(TENANT_APPROVAL_REQUIRED_HREF);
  }

  return principal;
}
