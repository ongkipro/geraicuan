import type { Metadata } from "next";

import { AuthShell } from "@/app/login/_components/auth-shell";
import { LoginForm } from "@/app/login/_components/login-form";
import { resolveHostRouting } from "@/lib/auth-config";

export const metadata: Metadata = { robots: { index: false }, title: "Masuk Super Admin · GeraiCUAN" };

const demoPassword =
  process.env.NODE_ENV !== "production"
  && process.env.GERAICUAN_ENABLE_DEMO_LOGIN_HINT === "1"
    ? process.env.DEV_LOCAL_PASSWORD
    : undefined;

// On the CMS hosts `/` routes back to this login, so "home" is the public
// landing site when one is configured (PR-58); single-origin mode keeps `/`.
const homeHref = resolveHostRouting(process.env)?.publicOrigin ?? "/";

/**
 * PR-62: the Super Admin login offers neither sign-up nor public recovery; a
 * Super Admin account is provisioned and recovered by the platform operator.
 */
export default async function SuperAdminLoginPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ notice?: string | string[] }>;
}) {
  const notice = (await searchParams).notice;
  const initialNotice =
    notice === "session-required" || notice === "access-unavailable"
      ? notice
      : undefined;

  return (
    <AuthShell
      description={
        <>
          <p>Untuk pengelolaan tenant, persetujuan pendaftaran dan operasional platform.</p>
          <p className="auth-heading-note">Lupa kata sandi? Hubungi pengelola platform.</p>
        </>
      }
      homeHref={homeHref}
      surface="platform"
      title="Masuk Super Admin"
    >
      <LoginForm
        demoCredentials={
          demoPassword
            ? { email: "super@geraicuan.com", password: demoPassword }
            : undefined
        }
        destination="/platform"
        initialNotice={initialNotice}
      />
    </AuthShell>
  );
}
