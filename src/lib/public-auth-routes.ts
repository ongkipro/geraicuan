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
