import type { Metadata } from "next";

import { RegistrationForm } from "@/app/daftar/registration-form";
import { AuthLink, AuthShell } from "@/app/login/_components/auth-shell";
import { resolveHostRouting } from "@/lib/auth-config";

export const metadata: Metadata = { robots: { index: false }, title: "Daftarkan gerai" };

const homeHref = resolveHostRouting(process.env)?.publicOrigin ?? "/";

/** T-181 (PR-59): `app.geraicuan.com/daftar`. */
export default function RegistrationPage() {
  return (
    <AuthShell
      description="Setelah email terverifikasi, Anda bisa menyiapkan gerai sambil menunggu persetujuan Super Admin."
      footer={<AuthLink href="/login/tenant">Sudah punya akun? Masuk</AuthLink>}
      homeHref={homeHref}
      surface="tenant"
      title="Daftarkan gerai Anda"
      wide
    >
      <RegistrationForm />
    </AuthShell>
  );
}
