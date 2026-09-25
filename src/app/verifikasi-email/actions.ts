"use server";

import { verifyJWT } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db/client";
import { accounts, users } from "@/db/schema";
import { auth, requestHostAllowsScope } from "@/lib/auth";
import { VERIFICATION_TOKEN_PATTERN } from "@/lib/public-auth-routes";
import { consumePublicAuthRateLimit } from "@/lib/public-auth-rate-limit";
import {
  clientIdentifier,
  normalizeEmailInput,
  PASSWORD_MAX_LENGTH,
  requestSetPasswordLink,
  withMinimumDuration,
} from "@/lib/public-auth";

export type VerificationResendState =
  | { status: "idle" }
  | { error: string; status: "invalid" }
  | { status: "limited" }
  | { status: "sent" };

const RESEND_MINIMUM_MS = 1_500;

/**
 * PR-59 / D-10: the "resend verification" request. An account that already
 * exists never receives a plain verification link here (H1): whoever registered
 * the address chose its password, and verifying it would let them sign in with
 * someone else's email. An unverified account receives a set-password link
 * instead; choosing a password through it verifies the email. The answer is the
 * same for a verified, unknown or unverified address, after the same minimum
 * duration.
 */
export async function resendVerificationEmail(
  _previous: VerificationResendState,
  formData: FormData,
): Promise<VerificationResendState> {
  const requestHeaders = await headers();
  const email = normalizeEmailInput(formData.get("email"));
  if (!email) {
    return { error: "Isi alamat email yang benar, misalnya nama@gerai.com.", status: "invalid" };
  }

  return withMinimumDuration<VerificationResendState>(RESEND_MINIMUM_MS, async () => {
    if (!requestHostAllowsScope(requestHeaders, "tenant")) return { status: "sent" };
    // Only the client limit is visible (M2).
    const clientAllowed = await consumePublicAuthRateLimit("verify-client", clientIdentifier(requestHeaders));
    const emailAllowed = await consumePublicAuthRateLimit("verify-email", email);
    if (!clientAllowed) return { status: "limited" };
    if (!emailAllowed) return { status: "sent" };
    try {
      const [account] = await db
        .select({ emailVerified: users.emailVerified, status: users.status })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (account && account.status === "ACTIVE" && !account.emailVerified) {
        await requestSetPasswordLink(email, requestHeaders);
      }
    } catch {
      console.error("[verifikasi-email] set-password link was not delivered");
    }
    return { status: "sent" };
  });
}

export type EmailConfirmationState =
  | { status: "idle" }
  | { error: string; status: "invalid" }
  | { status: "mismatch" }
  | { status: "expired" }
  | { status: "limited" }
  | { status: "done" };

const CONFIRM_MINIMUM_MS = 1_200;

/**
 * Verifies the email of the account that holds `email` only when `password` is
 * that account's current password, and reports whether it matched. An unknown
 * address, an account without a credential password and a suspended account
 * spend the same hashing work and answer `false`.
 */
async function verifyEmailWithPassword(email: string, password: string) {
  const context = await auth.$context;
  const [account] = await db
    .select({ emailVerified: users.emailVerified, hash: accounts.password, status: users.status, userId: users.id })
    .from(users)
    .innerJoin(accounts, and(
      eq(accounts.userId, users.id),
      eq(accounts.accountId, users.id),
      eq(accounts.providerId, "credential"),
      eq(accounts.issuer, "local:credential"),
    ))
    .where(eq(users.email, email))
    .limit(1);
  if (!account?.hash || account.status !== "ACTIVE") {
    await context.password.hash(password);
    return false;
  }
  if (!(await context.password.verify({ hash: account.hash, password }))) return false;
  if (!account.emailVerified) {
    // Only while the password is still the one just checked: a reset that
    // replaced it in between verifies the email on its own path.
    await db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(and(
        eq(users.id, account.userId),
        eq(users.emailVerified, false),
        sql`EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = ${account.userId} AND a.provider_id = 'credential' AND a.password = ${account.hash})`,
      ));
  }
  return true;
}

/**
 * T-198 (PR-59, D-10): the sign-up verification link. Opening it verifies
 * nothing; the email is verified only when the password typed here is the one
 * the account was registered with. An attacker who registered someone else's
 * address knows the password but never receives the link; the inbox owner
 * receives the link but not the attacker's password, and takes the
 * set-password path instead ("Lupa kata sandi", H1), which replaces it.
 *
 * The token's signature and expiry are checked before the password is, so the
 * page is no password oracle for an address whose inbox the caller lacks.
 */
export async function confirmEmailVerification(
  _previous: EmailConfirmationState,
  formData: FormData,
): Promise<EmailConfirmationState> {
  const requestHeaders = await headers();
  const token = formData.get("token");
  const password = formData.get("password");
  if (typeof token !== "string" || !VERIFICATION_TOKEN_PATTERN.test(token) || !requestHostAllowsScope(requestHeaders, "tenant")) {
    return { status: "expired" };
  }
  if (typeof password !== "string" || password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
    return { error: "Isi kata sandi yang Anda buat saat mendaftarkan gerai.", status: "invalid" };
  }

  return withMinimumDuration<EmailConfirmationState>(CONFIRM_MINIMUM_MS, async () => {
    if (!(await consumePublicAuthRateLimit("confirm-client", clientIdentifier(requestHeaders)))) {
      return { status: "limited" };
    }
    const context = await auth.$context;
    const payload = await verifyJWT<{ email?: unknown; updateTo?: unknown }>(token, context.secret);
    // A change-email token (`updateTo`) is not a sign-up verification.
    const email = payload && payload.updateTo === undefined ? normalizeEmailInput(typeof payload.email === "string" ? payload.email : null) : null;
    if (!email) return { status: "expired" };
    if (!(await consumePublicAuthRateLimit("confirm-email", email))) return { status: "limited" };
    return (await verifyEmailWithPassword(email, password)) ? { status: "done" } : { status: "mismatch" };
  });
}
