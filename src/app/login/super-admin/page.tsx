import type { Metadata } from "next";

import Link from "next/link";

import { LoginForm } from "@/app/login/_components/login-form";

export const metadata: Metadata = { robots: { index: false } };

const demoPassword =
  process.env.NODE_ENV !== "production"
  && process.env.GERAICUAN_ENABLE_DEMO_LOGIN_HINT === "1"
    ? process.env.DEV_LOCAL_PASSWORD
    : undefined;

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
    <main className="auth-page">
      <div className="auth-login-shell">
        <p className="auth-brand">GeraiCUAN</p>
        <section aria-labelledby="login-title" className="auth-card">
          <header className="auth-heading">
            <h1 id="login-title">Masuk Super Admin</h1>
            <p>Untuk pengelolaan tenant dan operasional platform.</p>
          </header>
          <LoginForm
            demoCredentials={
              demoPassword
                ? { email: "super@geraicuan.com", password: demoPassword }
                : undefined
            }
            destination="/platform"
            initialNotice={initialNotice}
          />
        </section>
        <Link className="auth-return" href="/">
          Kembali ke halaman utama
        </Link>
      </div>
    </main>
  );
}
