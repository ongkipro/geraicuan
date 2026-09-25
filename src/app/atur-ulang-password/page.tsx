import type { Metadata } from "next";

import { PasswordResetForm } from "@/app/atur-ulang-password/reset-form";
import { AuthLink, AuthShell } from "@/app/login/_components/auth-shell";

// The reset token is in this page's URL: never send it onward as a referrer.
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false }, title: "Atur ulang kata sandi" };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/** PR-62: the page a reset link lands on (`/api/auth/reset-password/:token` redirects here). */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/atur-ulang-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" && TOKEN_PATTERN.test(params.token) && !params.error ? params.token : null;
  return (
    <AuthShell
      footer={<AuthLink href="/login/tenant">Kembali ke halaman masuk</AuthLink>}
      surface="tenant"
      title="Atur ulang kata sandi"
    >
      <PasswordResetForm token={token} />
    </AuthShell>
  );
}
