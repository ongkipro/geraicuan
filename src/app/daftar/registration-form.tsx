"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { registerStore, type RegistrationActionState, type RegistrationValues } from "@/app/daftar/actions";
import { AUTH_ERROR, AUTH_FIELD, AUTH_HINT, AUTH_LABEL } from "@/app/login/_components/auth-shell";
import { PasswordInput } from "@/app/login/_components/password-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CharacterClassInput } from "@/components/ui/character-class-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELD_ORDER = ["storeName", "whatsapp", "ownerName", "email", "password", "passwordConfirmation", "terms"] as const;
type Field = (typeof FIELD_ORDER)[number];

const initialState: RegistrationActionState = { status: "idle" };

function FieldRow({ children, error, hint, id, label }: { children: ReactNode; error?: string; hint?: string; id: Field; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className={AUTH_LABEL} htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className={AUTH_HINT} id={`${id}-hint`}>{hint}</p> : null}
      {error ? <p className={AUTH_ERROR} id={`${id}-error`}>{error}</p> : null}
    </div>
  );
}

/**
 * T-181 (PR-59): the gerai sign-up form. Every rule is enforced by `registerStore`; the browser
 * only helps (types, autocomplete, focus on the error summary).
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
      <div className="flex flex-col gap-5" data-testid="registration-submitted">
        <Alert role="status">
          <MailCheck aria-hidden="true" />
          <AlertTitle>
            <h2 className="outline-none" ref={confirmationRef} tabIndex={-1}>Periksa email Anda</h2>
          </AlertTitle>
          <AlertDescription>
            Kami mengirim email ke <strong>{state.email}</strong>. Jika alamat ini sudah pernah terdaftar, email itu berisi
            petunjuk masuk, bukan akun baru.
          </AlertDescription>
        </Alert>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Tekan tombol <strong>Verifikasi email</strong> di email dari GeraiCUAN. Tautan berlaku 24 jam.</li>
          <li>Masuk, lalu hubungkan akun Mengantar milik gerai dan pilih titik pickup.</li>
          <li>Tunggu persetujuan Super Admin; setelah itu Anda bisa membuat kiriman.</li>
        </ol>
        <Button asChild className="w-full text-[length:inherit]" size="lg">
          <Link href="/login/tenant">Ke halaman masuk</Link>
        </Button>
        <p className={AUTH_HINT}>
          Belum menerima email? <Link className="text-primary underline underline-offset-4" href="/verifikasi-email">Kirim ulang tautan verifikasi</Link>
        </p>
      </div>
    );
  }

  const errorEntries = FIELD_ORDER.filter((field) => errors[field]);
  const aria = (field: Field, hint = false) => ({
    "aria-describedby": [hint ? `${field}-hint` : "", errors[field] ? `${field}-error` : ""].filter(Boolean).join(" ") || undefined,
    "aria-invalid": errors[field] ? true : undefined,
  });

  return (
    <form action={action} aria-busy={pending} className="flex flex-col gap-6" noValidate>
      {state.status === "invalid" ? (
        <div className="outline-none" ref={summaryRef} tabIndex={-1}>
          <Alert role="alert" variant="destructive">
            <AlertTitle>Periksa {errorEntries.length} isian berikut</AlertTitle>
            <AlertDescription>
              <ul className="grid list-disc gap-1 pl-5">
                {errorEntries.map((field) => (
                  <li key={field}><a href={`#${field}`}>{errors[field]}</a></li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      ) : state.status === "limited" || state.status === "unavailable" ? (
        <div className="outline-none" ref={summaryRef} tabIndex={-1}>
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

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-4 text-lg font-bold">Data gerai</legend>
        <FieldRow error={errors.storeName} id="storeName" label="Nama gerai">
          <CharacterClassInput {...aria("storeName")} autoComplete="organization" characterClass="BUSINESS_NAME" className={AUTH_FIELD} defaultValue={values.storeName} id="storeName" maxLength={120} name="storeName" required />
        </FieldRow>
        <FieldRow error={errors.whatsapp} hint="Contoh: 0812 3456 7890" id="whatsapp" label="Nomor WhatsApp gerai">
          <CharacterClassInput {...aria("whatsapp", true)} autoComplete="tel" characterClass="PHONE" className={AUTH_FIELD} defaultValue={values.whatsapp} id="whatsapp" inputMode="tel" maxLength={20} name="whatsapp" required type="tel" />
        </FieldRow>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-4 text-lg font-bold">Pemilik akun</legend>
        <FieldRow error={errors.ownerName} id="ownerName" label="Nama pemilik">
          <CharacterClassInput {...aria("ownerName")} autoComplete="name" characterClass="PERSON_NAME" className={AUTH_FIELD} defaultValue={values.ownerName} id="ownerName" maxLength={120} name="ownerName" required />
        </FieldRow>
        <FieldRow error={errors.email} id="email" label="Email">
          <Input {...aria("email")} autoComplete="email" className={AUTH_FIELD} defaultValue={values.email} id="email" inputMode="email" maxLength={254} name="email" required type="email" />
        </FieldRow>
        <FieldRow error={errors.password} hint="Minimal 8 karakter." id="password" label="Kata sandi">
          <PasswordInput {...aria("password", true)} autoComplete="new-password" id="password" maxLength={128} minLength={8} name="password" required />
        </FieldRow>
        <FieldRow error={errors.passwordConfirmation} id="passwordConfirmation" label="Ulangi kata sandi">
          <PasswordInput {...aria("passwordConfirmation")} autoComplete="new-password" id="passwordConfirmation" maxLength={128} minLength={8} name="passwordConfirmation" required />
        </FieldRow>
      </fieldset>

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <Checkbox {...aria("terms")} className="mt-1 size-5" id="terms" name="terms" required value="setuju" />
          <Label className="text-[length:inherit] leading-normal font-normal" htmlFor="terms">
            Saya setuju data gerai diperiksa Super Admin sebelum disetujui, dan gerai mengirim dengan akun Mengantar miliknya sendiri.
          </Label>
        </div>
        {errors.terms ? <p className={AUTH_ERROR} id="terms-error">{errors.terms}</p> : null}
      </div>

      <Button className="w-full text-[length:inherit]" disabled={pending} size="lg" type="submit">
        {pending ? "Mendaftarkan gerai…" : "Daftarkan gerai"}
      </Button>
    </form>
  );
}
