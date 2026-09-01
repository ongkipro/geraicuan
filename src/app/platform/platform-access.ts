import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { resolveCmsPrincipal } from "@/lib/cms-auth";

export type PlatformAccess =
  | { status: "authorized"; principal: { scope: "platform"; userId: string } }
  | { status: "anonymous" }
  | { status: "forbidden"; userId: string };

export async function resolvePlatformAccess(): Promise<PlatformAccess> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { status: "anonymous" };

  const principal = await resolveCmsPrincipal(session.user.id);
  if (principal?.scope === "platform") {
    return { status: "authorized", principal };
  }

  return { status: "forbidden", userId: session.user.id };
}
