"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import {
  registerStore,
  type RegistrationActionState,
  type RegistrationValues,
} from "@/app/daftar/actions";
import { PasswordInput } from "@/app/login/_components/password-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CharacterClassInput } from "@/components/ui/character-class-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELD_ORDER = [
  "storeName",
  "whatsapp",
  "ownerName",
  "email",
  "password",
  "passwordConfirmation",
  "terms",
] as const;

const initialState: RegistrationActionState = { status: "idle" };

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p className="auth-field-error" id={id}>{message}</p> : null;
}

/**
 * T-181 (PR-59): the store sign-up form. Every rule is enforced by the server
 * action; the browser only helps (types, autocomplete, focus on the first error).
 */
export function RegistrationForm() {
  const [state, action, pending] = useActionState(registerStore, initialState);
  const summaryRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);
  const errors = state.status === "invalid" ? state.errors : {};
  const values: RegistrationValues = "values" in state ? state.values : {};

  useEffect(() => {
    if (state.status === "submitted") confirmationRef.current?.focus();
    else if (state.status !== "idle") summaryRef.current?.focus();
  }, [state]);

  if (state.status === "submitted") {
    return (
      <div className="grid gap-5" data-testid="registration-submitted">
        <Alert role="status">
          <MailCheck aria-hidden="true" />
          <AlertTitle>
            <h2 className="outline-none" ref={confirmationRef} tabIndex={-1}>Periksa email Anda</h2>
          </AlertTitle>
          <AlertDescription>
            Kami mengirim email ke <strong>{state.email}</strong>. Jika alamat ini sudah pernah
            terdaftar, email itu berisi petunjuk masuk, bukan akun baru.
          </AlertDescription>
        </Alert>
        <ol className="auth-steps">
          <li>Buka email dari GeraiCUAN dan tekan tombol <strong>Verifikasi email</strong>. Tautan berlaku 24 jam. Tidak ada? Periksa folder spam.</li>
          <li>Masuk, lalu siapkan toko: hubungkan akun Mengantar milik toko dan pilih titik pickup.</li>
          <li>Tunggu persetujuan Super Admin. Kami kirim email begitu toko disetujui; setelah itu Anda bisa membuat kiriman.</li>
        </ol>
        <Button asChild className="auth-submit">
          <Link href="/login/tenant">Ke halaman masuk</Link>
        </Button>
        <p className="auth-hint">
          Belum menerima email setelah beberapa menit?{" "}
          <Link className="underline underline-offset-4" href="/verifikasi-email">Kirim ulang tautan verifikasi</Link>.
        </p>
      </div>
    );
  }

  const errorEntries = FIELD_ORDER.filter((field) => errors[field]);
  const invalid = (field: (typeof FIELD_ORDER)[number]) => Boolean(errors[field]);
  const describe = (field: (typeof FIELD_ORDER)[number], hint?: string) =>
    [hint, errors[field] ? `${field}-error` : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <form action={action} aria-busy={pending} className="auth-form" noValidate>
      {state.status === "invalid" ? (
        <div ref={summaryRef} tabIndex={-1}>
          <Alert role="alert" variant="destructive">
            <AlertTitle>Periksa {errorEntries.length} isian berikut</AlertTitle>
            <AlertDescription>
              <ul className="grid list-disc gap-1 pl-5">
                {errorEntries.map((field) => (
                  <li key={field}>
                    <a className="underline underline-offset-4" href={`#${field}`}>{errors[field]}</a>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      ) : state.status === "limited" || state.status === "unavailable" ? (
        <div ref={summaryRef} tabIndex={-1}>
          <Alert role="alert" variant="destructive">
            <AlertTitle>Pendaftaran belum dapat diproses</AlertTitle>
            <AlertDescription>
              {state.status === "limited"
                ? "Terlalu banyak percobaan pendaftaran dari perangkat atau email ini. Coba lagi dalam satu jam."
                : "Pendaftaran hanya tersedia di alamat app.geraicuan.com."}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <fieldset className="auth-section">
        <legend>Data toko</legend>
        <div className="auth-field">
          <Label htmlFor="storeName">Nama toko</Label>
          <CharacterClassInput
            aria-describedby={describe("storeName")}
            aria-invalid={invalid("storeName")}
            autoComplete="organization"
            characterClass="BUSINESS_NAME"
            defaultValue={values.storeName}
            id="storeName"
            maxLength={120}
            name="storeName"
            required
          />
          <FieldError id="storeName-error" message={errors.storeName} />
        </div>
        <div className="auth-field">
          <Label htmlFor="whatsapp">Nomor WhatsApp toko</Label>
          <p className="auth-hint" id="whatsapp-hint">Nomor Indonesia, misalnya 0812 3456 7890.</p>
          <CharacterClassInput
            aria-describedby={describe("whatsapp", "whatsapp-hint")}
            aria-invalid={invalid("whatsapp")}
            autoComplete="tel"
            characterClass="PHONE"
            defaultValue={values.whatsapp}
            id="whatsapp"
            inputMode="tel"
            maxLength={20}
            name="whatsapp"
            required
            type="tel"
          />
          <FieldError id="whatsapp-error" message={errors.whatsapp} />
        </div>
      </fieldset>

      <fieldset className="auth-section">
        <legend>Pemilik akun</legend>
        <div className="auth-field">
          <Label htmlFor="ownerName">Nama pemilik</Label>
          <CharacterClassInput
            aria-describedby={describe("ownerName")}
            aria-invalid={invalid("ownerName")}
            autoComplete="name"
            characterClass="PERSON_NAME"
            defaultValue={values.ownerName}
            id="ownerName"
            maxLength={120}
            name="ownerName"
            required
          />
          <FieldError id="ownerName-error" message={errors.ownerName} />
        </div>
        <div className="auth-field">
          <Label htmlFor="email">Email</Label>
          <p className="auth-hint" id="email-hint">Tautan verifikasi dikirim ke alamat ini.</p>
          <Input
            aria-describedby={describe("email", "email-hint")}
            aria-invalid={invalid("email")}
            autoComplete="email"
            defaultValue={values.email}
            id="email"
            inputMode="email"
            maxLength={254}
            name="email"
            required
            type="email"
          />
          <FieldError id="email-error" message={errors.email} />
        </div>
      </fieldset>

      <fieldset className="auth-section">
        <legend>Kata sandi</legend>
        <div className="auth-field">
          <Label htmlFor="password">Kata sandi</Label>
          <p className="auth-hint" id="password-hint">Minimal 8 karakter.</p>
          <PasswordInput
            aria-describedby={describe("password", "password-hint")}
            aria-invalid={invalid("password")}
            autoComplete="new-password"
            id="password"
            maxLength={128}
            name="password"
            required
          />
          <FieldError id="password-error" message={errors.password} />
        </div>
        <div className="auth-field">
          <Label htmlFor="passwordConfirmation">Ulangi kata sandi</Label>
          <PasswordInput
            aria-describedby={describe("passwordConfirmation")}
            aria-invalid={invalid("passwordConfirmation")}
            autoComplete="new-password"
            id="passwordConfirmation"
            maxLength={128}
            name="passwordConfirmation"
            required
          />
          <FieldError id="passwordConfirmation-error" message={errors.passwordConfirmation} />
        </div>
      </fieldset>

      <div className="grid gap-2">
        <label className="auth-check" data-invalid={invalid("terms")} htmlFor="terms">
          <input
            aria-describedby={describe("terms")}
            aria-invalid={invalid("terms")}
            id="terms"
            name="terms"
            required
            type="checkbox"
            value="setuju"
          />
          <span>
            Saya setuju dengan syarat penggunaan GeraiCUAN: data toko diperiksa Super Admin
            sebelum toko disetujui, dan toko mengirim dengan akun Mengantar miliknya sendiri.
          </span>
        </label>
        <FieldError id="terms-error" message={errors.terms} />
      </div>

      <Button className="auth-submit" disabled={pending} type="submit">
        {pending ? "Mendaftarkan toko…" : "Daftarkan toko"}
      </Button>
    </form>
  );
}
