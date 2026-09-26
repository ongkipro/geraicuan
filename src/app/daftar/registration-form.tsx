"use client";

import { Check, MailCheck } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { registerStore, type RegistrationActionState } from "@/app/daftar/actions";
import { AUTH_ERROR, AUTH_FIELD, AUTH_HINT, AUTH_LABEL } from "@/app/login/_components/auth-shell";
import { PasswordInput } from "@/app/login/_components/password-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CharacterClassInput } from "@/components/ui/character-class-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateRegistration, type RegistrationField } from "@/lib/self-registration";
import { normalizeShipmentPrefixInput, suggestShipmentPrefix } from "@/lib/shipment-number";
import { cn } from "@/lib/utils";

/**
 * T-225 (PR-83, UX-v3.10): three client-side steps, one server submission. Each step runs the
 * server's own `validateRegistration` on its fields before it lets the owner advance; the Server
 * Action stays the single trust boundary and its field errors send the owner back to the step
 * that holds the first one.
 */
export const REGISTRATION_STEPS = [
  { fields: ["email", "password", "passwordConfirmation"], label: "Akun" },
  { fields: ["storeName", "ownerName", "whatsapp"], label: "Gerai" },
  { fields: ["shipmentPrefix", "terms"], label: "Awalan" },
] as const satisfies ReadonlyArray<{ fields: readonly RegistrationField[]; label: string }>;

type Field = RegistrationField;
type Errors = Partial<Record<Field, string>>;
type Values = Record<Exclude<Field, "shipmentPrefix" | "terms">, string> & { terms: boolean };

const FIELD_ORDER: Field[] = REGISTRATION_STEPS.flatMap((step) => [...step.fields]);
const initialState: RegistrationActionState = { status: "idle" };
const EMPTY: Values = { email: "", ownerName: "", password: "", passwordConfirmation: "", storeName: "", terms: false, whatsapp: "" };

/** The step (0–2) that holds a field. */
export function registrationStepOf(field: Field) {
  return REGISTRATION_STEPS.findIndex((step) => (step.fields as readonly Field[]).includes(field));
}

/** The first field with an error, in form order, or null. */
export function firstRegistrationError(errors: Errors) {
  return FIELD_ORDER.find((field) => errors[field]) ?? null;
}

/** The same FormData the server reads, built from the form's state. */
export function registrationFormData(values: Values, shipmentPrefix: string) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) if (key !== "terms") data.set(key, value as string);
  data.set("shipmentPrefix", shipmentPrefix);
  if (values.terms) data.set("terms", "setuju");
  return data;
}

/** Errors of the given steps only, from the server's own rules. */
export function registrationStepErrors(values: Values, shipmentPrefix: string, steps: number[]): Errors {
  const result = validateRegistration(registrationFormData(values, shipmentPrefix));
  if (result.ok) return {};
  const wanted = new Set<Field>(steps.flatMap((index) => [...REGISTRATION_STEPS[index].fields]));
  return Object.fromEntries(Object.entries(result.errors).filter(([field]) => wanted.has(field as Field))) as Errors;
}

