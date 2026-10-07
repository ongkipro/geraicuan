"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AUTH_HINT, AUTH_LABEL } from "@/app/login/_components/auth-shell";
import { PasswordInput } from "@/app/login/_components/password-input";
import { TotpCodeForm } from "@/app/login/_components/totp-code-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type EnableError = "password" | "rate-limited" | "unavailable";

const ERRORS: Record<EnableError, string> = {
  password: "Kata sandi salah. Periksa kembali, lalu coba lagi.",
  "rate-limited": "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.",
  unavailable: "Layanan sedang tidak tersedia. Muat ulang halaman, lalu coba lagi.",
};

/** The base32 secret of an `otpauth://` URI, in groups of four for typing. */
function setupKey(totpURI: string) {
  const secret = new URL(totpURI).searchParams.get("secret") ?? "";
  return secret.match(/.{1,4}/g)?.join(" ") ?? "";
}

/**
 * T-286: confirm the password (Better Auth `/two-factor/enable` creates an unverified secret),
 * add the key to an authenticator app, then prove it with one code (`/two-factor/verify-totp`
 * switches two-factor on and replaces the session). Only then does `/platform` open.
 */
export function TwoFactorSetup() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<EnableError>();
  const [pending, setPending] = useState(false);
  const [totpURI, setTotpURI] = useState<string>();

  async function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    try {
      const response = await fetch("/api/auth/two-factor/enable", {
        body: JSON.stringify({ password }),
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-geraicuan-login-scope": "platform" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as { totpURI?: string } | null;
      if (response.ok && body?.totpURI) {
        setPassword("");
        setTotpURI(body.totpURI);
      } else setError(response.status === 429 ? "rate-limited" : response.status === 400 ? "password" : "unavailable");
    } catch {
      setError("unavailable");
    }
    setPending(false);
  }

  if (totpURI) {
    return (
      <TotpCodeForm onVerified={() => router.replace("/platform")} submitLabel="Aktifkan dan lanjut">
        <ol className="flex list-decimal flex-col gap-3 pl-5">
          <li>Buka aplikasi autentikator di ponsel Anda, lalu pilih tambah akun.</li>
          <li>
            Pilih masukkan kunci penyiapan, lalu ketik kunci ini (jenis: berbasis waktu):
            <code className="mt-2 block rounded-lg bg-muted px-3 py-3 font-mono text-base break-all select-all" data-slot="setup-key">
              {setupKey(totpURI)}
            </code>
            <span className={AUTH_HINT}>Di ponsel ini, Anda juga bisa langsung </span>
            <a className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline" href={totpURI}>
              membuka aplikasi autentikator
            </a>
            <span className={AUTH_HINT}>.</span>
          </li>
          <li>Ketik 6 angka yang tampil di aplikasi.</li>
        </ol>
        <p className={AUTH_HINT}>Kunci ini rahasia; jangan dibagikan. Jika ponsel hilang, hubungi pengelola platform untuk mengatur ulang.</p>
      </TotpCodeForm>
    );
  }

  return (
    <form aria-busy={pending} className="flex flex-col gap-5" method="post" onSubmit={enable}>
      <div className="flex flex-col gap-2">
        <Label className={AUTH_LABEL} htmlFor="password">Kata sandi</Label>
        <PasswordInput
          aria-describedby={error ? "enable-error" : undefined}
          aria-invalid={error === "password" || undefined}
          autoComplete="current-password"
          autoFocus
          id="password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          value={password}
        />
        <p className={AUTH_HINT}>Ketik ulang kata sandi untuk memastikan ini memang Anda.</p>
      </div>
      {error ? (
        <Alert id="enable-error" variant="destructive">
          <AlertTitle>Belum bisa dilanjutkan</AlertTitle>
          <AlertDescription>{ERRORS[error]}</AlertDescription>
        </Alert>
      ) : null}
      <Button className="w-full text-[length:inherit]" disabled={pending} size="lg" type="submit">
        {pending ? "Memproses…" : "Lanjut"}
      </Button>
    </form>
  );
}
