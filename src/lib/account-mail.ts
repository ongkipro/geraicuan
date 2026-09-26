import "server-only";

import { resolveHostRouting } from "@/lib/auth-config";
import { composeMail, sendMail } from "@/lib/mail";

/**
 * The account messages of sign-up, verification, recovery and review (PR-59,
 * PR-61, D-10). Indonesian, short, one action each.
 */

/** Where a tenant signs in: the tenant host, or the single development origin. */
export function tenantLoginUrl() {
  const origin = resolveHostRouting(process.env)?.tenantOrigin
    ?? process.env.BETTER_AUTH_URL?.trim()
    ?? "";
  return `${origin.replace(/\/$/, "")}/login`;
}

/*
 * Verification, recovery and account-exists mail goes to whatever address was
 * typed into a public form, so it never repeats a name typed there (L5): an
 * attacker-chosen name would otherwise ride inside a genuine GeraiCUAN message.
 */

export function sendVerificationMail(to: string, url: string) {
  return sendMail(composeMail({
    action: { label: "Verifikasi email", url },
    kind: "verify-email",
    paragraphs: [
      "Halo,",
      "Email ini baru saja dipakai untuk mendaftarkan gerai di GeraiCUAN. Jika itu Anda, tekan tombol di bawah, lalu masukkan kata sandi yang Anda buat saat mendaftar. Tautan berlaku 24 jam.",
      "Setelah email terverifikasi, Anda sudah bisa masuk dan menyiapkan gerai sambil menunggu persetujuan admin platform.",
      "Jika Anda tidak mendaftar, abaikan email ini. Email ini hanya terverifikasi dengan kata sandi pendaftarnya, jadi tidak ada yang bisa masuk dengan email Anda.",
    ],
    subject: "Verifikasi email GeraiCUAN Anda",
    to,
  }));
}

/**
 * `unverified`: the account was never verified, so its password may have been
 * chosen by someone else (H1). Choosing a new password through this link is
 * what verifies the email (`onPasswordReset` in `src/lib/auth.ts`).
 */
export function sendResetPasswordMail(to: string, url: string, unverified: boolean) {
  return sendMail(composeMail({
    action: { label: unverified ? "Buat kata sandi" : "Atur ulang kata sandi", url },
    kind: "reset-password",
    paragraphs: unverified
      ? [
          "Halo,",
          "Email ini sudah terdaftar di GeraiCUAN tetapi belum diverifikasi. Untuk memverifikasinya, buat kata sandi baru lewat tombol di bawah. Kata sandi lama tidak berlaku lagi setelahnya. Tautan berlaku 1 jam dan hanya bisa dipakai sekali.",
          "Jika Anda tidak meminta ini, abaikan email ini.",
        ]
      : [
          "Halo,",
          "Kami menerima permintaan untuk mengatur ulang kata sandi akun GeraiCUAN Anda. Tekan tombol di bawah untuk membuat kata sandi baru. Tautan berlaku 1 jam dan hanya bisa dipakai sekali.",
          "Jika Anda tidak meminta ini, abaikan email ini. Kata sandi Anda tidak berubah.",
        ],
    subject: unverified ? "Buat kata sandi untuk memverifikasi email GeraiCUAN" : "Atur ulang kata sandi GeraiCUAN",
    to,
  }));
}

/** Sent instead of a second account when someone registers an email that already exists. */
export function sendAccountExistsMail(to: string) {
  return sendMail(composeMail({
    action: { label: "Masuk ke GeraiCUAN", url: tenantLoginUrl() },
    kind: "account-exists",
    paragraphs: [
      "Halo,",
      "Seseorang mencoba mendaftarkan gerai baru dengan email ini, tetapi email ini sudah memiliki akun GeraiCUAN. Tidak ada akun baru yang dibuat.",
      "Jika itu Anda, silakan masuk. Lupa kata sandi? Pilih \"Lupa kata sandi\" di halaman masuk.",
    ],
    subject: "Email Anda sudah terdaftar di GeraiCUAN",
    to,
  }));
}

export function sendRegistrationApprovedMail(to: string, name: string, storeName: string) {
  return sendMail(composeMail({
    action: { label: "Masuk ke GeraiCUAN", url: tenantLoginUrl() },
    kind: "registration-approved",
    paragraphs: [
      `Halo ${name},`,
      `Gerai ${storeName} sudah disetujui. Anda sekarang dapat membuat, mengestimasi dan menerbitkan kiriman dengan akun Mengantar milik gerai.`,
    ],
    subject: "Gerai Anda sudah disetujui",
    to,
  }));
}

/**
 * T-198: a rejected owner's address may never have been verified, so the mail
 * repeats neither the store nor the owner name typed at sign-up (L5). The
 * reason is the Super Admin's own text.
 */
export function sendRegistrationRejectedMail(to: string, reason: string) {
  return sendMail(composeMail({
    kind: "registration-rejected",
    paragraphs: [
      "Halo,",
      "Pendaftaran gerai dengan email ini di GeraiCUAN belum dapat disetujui.",
      `Alasan: ${reason}`,
      "Jika menurut Anda ada kekeliruan, hubungi tim GeraiCUAN.",
    ],
    subject: "Pendaftaran gerai Anda belum dapat disetujui",
    to,
  }));
}
