"use server";

import { headers } from "next/headers";

import { requestHostAllowsScope } from "@/lib/auth";
import { consumePublicAuthRateLimit } from "@/lib/public-auth-rate-limit";
import { clientIdentifier, normalizeEmailInput, requestSetPasswordLink, withMinimumDuration } from "@/lib/public-auth";

export type PasswordResetRequestState =
  | { status: "idle" }
  | { email?: string; error: string; status: "invalid" }
  | { email: string; status: "limited" }
  | { status: "sent" };

/**
 * Better Auth's reset request does database work and sends mail only for a real
 * account, so this path answers after a fixed minimum instead.
 */
const RESET_REQUEST_MINIMUM_MS = 1_500;

/**
 * PR-62: "Lupa kata sandi" on the tenant host. The same answer for every
 * well-formed email; only a tenant account receives a link
 * (`sendResetPassword` in `src/lib/auth.ts`).
 */
export async function requestPasswordReset(
  _previous: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  const requestHeaders = await headers();
  const email = normalizeEmailInput(formData.get("email"));
  if (!email) {
    const raw = formData.get("email");
    return {
      email: typeof raw === "string" ? raw.slice(0, 254) : undefined,
      error: "Isi alamat email yang benar, misalnya nama@toko.com.",
      status: "invalid",
    };
  }

  return withMinimumDuration<PasswordResetRequestState>(RESET_REQUEST_MINIMUM_MS, async () => {
    if (!requestHostAllowsScope(requestHeaders, "tenant")) return { status: "sent" };
    // Only the client limit is visible (M2): past the per-email limit the answer
    // is unchanged and nothing is sent, so nobody can lock an owner out of recovery.
    const clientAllowed = await consumePublicAuthRateLimit("reset-client", clientIdentifier(requestHeaders));
    const emailAllowed = await consumePublicAuthRateLimit("reset-email", email);
    if (!clientAllowed) return { email, status: "limited" };
    if (!emailAllowed) return { status: "sent" };

    try {
      await requestSetPasswordLink(email, requestHeaders);
    } catch {
      console.error("[lupa-password] reset link was not delivered");
    }
    return { status: "sent" };
  });
}
