import type { Metadata } from "next";

import { AuthLink, AuthShell } from "@/app/login/_components/auth-shell";
import { LoginForm } from "@/app/login/_components/login-form";
import { demoPassword, resolveLoginNotice } from "@/app/login/_components/login-notices";
import { resolveHostRouting } from "@/lib/auth-config";

export const metadata: Metadata = { robots: { index: false }, title: "Masuk" };

const demo = demoPassword(process.env);
// On the CMS hosts `/` routes back to this login, so "home" is the public landing site when one
// is configured (PR-58); single-origin mode keeps `/`.
const homeHref = resolveHostRouting(process.env)?.publicOrigin ?? "/";

export default async function TenantLoginPage({ searchParams }: PageProps<"/login/tenant">) {
  const initialNotice = resolveLoginNotice("tenant", await searchParams);
  return (
    <AuthShell
      description="Untuk pemilik gerai dan operator pengiriman."
      footer={
        <>
          <AuthLink href="/lupa-password">Lupa kata sandi?</AuthLink>
          <AuthLink href="/daftar">Belum punya akun? Daftarkan gerai</AuthLink>
        </>
      }
      homeHref={homeHref}
      surface="tenant"
      title="Masuk ke gerai Anda"
    >
      <LoginForm
        demoCredentials={demo ? { email: "tenant@geraicuan.com", password: demo } : undefined}
        destination="/app"
        initialNotice={initialNotice}
      />
    </AuthShell>
  );
}
