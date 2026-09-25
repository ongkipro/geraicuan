"use server";

import { headers } from "next/headers";

import { auth, requestHostAllowsScope } from "@/lib/auth";
import { consumePublicAuthRateLimits } from "@/lib/public-auth-rate-limit";
import { clientIdentifier, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/public-auth";

export type PasswordResetState =
  | { status: "idle" }
  | { errors: { password?: string; passwordConfirmation?: string }; status: "invalid" }
  | { status: "expired" }
  | { status: "limited" }
  | { status: "done" };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * PR-62: sets a new password from a reset link. The token is single-use
 * (Better Auth consumes it) and every session of the account is revoked.
 */
export async function resetPassword(
  _previous: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const requestHeaders = await headers();
  const token = formData.get("token");
  const password = formData.get("password");
  const confirmation = formData.get("passwordConfirmation");

  if (typeof token !== "string" || !TOKEN_PATTERN.test(token) || !requestHostAllowsScope(requestHeaders, "tenant")) {
    return { status: "expired" };
  }
  const errors: { password?: string; passwordConfirmation?: string } = {};
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Kata sandi maksimal ${PASSWORD_MAX_LENGTH} karakter.`;
  }
  if (typeof confirmation !== "string" || !confirmation) {
    errors.passwordConfirmation = "Ulangi kata sandi baru.";
  } else if (confirmation !== password) {
    errors.passwordConfirmation = "Konfirmasi kata sandi belum sama.";
  }
  if (Object.keys(errors).length > 0 || typeof password !== "string") {
    return { errors, status: "invalid" };
  }

  if (!(await consumePublicAuthRateLimits([["reset-submit-client", clientIdentifier(requestHeaders)]]))) {
    return { status: "limited" };
  }
  try {
    await auth.api.resetPassword({ body: { newPassword: password, token }, headers: requestHeaders });
  } catch {
    return { status: "expired" };
  }
  return { status: "done" };
}
