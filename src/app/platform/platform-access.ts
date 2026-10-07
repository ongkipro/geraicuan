import "server-only";

import { headers } from "next/headers";

import { auth, requestHostAllowsScope } from "@/lib/auth";
import { resolveCmsPrincipal } from "@/lib/cms-auth";
import { checkPlatformSession } from "@/lib/platform-session";

export type PlatformAccess =
  | { status: "authorized"; principal: { scope: "platform"; userId: string } }
  | { status: "anonymous" }
  | { status: "forbidden"; userId: string }
  // T-286: a Super Admin who has not enrolled TOTP yet; only `/verifikasi-dua-langkah` opens.
  | { status: "two-factor-required"; userId: string };

export async function resolvePlatformAccess(): Promise<PlatformAccess> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return { status: "anonymous" };

  const principal = await resolveCmsPrincipal(session.user.id);
  if (principal?.scope === "platform" && requestHostAllowsScope(requestHeaders, "platform")) {
    const state = await checkPlatformSession(session);
    if (state === "expired") return { status: "anonymous" };
    if (state === "two-factor-required") return { status: "two-factor-required", userId: session.user.id };
    return { status: "authorized", principal };
  }

  return { status: "forbidden", userId: session.user.id };
}

/** Where a page sends a request that is not `authorized`. */
export function platformAccessRedirect(access: Exclude<PlatformAccess, { status: "authorized" }>) {
  if (access.status === "two-factor-required") return "/verifikasi-dua-langkah";
  return `/login/super-admin?notice=${access.status === "anonymous" ? "session-required" : "access-unavailable"}`;
}
