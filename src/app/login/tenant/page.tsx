import type { Metadata } from "next";

import Link from "next/link";

import { LoginForm } from "@/app/login/_components/login-form";

export const metadata: Metadata = { robots: { index: false } };

export default function TenantLoginPage() {
  return (
    <main className="auth-page">
      <section aria-labelledby="login-title" className="auth-card">
        <p>GeraiCUAN</p>
        <h1 id="login-title">Masuk Tenant</h1>
        <p>Untuk Tenant Admin dan Operator outlet pengiriman.</p>
        <LoginForm destination="/app" />
        <p><Link href="/">Kembali ke halaman utama</Link></p>
      </section>
    </main>
  );
}
