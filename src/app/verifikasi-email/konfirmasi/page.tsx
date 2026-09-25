import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/app/login/_components/auth-shell";
import { EmailConfirmationForm } from "@/app/verifikasi-email/konfirmasi/confirmation-form";
import { VERIFICATION_TOKEN_PATTERN } from "@/lib/public-auth-routes";

// The verification token is in this page's URL: never send it onward as a referrer.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false },
  title: "Verifikasi email · GeraiCUAN",
};

/**
 * T-198 (PR-59, D-10): the page a sign-up verification link lands on. Opening
 * it verifies nothing; the owner confirms with the password chosen at sign-up.
 */
export default async function ConfirmEmailPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" && VERIFICATION_TOKEN_PATTERN.test(params.token) ? params.token : null;

  return (
    <AuthShell
      description={token
        ? "Masukkan kata sandi yang Anda buat saat mendaftarkan gerai. Email terverifikasi setelah kata sandinya cocok."
        : "Tautan ini tidak dapat dipakai."}
      footer={<Link className="auth-link" href="/login/tenant">Kembali ke halaman masuk</Link>}
      surface="tenant"
      title="Verifikasi email"
    >
      <EmailConfirmationForm token={token} />
    </AuthShell>
  );
}
