import type { Metadata } from "next";

import Link from "next/link";

import { AuthShell } from "@/app/login/_components/auth-shell";
import { LoginForm, type LoginNotice } from "@/app/login/_components/login-form";
import { resolveHostRouting } from "@/lib/auth-config";

export const metadata: Metadata = { robots: { index: false }, title: "Masuk · GeraiCUAN" };

const demoPassword =
  process.env.NODE_ENV !== "production"
  && process.env.GERAICUAN_ENABLE_DEMO_LOGIN_HINT === "1"
    ? process.env.DEV_LOCAL_PASSWORD
    : undefined;

// On the CMS hosts `/` routes back to this login, so "home" is the public
// landing site when one is configured (PR-58); single-origin mode keeps `/`.
const homeHref = resolveHostRouting(process.env)?.publicOrigin ?? "/";

const TENANT_NOTICES = new Set<LoginNotice>([
  "access-unavailable",
  "email-terverifikasi",
  "kata-sandi-diperbarui",
  "session-required",
]);
// Better Auth appends `error=` to the verification callback when a link fails.
const VERIFICATION_ERRORS = new Set(["INVALID_TOKEN", "TOKEN_EXPIRED", "USER_NOT_FOUND"]);

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TenantLoginPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ error?: string | string[]; notice?: string | string[] }>;
}) {
  const params = await searchParams;
  const notice = single(params.notice);
  const error = single(params.error);
  const initialNotice: LoginNotice | undefined = error && VERIFICATION_ERRORS.has(error)
    ? "verifikasi-gagal"
    : notice && TENANT_NOTICES.has(notice as LoginNotice)
      ? notice as LoginNotice
      : undefined;

  return (
    <AuthShell
      description="Untuk pemilik toko dan operator pengiriman."
      footer={
        <>
          <Link className="auth-link" href="/lupa-password">Lupa kata sandi?</Link>
          <Link className="auth-link" href="/daftar">Belum punya akun? Daftarkan toko</Link>
        </>
      }
      homeHref={homeHref}
      surface="tenant"
      title="Masuk ke toko Anda"
    >
      <LoginForm
        demoCredentials={
          demoPassword
            ? { email: "tenant@geraicuan.com", password: demoPassword }
            : undefined
        }
        destination="/app"
        initialNotice={initialNotice}
      />
    </AuthShell>
  );
}
