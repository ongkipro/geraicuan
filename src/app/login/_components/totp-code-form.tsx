"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { AUTH_FIELD, AUTH_HINT, AUTH_LABEL } from "@/app/login/_components/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TotpResult = "expired" | "invalid" | "ok" | "rate-limited" | "unavailable";

/**
 * T-286: one TOTP code to Better Auth (`/two-factor/verify-totp`). At sign-in it is the second
 * step of the Super Admin login (the challenge cookie names the account); at enrollment it proves
 * the new secret and switches two-factor on. Never sends `trustDevice`: the server refuses it.
 */
async function verifyTotpCode(code: string): Promise<TotpResult> {
  try {
    const response = await fetch("/api/auth/two-factor/verify-totp", {
      body: JSON.stringify({ code }),
      credentials: "same-origin",
      headers: { "content-type": "application/json", "x-geraicuan-login-scope": "platform" },
      method: "POST",
    });
    if (response.ok) return "ok";
    if (response.status === 429) return "rate-limited";
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    return body?.code === "INVALID_CODE" ? "invalid" : "expired";
  } catch {
    return "unavailable";
  }
}

const ERRORS: Record<Exclude<TotpResult, "ok">, { body: string; title: string }> = {
  expired: { body: "Waktu verifikasi habis atau kode salah terlalu sering. Masuk ulang dengan email dan kata sandi.", title: "Mulai lagi dari awal" },
  invalid: { body: "Kode salah atau sudah berganti. Ketik 6 angka yang sedang tampil di aplikasi autentikator.", title: "Kode belum cocok" },
  "rate-limited": { body: "Terlalu banyak percobaan. Tunggu 15 menit, lalu coba lagi.", title: "Coba lagi nanti" },
  unavailable: { body: "Layanan sedang tidak tersedia. Periksa koneksi internet, lalu coba lagi.", title: "Belum terkirim" },
};

/** The 6-digit code field with its submit button; `onVerified` runs after Better Auth accepts it. */
export function TotpCodeForm({
  children,
  onExpired,
  onVerified,
  submitLabel,
}: {
  children?: ReactNode;
  onExpired?: () => void;
  onVerified: () => void;
  submitLabel: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<Exclude<TotpResult, "ok">>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    const result = await verifyTotpCode(code);
    if (result === "ok") {
      onVerified();
      return;
    }
    setPending(false);
    setCode("");
    if (result === "expired" && onExpired) onExpired();
    else setError(result);
  }

  return (
    <form aria-busy={pending} className="flex flex-col gap-5" method="post" onSubmit={submit}>
      {children}
      <div className="flex flex-col gap-2">
        <Label className={AUTH_LABEL} htmlFor="totp-code">Kode autentikator</Label>
        <Input
          aria-describedby={error ? "totp-hint totp-error" : "totp-hint"}
          aria-invalid={error === "invalid" || undefined}
          autoComplete="one-time-code"
          autoFocus
          className={`${AUTH_FIELD} font-mono tracking-[0.3em]`}
          id="totp-code"
          inputMode="numeric"
          maxLength={6}
          minLength={6}
          name="code"
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          pattern="[0-9]{6}"
          required
          value={code}
        />
        <p className={AUTH_HINT} id="totp-hint">6 angka dari aplikasi autentikator (Google Authenticator, Microsoft Authenticator, 1Password, dan sejenisnya). Kode berganti setiap 30 detik.</p>
      </div>
      {error ? (
        <Alert id="totp-error" variant="destructive">
          <AlertTitle>{ERRORS[error].title}</AlertTitle>
          <AlertDescription>{ERRORS[error].body}</AlertDescription>
        </Alert>
      ) : null}
      <Button className="w-full text-[length:inherit]" disabled={pending} size="lg" type="submit">
        {pending ? "Memeriksa…" : submitLabel}
      </Button>
    </form>
  );
}
