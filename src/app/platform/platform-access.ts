import "server-only";

import { headers } from "next/headers";

import { auth, requestHostAllowsScope } from "@/lib/auth";
import { resolveCmsPrincipal } from "@/lib/cms-auth";

export type PlatformAccess =
  | { status: "authorized"; principal: { scope: "platform"; userId: string } }
  | { status: "anonymous" }
  | { status: "forbidden"; userId: string };

export async function resolvePlatformAccess(): Promise<PlatformAccess> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return { status: "anonymous" };

  const principal = await resolveCmsPrincipal(session.user.id);
  if (principal?.scope === "platform" && requestHostAllowsScope(requestHeaders, "platform")) {
    return { status: "authorized", principal };
  }

  return { status: "forbidden", userId: session.user.id };
}
