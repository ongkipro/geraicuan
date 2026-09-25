import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/app/login/_components/auth-shell";
import { PasswordResetRequestForm } from "@/app/lupa-password/reset-request-form";

export const metadata: Metadata = { robots: { index: false }, title: "Lupa kata sandi · GeraiCUAN" };

/** PR-62: public recovery, tenant host only. */
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      description="Masukkan email akun gerai Anda. Kami kirim tautan untuk membuat kata sandi baru."
      footer={<Link className="auth-link" href="/login/tenant">Kembali ke halaman masuk</Link>}
      surface="tenant"
      title="Lupa kata sandi"
    >
      <PasswordResetRequestForm />
    </AuthShell>
  );
}
