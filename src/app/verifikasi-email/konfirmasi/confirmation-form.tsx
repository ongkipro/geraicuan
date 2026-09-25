"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { PasswordInput } from "@/app/login/_components/password-input";
import { confirmEmailVerification, type EmailConfirmationState } from "@/app/verifikasi-email/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { VERIFIED_EMAIL_CALLBACK } from "@/lib/public-auth-routes";

const initialState: EmailConfirmationState = { status: "idle" };

function ExpiredLink() {
  return (
    <div className="grid gap-5">
      <Alert role="alert" variant="destructive">
        <AlertTitle>Tautan sudah tidak berlaku</AlertTitle>
        <AlertDescription>
          Tautan verifikasi hanya berlaku 24 jam. Minta tautan baru untuk melanjutkan.
        </AlertDescription>
      </Alert>
      <Button asChild className="auth-submit">
        <Link href="/verifikasi-email">Minta tautan baru</Link>
      </Button>
    </div>
  );
}

export function EmailConfirmationForm({ token }: { token: string | null }) {
  const [state, action, pending] = useActionState(confirmEmailVerification, initialState);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "idle" && state.status !== "invalid") resultRef.current?.focus();
  }, [state]);

  if (!token || state.status === "expired") return <ExpiredLink />;
  if (state.status === "done") {
    return (
      <div className="grid gap-5 outline-none" ref={resultRef} tabIndex={-1}>
        <Alert role="status">
          <AlertTitle>Email terverifikasi</AlertTitle>
          <AlertDescription>Silakan masuk dengan email dan kata sandi pendaftaran Anda.</AlertDescription>
        </Alert>
        <Button asChild className="auth-submit">
          <Link href={VERIFIED_EMAIL_CALLBACK}>Masuk ke GeraiCUAN</Link>
        </Button>
      </div>
    );
  }

  const error = state.status === "invalid" ? state.error : undefined;
  return (
    <form action={action} aria-busy={pending} className="auth-form" noValidate>
      <input name="token" type="hidden" value={token} />
      {state.status === "mismatch" ? (
        <div className="outline-none" ref={resultRef} tabIndex={-1}>
          <Alert role="alert" variant="destructive">
            <AlertTitle>Kata sandi tidak cocok</AlertTitle>
            <AlertDescription>
              Kata sandi ini bukan kata sandi pendaftaran email tersebut. Jika Anda lupa kata sandinya,
              atau bukan Anda yang mendaftar, buat kata sandi baru lewat{" "}
              <Link className="underline underline-offset-4" href="/lupa-password">Lupa kata sandi</Link>.
              Kata sandi baru sekaligus memverifikasi email ini.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      {state.status === "limited" ? (
        <div className="outline-none" ref={resultRef} tabIndex={-1}>
          <Alert role="alert" variant="destructive">
            <AlertTitle>Terlalu banyak percobaan</AlertTitle>
            <AlertDescription>Coba lagi dalam satu jam, atau buat kata sandi baru lewat Lupa kata sandi.</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <div className="auth-field">
        <Label htmlFor="password">Kata sandi pendaftaran</Label>
        <PasswordInput
          aria-describedby={error ? "password-error" : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="current-password"
          autoFocus
          id="password"
          maxLength={128}
          name="password"
          required
        />
        {error ? <p className="auth-field-error" id="password-error">{error}</p> : null}
      </div>
      <Button className="auth-submit" disabled={pending} type="submit">
        {pending ? "Memeriksa…" : "Verifikasi email"}
      </Button>
    </form>
  );
}
