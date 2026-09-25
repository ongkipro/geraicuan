export type LoginNotice =
  | "access-unavailable"
  | "email-terverifikasi"
  | "kata-sandi-diperbarui"
  | "session-required"
  | "verifikasi-gagal";

type SearchValue = string | string[] | undefined;

const TENANT_NOTICES: readonly LoginNotice[] = [
  "access-unavailable",
  "email-terverifikasi",
  "kata-sandi-diperbarui",
  "session-required",
];
const PLATFORM_NOTICES: readonly LoginNotice[] = ["access-unavailable", "session-required"];
// Better Auth appends `error=` to the verification callback when a link fails.
const VERIFICATION_ERRORS = ["INVALID_TOKEN", "TOKEN_EXPIRED", "USER_NOT_FOUND"];

function single(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The one notice a login page opens with, from its URL (`?notice=…`, or `?error=…` on the
 * verification callback). Only the notices that surface knows are honoured; anything else is
 * ignored, never echoed.
 */
export function resolveLoginNotice(
  surface: "platform" | "tenant",
  params: { error?: SearchValue; notice?: SearchValue },
): LoginNotice | undefined {
  const error = single(params.error);
  if (surface === "tenant" && error && VERIFICATION_ERRORS.includes(error)) return "verifikasi-gagal";
  const notice = single(params.notice);
  const allowed = surface === "tenant" ? TENANT_NOTICES : PLATFORM_NOTICES;
  return allowed.find((known) => known === notice);
}

export const LOGIN_NOTICES: Record<LoginNotice, { body: string; title: string; tone: "default" | "destructive" }> = {
  "access-unavailable": {
    body: "Akun ini tidak dapat membuka halaman tersebut. Gunakan halaman masuk yang sesuai.",
    title: "Akses tidak tersedia",
    tone: "default",
  },
  "email-terverifikasi": {
    body: "Anda sudah bisa masuk dan menyiapkan gerai. Membuat kiriman terbuka setelah Super Admin menyetujui gerai.",
    title: "Email terverifikasi",
    tone: "default",
  },
  "kata-sandi-diperbarui": {
    body: "Semua sesi lama sudah dikeluarkan. Masuk dengan kata sandi baru.",
    title: "Kata sandi diperbarui",
    tone: "default",
  },
  "session-required": {
    body: "Sesi Anda sudah berakhir atau belum dimulai. Silakan masuk kembali.",
    title: "Silakan masuk",
    tone: "default",
  },
  "verifikasi-gagal": {
    body: "Tautan verifikasi sudah kedaluwarsa atau tidak berlaku lagi.",
    title: "Tautan verifikasi tidak berlaku",
    tone: "destructive",
  },
};

/**
 * The local demo password, only outside production and only when the hint is switched on
 * (spec 15: both variables are development-only).
 */
export function demoPassword(environment: {
  DEV_LOCAL_PASSWORD?: string;
  GERAICUAN_ENABLE_DEMO_LOGIN_HINT?: string;
  NODE_ENV?: string;
}) {
  return environment.NODE_ENV !== "production" && environment.GERAICUAN_ENABLE_DEMO_LOGIN_HINT === "1"
    ? environment.DEV_LOCAL_PASSWORD || undefined
    : undefined;
}
