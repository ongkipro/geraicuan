import type { Metadata } from "next";

import { PasswordResetRequestForm } from "@/app/lupa-password/reset-request-form";
import { AuthLink, AuthShell } from "@/app/login/_components/auth-shell";

export const metadata: Metadata = { robots: { index: false }, title: "Lupa kata sandi" };

/** PR-62: public recovery, tenant host only. */
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      description="Kami kirim tautan untuk membuat kata sandi baru ke email akun gerai Anda."
      footer={<AuthLink href="/login/tenant">Kembali ke halaman masuk</AuthLink>}
      surface="tenant"
      title="Lupa kata sandi"
    >
      <PasswordResetRequestForm />
    </AuthShell>
  );
}
