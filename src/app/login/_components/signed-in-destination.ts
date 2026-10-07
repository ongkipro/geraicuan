import "server-only";

import { resolvePlatformAccess } from "@/app/platform/platform-access";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { tenantLandingPath } from "@/lib/cms-shell-navigation";

/**
 * L8: where a login page sends someone already signed in to its own surface — the tenant role's
 * landing (`tenantLandingPath`, as after a sign-in) or `/platform` — or null to show the form.
 * Only a valid session of that surface redirects: none, an expired one, another surface's, or a
 * Super Admin still without TOTP keeps the form, so no guard can bounce a request back here in
 * a loop.
 */
export async function signedInDestination(surface: "platform" | "tenant"): Promise<string | null> {
  if (surface === "platform") {
    return (await resolvePlatformAccess()).status === "authorized" ? "/platform" : null;
  }
  try {
    const principal = await requireCmsScope("tenant", { allowPendingApproval: true });
    return principal.scope === "tenant" ? tenantLandingPath(principal.role, principal.tenantStatus) : null;
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) return null;
    throw error;
  }
}
