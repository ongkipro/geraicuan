"use client";

import { MailCheck } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { requestPasswordReset, type PasswordResetRequestState } from "@/app/lupa-password/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: PasswordResetRequestState = { status: "idle" };

export function PasswordResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "idle") resultRef.current?.focus();
  }, [state]);

  if (state.status === "sent") {
    return (
      <div className="outline-none" ref={resultRef} tabIndex={-1}>
        <Alert role="status">
          <MailCheck aria-hidden="true" />
          <AlertTitle>Periksa email Anda</AlertTitle>
          <AlertDescription>
            Jika email itu terdaftar sebagai akun toko, tautan untuk membuat kata sandi baru sudah
            dikirim. Tautan berlaku 1 jam. Tidak ada di kotak masuk? Periksa folder spam.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const error = state.status === "invalid" ? state.error : undefined;
  return (
    <form action={action} aria-busy={pending} className="auth-form" noValidate>
      {state.status === "limited" ? (
        <div className="outline-none" ref={resultRef} tabIndex={-1}>
          <Alert role="alert" variant="destructive">
            <AlertTitle>Terlalu banyak permintaan</AlertTitle>
            <AlertDescription>Tautan sudah beberapa kali diminta. Coba lagi dalam satu jam.</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <div className="auth-field">
        <Label htmlFor="email">Email</Label>
        <Input
          aria-describedby={error ? "email-error" : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="email"
          autoFocus
          defaultValue={state.status === "invalid" || state.status === "limited" ? state.email : undefined}
          id="email"
          inputMode="email"
          name="email"
          required
          type="email"
        />
        {error ? <p className="auth-field-error" id="email-error">{error}</p> : null}
      </div>
      <Button className="auth-submit" disabled={pending} type="submit">
        {pending ? "Mengirim…" : "Kirim tautan"}
      </Button>
    </form>
  );
}
