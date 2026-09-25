"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { PasswordInput } from "@/app/login/_components/password-input";
import { resendVerificationEmail } from "@/app/verifikasi-email/actions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LoginNotice =
  | "access-unavailable"
  | "email-terverifikasi"
  | "kata-sandi-diperbarui"
  | "session-required"
  | "verifikasi-gagal";

type LoginFormProps = {
  demoCredentials?: {
    email: string;
    password: string;
  };
  destination: "/app" | "/platform";
  initialNotice?: LoginNotice;
};

const notices: Record<LoginNotice, { body: string; title: string; tone: "default" | "destructive" }> = {
  "access-unavailable": {
    body: "Akun ini tidak dapat membuka halaman tersebut. Gunakan halaman masuk yang sesuai atau hubungi administrator.",
    title: "Akses tidak tersedia",
    tone: "default",
  },
  "email-terverifikasi": {
    body: "Toko Anda sekarang menunggu persetujuan Super Admin. Anda sudah bisa masuk untuk menyiapkan outlet, titik pickup dan akun Mengantar milik toko. Membuat kiriman terbuka setelah toko disetujui, dan kami kirim email begitu keputusan dibuat.",
    title: "Email terverifikasi",
    tone: "default",
  },
  "kata-sandi-diperbarui": {
    body: "Kata sandi baru sudah tersimpan dan semua sesi lama sudah dikeluarkan. Silakan masuk dengan kata sandi baru.",
    title: "Kata sandi diperbarui",
    tone: "default",
  },
  "session-required": {
    body: "Sesi Anda sudah berakhir atau belum dimulai. Silakan masuk kembali.",
    title: "Silakan masuk",
    tone: "default",
  },
  "verifikasi-gagal": {
    body: "Tautan verifikasi sudah kedaluwarsa atau tidak berlaku lagi. Minta tautan baru lewat halaman verifikasi email.",
    title: "Tautan verifikasi tidak berlaku",
    tone: "destructive",
  },
};

type LoginError = "credentials" | "rate-limited" | "unavailable" | "unverified";

/**
 * T-183 (PR-62). Keeps the contract the browser audits use: the first `form` on
 * the page, `#email`, `#password` and `.auth-submit`. An error never says
 * whether an account exists: a wrong email and a wrong password read the same.
 * "Email not verified" is only answered after the correct password.
 */
