"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { saveContact, type CreateContactState } from "@/app/app/kontak/actions";
import { DestinationAreaSelector, type DestinationAreaOutlet } from "@/app/app/destination-area-selector";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldWidth, FieldRow } from "@/components/cms/cms-layouts";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { CharacterClassInput, CharacterClassTextarea } from "@/components/ui/character-class-input";
import { partyNameClass } from "@/lib/field-character-classes";
import {
  CONTACT_ROLE_EFFECTS,
  CONTACT_ROLES,
  contactDetailHref,
  contactListHref,
  contactRoleLabel,
  otherContactRole,
  type ContactRole,
} from "@/lib/contact-role-filter";

function SubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button className="min-h-11 max-md:w-full md:min-h-10" disabled={disabled || pending} type="submit">
      {pending ? "Menyimpan…" : "Simpan kontak"}
    </Button>
  );
}

export function ContactForm({ outlets, role }: { outlets: DestinationAreaOutlet[]; role: ContactRole }) {
  const [state, formAction, pending] = useActionState<CreateContactState, FormData>(saveContact, {});
  const errors = state.errors ?? {};
  const values = state.values ?? {};
  const errorEntries = Object.entries(errors);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  // T-196: the name lock follows the Pengirim checkbox as it is ticked.
  const [isSender, setIsSender] = useState(state.errors ? values.roleSender === "on" : role === "pengirim");

  useEffect(() => {
    if (errorEntries.length > 0 || state.successId) errorSummaryRef.current?.focus();
  }, [errorEntries.length, state.successId]);

  if (state.successId) {
    return (
      <Alert ref={errorSummaryRef} role="status" tabIndex={-1}>
        <CheckCircle2 aria-hidden="true" />
        <AlertTitle>Kontak tersimpan</AlertTitle>
        <AlertDescription className="grid gap-4">
          <p>{state.message}</p>
          <div className="flex flex-col gap-2 md:flex-row">
            <Button asChild className="min-h-11 md:min-h-10"><Link href={contactDetailHref(state.successId, state.successRole ?? role)}>Buka detail kontak</Link></Button>
            <Button asChild className="min-h-11 md:min-h-10" variant="outline"><Link href={contactListHref(state.successRole ?? role)}>Kembali ke daftar {contactRoleLabel(state.successRole ?? role).toLowerCase()}</Link></Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const describedBy = (field: string) => errors[field] ? `${field}-error` : undefined;
  return (
    <form action={formAction} aria-busy={pending} className="grid gap-6" id="form-kontak">
      <input name="peran" type="hidden" value={role} />
      {errorEntries.length > 0 ? (
        <Alert ref={errorSummaryRef} role="alert" tabIndex={-1} variant="destructive">
          <AlertTitle>Periksa isian kontak</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {errorEntries.map(([field, message]) => (
                <li key={field}><a href={`#${field}`}>{message}</a></li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card aria-labelledby="contact-data-heading" role="region">
        <CardHeader className="border-b">
          <CardTitle id="contact-data-heading">Kontak</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <FieldGroup>
            <FieldRow>
              <Field className={fieldWidth.lg} data-invalid={Boolean(errors.contactName)}>
                <FieldLabel htmlFor="contactName">Nama</FieldLabel>
                <CharacterClassInput aria-describedby={describedBy("contactName")} aria-invalid={Boolean(errors.contactName)} autoFocus={!state.errors} characterClass={partyNameClass({ isSender })} className="min-h-11" defaultValue={values.contactName} id="contactName" name="contactName" required />
                <FieldError id="contactName-error">{errors.contactName}</FieldError>
              </Field>
              <Field className={fieldWidth.md} data-invalid={Boolean(errors.contactPhone)}>
                <FieldLabel htmlFor="contactPhone">Nomor telepon</FieldLabel>
                <CharacterClassInput aria-describedby={describedBy("contactPhone")} aria-invalid={Boolean(errors.contactPhone)} characterClass="PHONE" className="min-h-11" defaultValue={values.contactPhone} id="contactPhone" name="contactPhone" required type="tel" />
                <FieldError id="contactPhone-error">{errors.contactPhone}</FieldError>
              </Field>
            </FieldRow>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card aria-labelledby="contact-role-heading" role="region">
        <CardHeader className="border-b">
          <CardTitle id="contact-role-heading">Peran kontak</CardTitle>
          <CardDescription>Centang keduanya bila kontak juga dipakai sebagai {contactRoleLabel(otherContactRole(role)).toLowerCase()}.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <FieldSet aria-describedby={errors.roles ? "roles-error" : undefined} aria-invalid={Boolean(errors.roles)} data-invalid={Boolean(errors.roles)} id="roles" tabIndex={-1}>
            <FieldLegend className="sr-only">Peran kontak</FieldLegend>
            <FieldGroup className="flex flex-col gap-3 sm:flex-row [&>*]:flex-1">
              {CONTACT_ROLES.map((option) => {
                const name = option === "pengirim" ? "roleSender" : "roleRecipient";
                return (
                  <label className="flex min-h-11 items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-accent" key={option}>
                    <input aria-describedby={`${name}-effect`} className="mt-0.5 size-4 accent-primary" defaultChecked={state.errors ? values[name] === "on" : role === option} name={name} onChange={option === "pengirim" ? (event) => setIsSender(event.target.checked) : undefined} type="checkbox" />
                    <span className="grid gap-0.5">
                      <span className="font-medium">{contactRoleLabel(option)}</span>
                      <span className="text-muted-foreground" id={`${name}-effect`}>{CONTACT_ROLE_EFFECTS[option]}</span>
                    </span>
                  </label>
                );
              })}
            </FieldGroup>
            <FieldError id="roles-error">{errors.roles}</FieldError>
          </FieldSet>
        </CardContent>
      </Card>

      <Card aria-labelledby="contact-address-heading" role="region">
        <CardHeader className="border-b">
          <CardTitle id="contact-address-heading">Alamat pertama</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <FieldGroup>
            <Field className={fieldWidth.lg} data-invalid={Boolean(errors.addressLabel)}>
              <FieldLabel htmlFor="addressLabel">Label alamat</FieldLabel>
              <CharacterClassInput aria-describedby={describedBy("addressLabel")} aria-invalid={Boolean(errors.addressLabel)} characterClass="BUSINESS_NAME" className="min-h-11" defaultValue={values.addressLabel} id="addressLabel" name="addressLabel" required />
              <FieldDescription>Contoh: Gudang Bandung, Rumah, atau Gerai Pusat.</FieldDescription>
              <FieldError id="addressLabel-error">{errors.addressLabel}</FieldError>
            </Field>
            <Field className={fieldWidth.full} data-invalid={Boolean(errors.addressText)}>
              <FieldLabel htmlFor="addressText">Alamat</FieldLabel>
              <CharacterClassTextarea aria-describedby={describedBy("addressText")} aria-invalid={Boolean(errors.addressText)} characterClass="ADDRESS" className="min-h-24" defaultValue={values.addressText} id="addressText" name="addressText" required rows={3} />
              <FieldError id="addressText-error">{errors.addressText}</FieldError>
            </Field>
            <DestinationAreaSelector
              defaultSelection={state.selectedArea}
              defaultQuery={state.areaQuery}
              error={errors.areaLabel}
              key={state.selectedArea ? `${state.selectedArea.outletId}:${state.selectedArea.areaId}:${state.selectedArea.query}` : state.areaQuery ? `${state.areaQuery.outletId}:${state.areaQuery.query}:invalid` : "area-empty"}
              outlets={outlets}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      {/* T-206 (owner reference kontak-baru.html): Batal and the one primary, end-aligned. */}
      <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
        <Button asChild className="min-h-11 max-md:w-full md:min-h-10" variant="outline"><Link href={contactListHref(role)}>Batal</Link></Button>
        <SubmitButton />
      </div>
    </form>
  );
}
