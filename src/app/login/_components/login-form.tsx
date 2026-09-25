"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { AUTH_FIELD, AUTH_LABEL } from "@/app/login/_components/auth-shell";
import { LOGIN_NOTICES, type LoginNotice } from "@/app/login/_components/login-notices";
import { PasswordInput } from "@/app/login/_components/password-input";
import { resendVerificationEmail } from "@/app/verifikasi-email/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginError = "credentials" | "rate-limited" | "unavailable" | "unverified";

const ERRORS: Record<Exclude<LoginError, "unverified">, string> = {
  credentials: "Email atau kata sandi salah. Periksa kembali, lalu coba lagi.",
  "rate-limited": "Terlalu banyak percobaan. Tunggu satu menit, lalu coba lagi.",
  unavailable: "Layanan masuk sedang tidak tersedia. Periksa koneksi internet, lalu coba lagi.",
};

/**
 * Better Auth email sign-in with the scope header (`x-geraicuan-login-scope`), so a tenant
 * account cannot open a Super Admin session and vice versa. An error never says whether an
 * account exists; "email not verified" is only answered after the correct password.
 */
export function LoginForm({
  demoCredentials,
  destination,
  initialNotice,
}: {
  demoCredentials?: { email: string; password: string };
  destination: "/app" | "/platform";
  initialNotice?: LoginNotice;
}) {
  const tenant = destination === "/app";
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<LoginError>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const [resendState, setResendState] = useState<"idle" | "limited" | "sent">("idle");
  const [resending, startResend] = useTransition();

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
        if (response.status === 429) setError("rate-limited");
        else if (response.status === 403) {
          const body = (await response.json().catch(() => null)) as { code?: string } | null;
          setError(body?.code === "EMAIL_NOT_VERIFIED" ? "unverified" : "credentials");
        } else setError("credentials");
        setPending(false);
        return;
      }
      window.location.assign(destination);
    } catch {
      setError("unavailable");
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

  const currentNotice = notice ? LOGIN_NOTICES[notice] : null;
  const describedBy = [notice ? "login-notice" : "", error ? "login-error" : ""].filter(Boolean).join(" ") || undefined;

  return (
    <form aria-busy={pending} className="flex flex-col gap-5" method="post" onSubmit={signIn}>
      {currentNotice ? (
        <Alert id="login-notice" role="status" variant={currentNotice.tone}>
          <AlertTitle>{currentNotice.title}</AlertTitle>
          <AlertDescription>
            {currentNotice.body}
            {notice === "verifikasi-gagal" ? (
              <>
                {" "}
                <Link href="/verifikasi-email">Minta tautan baru</Link>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label className={AUTH_LABEL} htmlFor="email">Email</Label>
        <Input
          aria-describedby={describedBy}
          aria-invalid={error === "credentials" || undefined}
          autoComplete="email"
          autoFocus
          className={AUTH_FIELD}
          id="email"
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label className={AUTH_LABEL} htmlFor="password">Kata sandi</Label>
        <PasswordInput
          aria-describedby={error ? "login-error" : undefined}
          aria-invalid={error === "credentials" || undefined}
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
                <span>Kata sandi Anda benar. Buka email &ldquo;Verifikasi email GeraiCUAN Anda&rdquo;, atau kirim ulang.</span>
                {resendState === "sent" ? (
                  <span role="status">Jika email ini belum terverifikasi, tautan baru sudah dikirim. Tautan berlaku 1 jam.</span>
                ) : resendState === "limited" ? (
                  <span role="status">Tautan sudah beberapa kali dikirim. Tunggu satu jam sebelum meminta lagi.</span>
                ) : null}
                <Button disabled={resending || resendState !== "idle"} onClick={resend} type="button" variant="outline">
                  {resending ? "Mengirim…" : "Kirim ulang email verifikasi"}
                </Button>
              </>
            ) : (
              <span>Hubungi pengelola platform GeraiCUAN.</span>
            )}
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert id="login-error" variant="destructive">
          <AlertTitle>Masuk belum berhasil</AlertTitle>
          <AlertDescription>{ERRORS[error]}</AlertDescription>
        </Alert>
      ) : null}
      <Button className="w-full text-[length:inherit]" disabled={pending} size="lg" type="submit">
        {pending ? "Memproses…" : "Masuk"}
      </Button>
      {demoCredentials ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3 text-sm" id="demo-hint">
          <span>
            Akun demo <code className="font-mono">{demoCredentials.email}</code>
          </span>
          <Button onClick={fillDemoCredentials} size="sm" type="button" variant="outline">Isi otomatis</Button>
        </div>
      ) : null}
    </form>
  );
}
