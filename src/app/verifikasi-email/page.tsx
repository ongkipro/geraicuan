import type { Metadata } from "next";

import { AuthLink, AuthShell } from "@/app/login/_components/auth-shell";
import { VerificationResendForm } from "@/app/verifikasi-email/resend-form";

export const metadata: Metadata = { robots: { index: false }, title: "Verifikasi email" };

/** PR-59 / D-10: ask for a new verification link. */
export default function VerifyEmailPage() {
  return (
    <AuthShell
      description="Masukkan email pendaftaran untuk menerima tautan verifikasi baru."
      footer={<AuthLink href="/login/tenant">Kembali ke halaman masuk</AuthLink>}
      surface="tenant"
      title="Kirim ulang verifikasi email"
    >
      <VerificationResendForm />
    </AuthShell>
  );
}
