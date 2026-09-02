import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import {
  resolveCmsPrincipal,
  type CmsPrincipal,
} from "@/lib/cms-principal";

export { resolveCmsPrincipal, type CmsPrincipal } from "@/lib/cms-principal";

export class CmsAuthorizationDeniedError extends Error {
  constructor(public readonly reason: "anonymous" | "forbidden") {
    super("CMS authorization is required.");
  }
}

export async function requireCmsScope(scope: CmsPrincipal["scope"]) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new CmsAuthorizationDeniedError("anonymous");
  }

  const principal = await resolveCmsPrincipal(session.user.id);

  if (!principal || principal.scope !== scope) {
    throw new CmsAuthorizationDeniedError("forbidden");
  }

  return principal;
}
