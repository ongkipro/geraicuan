"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { resetPassword, type PasswordResetState } from "@/app/atur-ulang-password/actions";
import { AUTH_ERROR, AUTH_HINT, AUTH_LABEL } from "@/app/login/_components/auth-shell";
import { PasswordInput } from "@/app/login/_components/password-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const initialState: PasswordResetState = { status: "idle" };

export function PasswordResetForm({ token }: { token: string | null }) {
  const [state, action, pending] = useActionState(resetPassword, initialState);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "idle") resultRef.current?.focus();
  }, [state]);

  if (!token || state.status === "expired") {
    return (
      <div className="flex flex-col gap-5">
        <Alert role="alert" variant="destructive">
          <AlertTitle>Tautan sudah tidak berlaku</AlertTitle>
          <AlertDescription>Tautan atur ulang kata sandi hanya berlaku 1 jam dan sekali pakai.</AlertDescription>
        </Alert>
        <Button asChild className="w-full text-[length:inherit]" size="lg">
          <Link href="/lupa-password">Minta tautan baru</Link>
        </Button>
      </div>
    );
  }
  if (state.status === "done") {
    return (
      <div className="flex flex-col gap-5 outline-none" ref={resultRef} tabIndex={-1}>
        <Alert role="status">
          <AlertTitle>Kata sandi diperbarui</AlertTitle>
          <AlertDescription>Semua sesi lama sudah dikeluarkan.</AlertDescription>
        </Alert>
        <Button asChild className="w-full text-[length:inherit]" size="lg">
          <Link href="/login/tenant?notice=kata-sandi-diperbarui">Masuk dengan kata sandi baru</Link>
        </Button>
      </div>
    );
  }

  const errors = state.status === "invalid" ? state.errors : {};
  return (
    <form action={action} aria-busy={pending} className="flex flex-col gap-5" noValidate>
      <input name="token" type="hidden" value={token} />
      {state.status === "limited" ? (
        <div className="outline-none" ref={resultRef} tabIndex={-1}>
          <Alert role="alert" variant="destructive">
            <AlertTitle>Terlalu banyak percobaan</AlertTitle>
            <AlertDescription>Coba lagi dalam satu jam.</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label className={AUTH_LABEL} htmlFor="password">Kata sandi baru</Label>
        <PasswordInput
          aria-describedby={["password-hint", errors.password ? "password-error" : ""].filter(Boolean).join(" ")}
          aria-invalid={errors.password ? true : undefined}
          autoComplete="new-password"
          autoFocus
          id="password"
          maxLength={128}
          minLength={8}
          name="password"
          required
        />
        <p className={AUTH_HINT} id="password-hint">Minimal 8 karakter.</p>
        {errors.password ? <p className={AUTH_ERROR} id="password-error">{errors.password}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label className={AUTH_LABEL} htmlFor="passwordConfirmation">Ulangi kata sandi baru</Label>
        <PasswordInput
          aria-describedby={errors.passwordConfirmation ? "passwordConfirmation-error" : undefined}
          aria-invalid={errors.passwordConfirmation ? true : undefined}
          autoComplete="new-password"
          id="passwordConfirmation"
          maxLength={128}
          minLength={8}
          name="passwordConfirmation"
          required
        />
        {errors.passwordConfirmation ? <p className={AUTH_ERROR} id="passwordConfirmation-error">{errors.passwordConfirmation}</p> : null}
      </div>
      <Button className="w-full text-[length:inherit]" disabled={pending} size="lg" type="submit">
        {pending ? "Menyimpan…" : "Simpan kata sandi baru"}
      </Button>
    </form>
  );
}
