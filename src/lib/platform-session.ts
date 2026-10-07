import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { sessions } from "@/db/schema";

/**
 * T-286 (M2): a Super Admin session is valid for 12 hours from sign-in, however active it is.
 * Better Auth's `session.expiresIn` is one value for every user, and its refresh (`updateAge`)
 * would extend a shorter `expiresAt` back to the global lifetime, so the platform limit is
 * counted here from `createdAt`, which a refresh never moves.
 */
export const PLATFORM_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

type PlatformSession = {
  session: { createdAt: Date; id: string };
  user: { twoFactorEnabled?: boolean | null };
};

export function platformSessionExpired(session: { session: { createdAt: Date } }, now = Date.now()) {
  return now - new Date(session.session.createdAt).getTime() >= PLATFORM_SESSION_MAX_AGE_SECONDS * 1_000;
}

/**
 * What a platform-scope session may do: `ok`, `expired` (the row is deleted, so the cookie is
 * dead everywhere, Better Auth endpoints included), or `two-factor-required` — a Super Admin
 * without TOTP enrolled may only open the enrollment page (`/verifikasi-dua-langkah`).
 */
export async function checkPlatformSession(session: PlatformSession) {
  if (platformSessionExpired(session)) {
    await db.delete(sessions).where(eq(sessions.id, session.session.id));
    return "expired" as const;
  }
  return session.user.twoFactorEnabled === true ? ("ok" as const) : ("two-factor-required" as const);
}
