"use client";

import { FormEvent, useState } from "react";

type LoginFormProps = { destination: "/app" | "/platform" };

export function LoginForm({ destination }: LoginFormProps) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(undefined);
    setPending(true);

    try {
      const response = await fetch("/api/auth/sign-in/email", {
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setError(response.status === 429 ? "Terlalu banyak percobaan. Coba lagi nanti." : "Email atau kata sandi salah.");
        return;
      }

      window.location.assign(destination);
    } catch {
      setError("Layanan masuk sedang tidak tersedia. Coba lagi nanti.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form aria-busy={pending} onSubmit={signIn}>
      <label htmlFor="email">Email</label>
      <input autoComplete="email" autoFocus id="email" name="email" required type="email" />
      <label htmlFor="password">Kata sandi</label>
      <input autoComplete="current-password" id="password" minLength={8} name="password" required type="password" />
      {error ? <p role="alert">{error}</p> : null}
      <button disabled={pending} type="submit">{pending ? "Memproses…" : "Masuk"}</button>
    </form>
  );
}
