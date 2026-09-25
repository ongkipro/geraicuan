"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { resetPassword, type PasswordResetState } from "@/app/atur-ulang-password/actions";
import { PasswordInput } from "@/app/login/_components/password-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const initialState: PasswordResetState = { status: "idle" };

function ExpiredLink() {
  return (
    <div className="grid gap-5">
      <Alert role="alert" variant="destructive">
        <AlertTitle>Tautan sudah tidak berlaku</AlertTitle>
        <AlertDescription>
          Tautan atur ulang kata sandi hanya berlaku 1 jam dan hanya bisa dipakai sekali. Minta
          tautan baru untuk melanjutkan.
        </AlertDescription>
      </Alert>
      <Button asChild className="auth-submit">
        <Link href="/lupa-password">Minta tautan baru</Link>
      </Button>
    </div>
  );
}

export function PasswordResetForm({ token }: { token: string | null }) {
  const [state, action, pending] = useActionState(resetPassword, initialState);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "idle") resultRef.current?.focus();
  }, [state]);

  if (!token || state.status === "expired") return <ExpiredLink />;
  if (state.status === "done") {
    return (
      <div className="grid gap-5 outline-none" ref={resultRef} tabIndex={-1}>
        <Alert role="status">
          <AlertTitle>Kata sandi diperbarui</AlertTitle>
          <AlertDescription>Kata sandi baru sudah tersimpan. Semua sesi lama sudah dikeluarkan.</AlertDescription>
        </Alert>
        <Button asChild className="auth-submit">
          <Link href="/login/tenant?notice=kata-sandi-diperbarui">Masuk dengan kata sandi baru</Link>
        </Button>
      </div>
    );
  }

  const errors = state.status === "invalid" ? state.errors : {};
  return (
    <form action={action} aria-busy={pending} className="auth-form" noValidate>
      <input name="token" type="hidden" value={token} />
      {state.status === "limited" ? (
        <div className="outline-none" ref={resultRef} tabIndex={-1}>
          <Alert role="alert" variant="destructive">
            <AlertTitle>Terlalu banyak percobaan</AlertTitle>
            <AlertDescription>Coba lagi dalam satu jam.</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <div className="auth-field">
        <Label htmlFor="password">Kata sandi baru</Label>
        <p className="auth-hint" id="password-hint">Minimal 8 karakter.</p>
        <PasswordInput
          aria-describedby={["password-hint", errors.password ? "password-error" : ""].filter(Boolean).join(" ")}
          aria-invalid={Boolean(errors.password)}
          autoComplete="new-password"
          autoFocus
          id="password"
          maxLength={128}
          name="password"
          required
        />
        {errors.password ? <p className="auth-field-error" id="password-error">{errors.password}</p> : null}
      </div>
      <div className="auth-field">
        <Label htmlFor="passwordConfirmation">Ulangi kata sandi baru</Label>
        <PasswordInput
          aria-describedby={errors.passwordConfirmation ? "passwordConfirmation-error" : undefined}
          aria-invalid={Boolean(errors.passwordConfirmation)}
          autoComplete="new-password"
          id="passwordConfirmation"
          maxLength={128}
          name="passwordConfirmation"
          required
        />
        {errors.passwordConfirmation ? (
          <p className="auth-field-error" id="passwordConfirmation-error">{errors.passwordConfirmation}</p>
        ) : null}
      </div>
      <Button className="auth-submit" disabled={pending} type="submit">
        {pending ? "Menyimpan…" : "Simpan kata sandi baru"}
      </Button>
    </form>
  );
}
