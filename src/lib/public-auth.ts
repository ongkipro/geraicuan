import "server-only";

import { getIP } from "better-auth/api";

import { auth } from "@/lib/auth";
import { RESET_PASSWORD_PAGE } from "@/lib/public-auth-routes";

/**
 * Shared by the anonymous sign-up, verification and recovery paths (PR-59).
 */

let warnedSharedBucket = false;

/**
 * The client IP Better Auth itself trusts (trusted proxies only), or one shared
 * bucket. The shared bucket is kept, never skipped: without a trusted address
 * the limit still holds, only for every visitor at once. In production the
 * first such request logs one warning, because it almost always means
 * `BETTER_AUTH_TRUSTED_PROXY_CIDRS` does not match the reverse proxy (DEP-1).
 */
export function clientIdentifier(requestHeaders: Headers) {
  const ip = getIP(requestHeaders, auth.options);
  if (ip) return ip;
  if (process.env.NODE_ENV === "production" && !warnedSharedBucket) {
    warnedSharedBucket = true;
    console.warn(
      "[public-auth] No trusted client IP resolved: anonymous sign-up, verification and recovery attempts now share one rate-limit bucket. BETTER_AUTH_TRUSTED_PROXY_CIDRS must contain the address the reverse proxy connects from.",
    );
  }
  return "no-trusted-ip";
}

/**
 * Asks Better Auth for a password link to `email` (sent only to a tenant
 * account, `sendResetPassword` in `src/lib/auth.ts`). Also the only link an
 * existing unverified account receives (H1): choosing a password through it
 * verifies the email. The caller checks the host first.
 */
export async function requestSetPasswordLink(email: string, requestHeaders: Headers) {
  await auth.api.requestPasswordReset({
    body: { email, redirectTo: RESET_PASSWORD_PAGE },
    headers: requestHeaders,
  });
}

/**
 * Runs `work` and answers no sooner than `minimumMs`, so whether an email exists
 * (a database write and a message) or not (nothing to do) cannot be read from
 * the response time. The floor is well above either path's normal duration.
 */
export async function withMinimumDuration<T>(minimumMs: number, work: () => Promise<T>) {
  const started = Date.now();
  try {
    return await work();
  } finally {
    const remaining = minimumMs - (Date.now() - started);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-cased and trimmed, the form Better Auth stores; `null` when unusable. */
export function normalizeEmailInput(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length >= 3 && email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
