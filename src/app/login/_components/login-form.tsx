"use client";

import { useRef, useState, type FormEvent } from "react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginFormProps = {
  demoCredentials?: {
    email: string;
    password: string;
  };
  destination: "/app" | "/platform";
};

export function LoginForm({ demoCredentials, destination }: LoginFormProps) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const describedBy = [
    demoCredentials ? "demo-hint" : undefined,
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
    setPending(true);

    try {
      const response = await fetch("/api/auth/sign-in/email", {
        body: JSON.stringify({ email, password }),
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setError(
          response.status === 429
            ? "Terlalu banyak percobaan. Coba lagi nanti."
            : "Email atau kata sandi salah.",
        );
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
    <form aria-busy={pending} className="auth-form" method="post" onSubmit={signIn}>
      <div className="auth-field">
        <Label htmlFor="email">Email</Label>
        <Input
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          autoComplete="email"
          autoFocus
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <div className="auth-field">
        <Label htmlFor="password">Kata sandi</Label>
        <Input
          aria-describedby={error ? "login-error" : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="current-password"
          id="password"
          minLength={8}
          name="password"
          ref={passwordRef}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>
      {error ? (
        <Alert id="login-error" variant="destructive">
          <AlertTitle>Masuk belum berhasil</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
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
            className="auth-demo-fill"
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
