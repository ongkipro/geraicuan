import type { Metadata } from "next";

import Link from "next/link";

import { LoginForm } from "@/app/login/_components/login-form";

export const metadata: Metadata = { robots: { index: false } };

export default function SuperAdminLoginPage() {
  return (
    <main className="auth-page">
      <section aria-labelledby="login-title" className="auth-card">
        <p>GeraiCUAN</p>
        <h1 id="login-title">Masuk Super Admin</h1>
        <p>Untuk pengelolaan tenant dan operasional platform.</p>
        <LoginForm destination="/platform" />
        <p><Link href="/">Kembali ke halaman utama</Link></p>
      </section>
    </main>
  );
}
