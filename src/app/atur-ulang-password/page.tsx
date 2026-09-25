import type { Metadata } from "next";
import Link from "next/link";

import { PasswordResetForm } from "@/app/atur-ulang-password/reset-form";
import { AuthShell } from "@/app/login/_components/auth-shell";

// The reset token is in this page's URL: never send it onward as a referrer.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false },
  title: "Atur ulang kata sandi · GeraiCUAN",
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/** PR-62: the page a reset link lands on (`/api/auth/reset-password/:token` redirects here). */
export default async function ResetPasswordPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ error?: string | string[]; token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" && TOKEN_PATTERN.test(params.token) ? params.token : null;

  return (
    <AuthShell
      description={token ? "Buat kata sandi baru untuk akun gerai Anda." : "Tautan ini tidak dapat dipakai lagi."}
      footer={<Link className="auth-link" href="/login/tenant">Kembali ke halaman masuk</Link>}
      surface="tenant"
      title="Atur ulang kata sandi"
    >
      <PasswordResetForm token={params.error ? null : token} />
    </AuthShell>
  );
}
