import type { Metadata } from "next";

import Link from "next/link";

import { LoginForm } from "@/app/login/_components/login-form";

export const metadata: Metadata = { robots: { index: false } };

const demoPassword =
  process.env.NODE_ENV !== "production"
  && process.env.GERAICUAN_ENABLE_DEMO_LOGIN_HINT === "1"
    ? process.env.DEV_LOCAL_PASSWORD
    : undefined;

export default function TenantLoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-login-shell">
        <p className="auth-brand">GeraiCUAN</p>
        <section aria-labelledby="login-title" className="auth-card">
          <header className="auth-heading">
            <h1 id="login-title">Masuk Tenant</h1>
            <p>Untuk Tenant Admin dan Operator outlet pengiriman.</p>
          </header>
          <LoginForm
            demoCredentials={
              demoPassword
                ? { email: "tenant@geraicuan.com", password: demoPassword }
                : undefined
            }
            destination="/app"
          />
        </section>
        <Link className="auth-return" href="/">
          Kembali ke halaman utama
        </Link>
      </div>
    </main>
  );
}
