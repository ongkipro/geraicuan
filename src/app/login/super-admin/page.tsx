import type { Metadata } from "next";

import { AuthShell } from "@/app/login/_components/auth-shell";
import { LoginForm } from "@/app/login/_components/login-form";
import { demoPassword, resolveLoginNotice } from "@/app/login/_components/login-notices";
import { resolveHostRouting } from "@/lib/auth-config";

export const metadata: Metadata = { robots: { index: false }, title: "Masuk Admin Platform" };

const demo = demoPassword(process.env);
const homeHref = resolveHostRouting(process.env)?.publicOrigin ?? "/";

/**
 * PR-62: the Super Admin login offers neither sign-up nor public recovery; a Super Admin account
 * is provisioned and recovered by the platform operator.
 */
export default async function SuperAdminLoginPage({ searchParams }: PageProps<"/login/super-admin">) {
  const initialNotice = resolveLoginNotice("platform", await searchParams);
  return (
    <AuthShell
      description="Lupa kata sandi? Hubungi pengelola platform."
      homeHref={homeHref}
      surface="platform"
      title="Masuk Admin Platform"
      visual
    >
      <LoginForm
        demoCredentials={demo ? { email: "super@geraicuan.com", password: demo } : undefined}
        destination="/platform"
        initialNotice={initialNotice}
      />
    </AuthShell>
  );
}
