import { ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * T-183 (PR-62): the frame of every sign-in, sign-up and recovery page. The
 * tenant and Super Admin surfaces differ in ground, accent and badge so they
 * are never confused.
 */
export function AuthShell({
  children,
  description,
  footer,
  homeHref,
  surface,
  title,
  width = "narrow",
}: {
  children: ReactNode;
  description: ReactNode;
  footer?: ReactNode;
  homeHref?: string;
  surface: "platform" | "tenant";
  title: string;
  width?: "narrow" | "wide";
}) {
  return (
    <main className="auth-page" data-surface={surface}>
      <div className="auth-login-shell" data-width={width}>
        <div className="auth-masthead">
          <p className="auth-brand">GeraiCUAN</p>
          <p className="auth-surface-tag">
            {surface === "platform" ? <ShieldCheck aria-hidden="true" /> : <Store aria-hidden="true" />}
            {surface === "platform" ? "Khusus Super Admin" : "Untuk toko"}
          </p>
        </div>
        <section aria-labelledby="auth-title" className="auth-card">
          <header className="auth-heading">
            <h1 id="auth-title">{title}</h1>
            {typeof description === "string" ? <p>{description}</p> : description}
          </header>
          {children}
          {footer ? <nav aria-label="Tautan akun" className="auth-links">{footer}</nav> : null}
        </section>
        {homeHref ? (
          <Link className="auth-return" href={homeHref}>
            Kembali ke halaman utama
          </Link>
        ) : null}
      </div>
    </main>
  );
}
