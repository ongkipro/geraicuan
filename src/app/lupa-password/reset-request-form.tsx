"use client";

import { MailCheck } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { requestPasswordReset, type PasswordResetRequestState } from "@/app/lupa-password/actions";
import { AUTH_ERROR, AUTH_FIELD, AUTH_LABEL } from "@/app/login/_components/auth-shell";
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
            Jika email itu terdaftar sebagai akun gerai, tautan untuk membuat kata sandi baru sudah dikirim. Tautan berlaku 1 jam.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const error = state.status === "invalid" ? state.error : undefined;
  return (
    <form action={action} aria-busy={pending} className="flex flex-col gap-5" noValidate>
      {state.status === "limited" ? (
        <div className="outline-none" ref={resultRef} tabIndex={-1}>
          <Alert role="alert" variant="destructive">
            <AlertTitle>Terlalu banyak permintaan</AlertTitle>
            <AlertDescription>Tautan sudah beberapa kali diminta. Coba lagi dalam satu jam.</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label className={AUTH_LABEL} htmlFor="email">Email</Label>
        <Input
          aria-describedby={error ? "email-error" : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="email"
          autoFocus
          className={AUTH_FIELD}
          defaultValue={state.status === "invalid" || state.status === "limited" ? state.email : undefined}
          id="email"
          inputMode="email"
          name="email"
          required
          type="email"
        />
        {error ? <p className={AUTH_ERROR} id="email-error">{error}</p> : null}
      </div>
      <Button className="w-full text-[length:inherit]" disabled={pending} size="lg" type="submit">
        {pending ? "Mengirim…" : "Kirim tautan"}
      </Button>
    </form>
  );
}
