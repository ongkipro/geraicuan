import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/app/login/_components/auth-shell";
import { VerificationResendForm } from "@/app/verifikasi-email/resend-form";

export const metadata: Metadata = { robots: { index: false }, title: "Verifikasi email · GeraiCUAN" };

/** PR-59 / D-10: ask for a new verification link. */
export default function VerifyEmailPage() {
  return (
    <AuthShell
      description="Akun toko harus memverifikasi email sebelum bisa masuk. Masukkan email pendaftaran untuk menerima tautan baru."
      footer={<Link className="auth-link" href="/login/tenant">Kembali ke halaman masuk</Link>}
      surface="tenant"
      title="Kirim ulang verifikasi email"
    >
      <VerificationResendForm />
    </AuthShell>
  );
}
