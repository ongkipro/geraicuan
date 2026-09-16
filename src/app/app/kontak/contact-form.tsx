"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function SubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button className="min-h-11 max-md:w-full md:min-h-8" disabled={disabled || pending} type="submit">
      {pending ? "Menyimpan…" : "Simpan kontak"}
    </Button>
  );
}

export function ContactForm({ outlets }: { outlets: DestinationAreaOutlet[] }) {
  const [state, formAction, pending] = useActionState<CreateContactState, FormData>(saveContact, {});
  const errors = state.errors ?? {};
  const values = state.values ?? {};
  const errorEntries = Object.entries(errors);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

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
            <Button asChild className="min-h-11 md:min-h-8"><Link href={`/app/kontak/${state.successId}`}>Buka detail kontak</Link></Button>
            <Button asChild className="min-h-11 md:min-h-8" variant="outline"><Link href="/app/kontak">Kembali ke direktori</Link></Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const describedBy = (field: string) => errors[field] ? `${field}-error` : undefined;
  return (
    <form action={formAction} aria-busy={pending} className="grid gap-6" id="form-kontak">
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
          <CardTitle id="contact-data-heading">Data kontak</CardTitle>
          <CardDescription className="leading-6">Identitas dan peran yang tersedia saat membuat kiriman.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <FieldGroup>
            <FieldRow>
              <Field className={fieldWidth.lg} data-invalid={Boolean(errors.contactName)}>
                <FieldLabel htmlFor="contactName">Nama</FieldLabel>
                <Input aria-describedby={describedBy("contactName")} aria-invalid={Boolean(errors.contactName)} autoFocus={!state.errors} className="min-h-11" defaultValue={values.contactName} id="contactName" name="contactName" required />
                <FieldError id="contactName-error">{errors.contactName}</FieldError>
              </Field>
              <Field className={fieldWidth.md} data-invalid={Boolean(errors.contactPhone)}>
                <FieldLabel htmlFor="contactPhone">Nomor telepon</FieldLabel>
                <Input aria-describedby={describedBy("contactPhone")} aria-invalid={Boolean(errors.contactPhone)} className="min-h-11" defaultValue={values.contactPhone} id="contactPhone" name="contactPhone" required type="tel" />
                <FieldError id="contactPhone-error">{errors.contactPhone}</FieldError>
              </Field>
            </FieldRow>
            <FieldSet aria-describedby={errors.roles ? "roles-error" : undefined} aria-invalid={Boolean(errors.roles)} data-invalid={Boolean(errors.roles)} id="roles" tabIndex={-1}>
              <FieldLegend>Peran kontak</FieldLegend>
              <FieldGroup className="gap-3">
                <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm font-medium"><input className="size-4 accent-primary" defaultChecked={state.errors ? values.roleSender === "on" : true} name="roleSender" type="checkbox" />Bisa dipakai sebagai pengirim</label>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm font-medium"><input className="size-4 accent-primary" defaultChecked={state.errors ? values.roleRecipient === "on" : true} name="roleRecipient" type="checkbox" />Bisa dipakai sebagai penerima</label>
                <FieldError id="roles-error">{errors.roles}</FieldError>
              </FieldGroup>
            </FieldSet>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card aria-labelledby="contact-address-heading" role="region">
        <CardHeader className="border-b">
          <CardTitle id="contact-address-heading">Alamat pertama</CardTitle>
          <CardDescription className="leading-6">Alamat ini dapat dipakai kembali pada draf berikutnya.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <FieldGroup>
            <Field className={fieldWidth.lg} data-invalid={Boolean(errors.addressLabel)}>
              <FieldLabel htmlFor="addressLabel">Label alamat</FieldLabel>
              <Input aria-describedby={describedBy("addressLabel")} aria-invalid={Boolean(errors.addressLabel)} className="min-h-11" defaultValue={values.addressLabel} id="addressLabel" name="addressLabel" required />
              <FieldDescription>Contoh: Gudang Bandung, Rumah, atau Toko Pusat.</FieldDescription>
              <FieldError id="addressLabel-error">{errors.addressLabel}</FieldError>
            </Field>
            <Field className={fieldWidth.full} data-invalid={Boolean(errors.addressText)}>
              <FieldLabel htmlFor="addressText">Alamat</FieldLabel>
              <Textarea aria-describedby={describedBy("addressText")} aria-invalid={Boolean(errors.addressText)} className="min-h-24" defaultValue={values.addressText} id="addressText" name="addressText" required rows={3} />
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

      <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">Perubahan kontak tidak mengubah kiriman yang sudah dibuat.</p>
        <SubmitButton />
      </div>
    </form>
  );
}
