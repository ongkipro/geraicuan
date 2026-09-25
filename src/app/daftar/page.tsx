import type { Metadata } from "next";
import Link from "next/link";

import { RegistrationForm } from "@/app/daftar/registration-form";
import { AuthShell } from "@/app/login/_components/auth-shell";
import { resolveHostRouting } from "@/lib/auth-config";

export const metadata: Metadata = { robots: { index: false }, title: "Daftarkan gerai · GeraiCUAN" };

const homeHref = resolveHostRouting(process.env)?.publicOrigin ?? "/";

/** T-181 (PR-59): `app.geraicuan.com/daftar`. */
export default function RegistrationPage() {
  return (
    <AuthShell
      description="Isi data gerai dan pemilik. Setelah email terverifikasi, Anda bisa menyiapkan gerai sambil menunggu persetujuan Super Admin."
      footer={<Link className="auth-link" href="/login/tenant">Sudah punya akun? Masuk</Link>}
      homeHref={homeHref}
      surface="tenant"
      title="Daftarkan gerai Anda"
      width="wide"
    >
      <RegistrationForm />
    </AuthShell>
  );
}