export function LoginForm({
  demoCredentials,
  destination,
  initialNotice,
}: LoginFormProps) {
  const tenant = destination === "/app";
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<LoginError>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const [resendState, setResendState] = useState<"idle" | "limited" | "sent">("idle");
  const [resending, startResend] = useTransition();
  const describedBy = [
    demoCredentials ? "demo-hint" : undefined,
    notice ? "login-notice" : undefined,
    error ? "login-error" : undefined,
  ]
    .filter(Boolean)
    .join(" ") || undefined;

  function fillDemoCredentials() {
    if (!demoCredentials) return;

    setEmail(demoCredentials.email);
    setPassword(demoCredentials.password);
    setError(undefined);
    passwordRef.current?.focus();
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    setResendState("idle");
    setPending(true);

    try {
      const response = await fetch("/api/auth/sign-in/email", {
        body: JSON.stringify({ email, password }),
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-geraicuan-login-scope": tenant ? "tenant" : "platform",
        },
        method: "POST",
      });

      if (!response.ok) {
        if (response.status === 429) {
          setError("rate-limited");
        } else if (response.status === 403) {
          const body = await response.json().catch(() => null) as { code?: string } | null;
          setError(body?.code === "EMAIL_NOT_VERIFIED" ? "unverified" : "credentials");
        } else {
          setError("credentials");
        }
        return;
      }

      window.location.assign(destination);
    } catch {
      setError("unavailable");
    } finally {
      setPending(false);
    }
  }

  function resend() {
    startResend(async () => {
      const data = new FormData();
      data.set("email", email);
      const result = await resendVerificationEmail({ status: "idle" }, data);
      setResendState(result.status === "limited" ? "limited" : "sent");
    });
  }

  const currentNotice = notice ? notices[notice] : null;

  return (
    <form aria-busy={pending} className="auth-form" method="post" onSubmit={signIn}>
      {currentNotice ? (
        <Alert id="login-notice" role="status" variant={currentNotice.tone}>
          <AlertTitle>{currentNotice.title}</AlertTitle>
          <AlertDescription>
            {currentNotice.body}
            {notice === "verifikasi-gagal" ? (
              <>
                {" "}
                <Link className="underline underline-offset-4" href="/verifikasi-email">Minta tautan baru</Link>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="auth-field">
        <Label htmlFor="email">Email</Label>
        <Input
          aria-describedby={describedBy}
          aria-invalid={error === "credentials"}
          autoComplete="email"
          autoFocus
          id="email"
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <div className="auth-field">
        <Label htmlFor="password">Kata sandi</Label>
        <PasswordInput
          aria-describedby={error ? "login-error" : undefined}
          aria-invalid={error === "credentials"}
          autoComplete="current-password"
          id="password"
          inputRef={passwordRef}
          minLength={8}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          value={password}
        />
      </div>
      {error === "unverified" ? (
        <Alert id="login-error" role="alert">
          <AlertTitle>Email belum terverifikasi</AlertTitle>
          <AlertDescription className="grid gap-3">
            {tenant ? (
              <>
                <span>
                  Kata sandi Anda benar, tetapi email ini belum diverifikasi. Buka email dari
                  GeraiCUAN berjudul &ldquo;Verifikasi email GeraiCUAN Anda&rdquo; lalu tekan tombol
                  di dalamnya. Tidak menemukannya? Periksa folder spam atau kirim ulang.
                </span>
                {resendState === "sent" ? (
                  <span role="status">
                    Jika email ini belum terverifikasi, kami sudah mengirim tautan untuk membuat kata sandi
                    baru. Membuat kata sandi lewat tautan itu sekaligus memverifikasi email. Tautan berlaku 1 jam.
                  </span>
                ) : resendState === "limited" ? (
                  <span role="status">
                    Tautan sudah beberapa kali dikirim. Tunggu satu jam sebelum meminta lagi.
                  </span>
                ) : null}
                <Button
                  className="auth-secondary-action"
                  disabled={resending || resendState !== "idle"}
                  onClick={resend}
                  type="button"
                  variant="outline"
                >
                  {resending ? "Mengirim…" : "Kirim ulang email verifikasi"}
                </Button>
              </>
            ) : (
              <span>Email akun ini belum diverifikasi. Hubungi pengelola platform GeraiCUAN.</span>
            )}
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert id="login-error" variant="destructive">
          <AlertTitle>Masuk belum berhasil</AlertTitle>
          <AlertDescription>
            {error === "rate-limited"
              ? "Terlalu banyak percobaan. Tunggu satu menit, lalu coba lagi."
              : error === "unavailable"
                ? "Layanan masuk sedang tidak tersedia. Periksa koneksi internet, lalu coba lagi."
                : "Email atau kata sandi salah. Periksa kembali, lalu coba lagi."}
          </AlertDescription>
        </Alert>
      ) : null}
      <Button className="auth-submit" disabled={pending} size="lg" type="submit">
        {pending ? "Memproses…" : "Masuk"}
      </Button>
      {demoCredentials ? (
        <Alert className="auth-demo-callout" id="demo-hint" role="status">
          <AlertTitle>Gunakan akun demo</AlertTitle>
          <AlertDescription>
            <code>{demoCredentials.email}</code>
            <span> · kata sandi tersedia untuk lingkungan lokal</span>
          </AlertDescription>
          <Button
            className="min-h-11"
            onClick={fillDemoCredentials}
            size="sm"
            type="button"
            variant="outline"
          >
            Isi otomatis
          </Button>
        </Alert>
      ) : null}
    </form>
  );
}
