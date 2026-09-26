/**
 * Where the verification and recovery links land (PR-59, PR-62). `/login/tenant`
 * serves both modes: on the tenant host it redirects to `/login` with the query
 * kept; in single-origin development it is the page itself.
 */
export const VERIFIED_EMAIL_CALLBACK = "/login/tenant?notice=email-terverifikasi";
/**
 * T-198: where a sign-up verification link lands. It asks for the password
 * chosen at sign-up; Better Auth's own GET `/verify-email` is disabled.
 */
export const CONFIRM_EMAIL_PAGE = "/verifikasi-email/konfirmasi";
export const RESET_PASSWORD_PAGE = "/atur-ulang-password";
/** A compact JWS, the shape of Better Auth's email verification token. */
export const VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{10,1024}\.[A-Za-z0-9_-]{10,1024}\.[A-Za-z0-9_-]{10,256}$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-cased and trimmed, the form Better Auth stores; `null` when unusable. */
export function normalizeEmailInput(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length >= 3 && email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