function FieldRow({ children, error, hint, id, label }: { children: ReactNode; error?: string; hint?: ReactNode; id: Field; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className={AUTH_LABEL} htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className={AUTH_HINT} id={`${id}-hint`}>{hint}</p> : null}
      {error ? <p className={AUTH_ERROR} id={`${id}-error`}>{error}</p> : null}
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol aria-label="Langkah pendaftaran" className="flex items-center gap-2" data-slot="registration-stepper">
      {REGISTRATION_STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li className="flex min-w-0 flex-1 items-center gap-2 last:flex-none" key={step.label}>
            <span aria-current={active ? "step" : undefined} className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border-2 text-sm font-bold",
                  active && "border-primary bg-primary text-primary-foreground",
                  done && "border-primary text-primary",
                  !active && !done && "border-input text-muted-foreground",
                )}
              >
                {done ? <Check aria-hidden="true" className="size-4" /> : index + 1}
              </span>
              <span className={cn("text-sm", active ? "font-semibold" : "font-medium text-muted-foreground")}>
                {step.label}
                {done ? <span className="sr-only"> (selesai)</span> : null}
              </span>
            </span>
            {index < REGISTRATION_STEPS.length - 1 ? <span aria-hidden="true" className="h-0.5 min-w-3 flex-1 bg-border" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function RegistrationForm() {
  const [state, action, pending] = useActionState(registerStore, initialState);
  const [values, setValues] = useState<Values>(EMPTY);
  // Until the owner types a prefix it follows the gerai name's initials.
  const [typedPrefix, setTypedPrefix] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [focusRequest, setFocusRequest] = useState<{ id: string; seq: number } | null>(null);
  const [seenState, setSeenState] = useState(state);
  const confirmationRef = useRef<HTMLHeadingElement>(null);

  const shipmentPrefix = typedPrefix ?? suggestShipmentPrefix(values.storeName);
  const examplePrefix = normalizeShipmentPrefixInput(shipmentPrefix);

  const focus = (id: string) => setFocusRequest((previous) => ({ id, seq: (previous?.seq ?? 0) + 1 }));

  // A new answer from the server: field errors send the owner to the step of the first one.
  if (state !== seenState) {
    setSeenState(state);
    if (state.status === "invalid") {
      setErrors(state.errors);
      const first = firstRegistrationError(state.errors);
      if (first) {
        setStep(registrationStepOf(first));
        focus(first);
      }
    } else if (state.status === "limited" || state.status === "unavailable") {
      focus("registration-summary");
    }
  }

  useEffect(() => {
    if (state.status === "submitted") confirmationRef.current?.focus();
  }, [state.status]);

  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

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

  const set = (field: Exclude<Field, "shipmentPrefix" | "terms">) => (event: { target: { value: string } }) => {
    const value = event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const aria = (field: Field, hint = false) => ({
    "aria-describedby": [hint ? `${field}-hint` : "", errors[field] ? `${field}-error` : ""].filter(Boolean).join(" ") || undefined,
    "aria-invalid": errors[field] ? true : undefined,
  });

  function goTo(index: number) {
    setStep(index);
    focus(REGISTRATION_STEPS[index].fields[0]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const last = step === REGISTRATION_STEPS.length - 1;
    // The last step checks every step: an earlier one may have been left through Kembali.
    const checked = last ? REGISTRATION_STEPS.map((_, index) => index) : [step];
    const found = registrationStepErrors(values, shipmentPrefix, checked);
    const first = firstRegistrationError(found);
    setErrors(found);
    if (first) {
      setStep(registrationStepOf(first));
      focus(first);
      return;
    }
    if (!last) {
      goTo(step + 1);
      return;
    }
    // One submission, no automatic form reset: the fields stay as typed if the server refuses.
    startTransition(() => action(registrationFormData(values, shipmentPrefix)));
  }

  const errorEntries = FIELD_ORDER.filter((field) => errors[field]);
  const current = REGISTRATION_STEPS[step];

  return (
    <form aria-busy={pending} className="flex flex-col gap-6" noValidate onSubmit={submit}>
      <Stepper current={step} />

      {errorEntries.length > 0 ? (
        <Alert id="registration-summary" role="alert" tabIndex={-1} variant="destructive">
          <AlertTitle>Periksa {errorEntries.length} isian berikut</AlertTitle>
          <AlertDescription>
            <ul className="grid list-disc gap-1 pl-5">
              {errorEntries.map((field) => (
                <li key={field}>
                  <a
                    href={`#${field}`}
                    onClick={(event) => {
                      event.preventDefault();
                      setStep(registrationStepOf(field));
                      focus(field);
                    }}
                  >
                    {errors[field]}
                  </a>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : state.status === "limited" || state.status === "unavailable" ? (
        <Alert className="outline-none" id="registration-summary" role="alert" tabIndex={-1} variant="destructive">
          <AlertTitle>Pendaftaran belum dapat diproses</AlertTitle>
          <AlertDescription>
            {state.status === "limited"
              ? "Terlalu banyak percobaan pendaftaran dari perangkat atau email ini. Coba lagi dalam satu jam."
              : "Pendaftaran hanya tersedia di alamat app.geraicuan.com."}
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="flex flex-col gap-4" data-step="0" hidden={step !== 0}>
        <legend className="mb-4 text-lg font-bold">Akun</legend>
        <FieldRow error={errors.email} id="email" label="Email">
          <Input {...aria("email")} autoComplete="email" className={AUTH_FIELD} id="email" inputMode="email" maxLength={254} name="email" onChange={set("email")} required type="email" value={values.email} />
        </FieldRow>
        <FieldRow error={errors.password} hint="Minimal 8 karakter." id="password" label="Kata sandi">
          <PasswordInput {...aria("password", true)} autoComplete="new-password" id="password" maxLength={128} minLength={8} name="password" onChange={set("password")} required value={values.password} />
        </FieldRow>
        <FieldRow error={errors.passwordConfirmation} id="passwordConfirmation" label="Ulangi kata sandi">
          <PasswordInput {...aria("passwordConfirmation")} autoComplete="new-password" id="passwordConfirmation" maxLength={128} minLength={8} name="passwordConfirmation" onChange={set("passwordConfirmation")} required value={values.passwordConfirmation} />
        </FieldRow>
      </fieldset>

      <fieldset className="flex flex-col gap-4" data-step="1" hidden={step !== 1}>
        <legend className="mb-4 text-lg font-bold">Gerai</legend>
        <FieldRow error={errors.storeName} id="storeName" label="Nama gerai">
          <CharacterClassInput {...aria("storeName")} autoComplete="organization" characterClass="BUSINESS_NAME" className={AUTH_FIELD} id="storeName" maxLength={120} name="storeName" onChange={set("storeName")} required value={values.storeName} />
        </FieldRow>
        <FieldRow error={errors.ownerName} id="ownerName" label="Nama pemilik">
          <CharacterClassInput {...aria("ownerName")} autoComplete="name" characterClass="PERSON_NAME" className={AUTH_FIELD} id="ownerName" maxLength={120} name="ownerName" onChange={set("ownerName")} required value={values.ownerName} />
        </FieldRow>
        <FieldRow error={errors.whatsapp} hint="Contoh: 0812 3456 7890" id="whatsapp" label="Nomor WhatsApp gerai">
          <CharacterClassInput {...aria("whatsapp", true)} autoComplete="tel" characterClass="PHONE" className={AUTH_FIELD} id="whatsapp" inputMode="tel" maxLength={20} name="whatsapp" onChange={set("whatsapp")} required type="tel" value={values.whatsapp} />
        </FieldRow>
      </fieldset>

      <fieldset className="flex flex-col gap-4" data-step="2" hidden={step !== 2}>
        <legend className="mb-4 text-lg font-bold">Awalan nomor</legend>
        <FieldRow
          error={errors.shipmentPrefix}
          hint={(
            <>
              2–3 huruf atau angka, misalnya PHI atau A29. Nomor kiriman{" "}
              <span className="font-mono font-semibold text-foreground" data-slot="prefix-example">{examplePrefix ?? "—"}-10001</span>
              {" · "}Invoice{" "}
              <span className="font-mono font-semibold text-foreground">INV-{examplePrefix ?? "—"}-10001</span>.
              {" "}Masih bisa diubah di Pengaturan sampai kiriman pertama, lalu terkunci.
            </>
          )}
          id="shipmentPrefix"
          label="Awalan nomor kiriman"
        >
          <Input
            {...aria("shipmentPrefix", true)}
            autoCapitalize="characters"
            autoComplete="off"
            className={cn(AUTH_FIELD, "w-32 font-mono uppercase")}
            id="shipmentPrefix"
            maxLength={3}
            name="shipmentPrefix"
            onChange={(event) => {
              setTypedPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
              setErrors((existing) => ({ ...existing, shipmentPrefix: undefined }));
            }}
            required
            spellCheck={false}
            value={shipmentPrefix}
          />
        </FieldRow>
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-3">
            <Checkbox
              {...aria("terms")}
              checked={values.terms}
              className="mt-1 size-5"
              id="terms"
              name="terms"
              onCheckedChange={(checked) => {
                setValues((existing) => ({ ...existing, terms: checked === true }));
                setErrors((existing) => ({ ...existing, terms: undefined }));
              }}
              value="setuju"
            />
            <Label className="text-[length:inherit] leading-normal font-normal" htmlFor="terms">
              Saya setuju data gerai diperiksa Super Admin sebelum disetujui, dan gerai mengirim dengan akun Mengantar miliknya sendiri.
            </Label>
          </div>
          {errors.terms ? <p className={AUTH_ERROR} id="terms-error">{errors.terms}</p> : null}
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {step > 0 ? (
          <Button className="text-[length:inherit]" disabled={pending} onClick={() => goTo(step - 1)} size="lg" type="button" variant="outline">
            Kembali
          </Button>
        ) : <span aria-hidden="true" className="max-sm:hidden" />}
        <Button className="text-[length:inherit] sm:min-w-40" disabled={pending} size="lg" type="submit">
          {step < REGISTRATION_STEPS.length - 1 ? "Lanjut" : pending ? "Mendaftarkan gerai…" : "Daftar gratis"}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">Langkah {step + 1} dari {REGISTRATION_STEPS.length}: {current.label}</p>
    </form>
  );
}
