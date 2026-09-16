"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  addContactAddressAction,
  type ContactAddressState,
  archiveContactAction,
  type ContactArchiveState,
  type ContactIdentityState,
  updateContactAction,
  updateContactAddressAction,
} from "@/app/app/kontak/[contactId]/actions";
import { DestinationAreaSelector, type DestinationAreaOutlet } from "@/app/app/destination-area-selector";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldWidth, FieldRow } from "@/components/cms/cms-layouts";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function MutationButton({ idle, pending }: { idle: string; pending: string }) {
  const status = useFormStatus();
  return <Button className="min-h-11 max-md:w-full md:min-h-8" disabled={status.pending} type="submit">{status.pending ? pending : idle}</Button>;
}

function MutationFeedback({ state, targetRef }: { state: ContactAddressState | ContactIdentityState; targetRef: React.RefObject<HTMLDivElement | null> }) {
  if (!state.message) return null;
  return (
    <Alert ref={targetRef} role={state.success ? "status" : "alert"} tabIndex={-1} variant={state.success ? "default" : "destructive"}>
      {state.success ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      <AlertTitle>{state.success ? "Perubahan tersimpan" : "Perubahan belum tersimpan"}</AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

export function ContactIdentityForm({ contact }: { contact: { id: string; isRecipient: boolean; isSender: boolean; name: string; phone: string } }) {
  const [state, action, pending] = useActionState<ContactIdentityState, FormData>(updateContactAction, {});
  const feedbackRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const errors = state.errors ?? {};
  const values = state.values;
  useEffect(() => {
    if (state.message) feedbackRef.current?.focus();
    if (state.success) router.refresh();
  }, [router, state.message, state.success]);

  return (
    <Card>
      <CardHeader><CardTitle>Data kontak</CardTitle><CardDescription>Perubahan berlaku untuk draf baru. Data pada kiriman sebelumnya tetap tersimpan.</CardDescription></CardHeader>
      <CardContent>
        <form action={action} aria-busy={pending} className="grid gap-6" id="form-kontak" noValidate>
          <input name="contactId" type="hidden" value={contact.id} />
          <MutationFeedback state={state} targetRef={feedbackRef} />
          {Object.keys(errors).length > 0 ? <Alert role="alert" variant="destructive"><AlertTitle>Periksa data kontak</AlertTitle><AlertDescription><ul className="list-disc pl-5">{Object.entries(errors).map(([field, message]) => <li key={field}><a href={`#${field}`}>{message}</a></li>)}</ul></AlertDescription></Alert> : null}
          <FieldSet><FieldLegend className="sr-only">Data kontak</FieldLegend><FieldGroup><FieldRow>
            <Field className={fieldWidth.lg} data-invalid={Boolean(errors.contactName)}><FieldLabel htmlFor="contactName">Nama kontak</FieldLabel><Input aria-describedby={errors.contactName ? "contactName-error" : undefined} aria-invalid={Boolean(errors.contactName)} className="min-h-11" defaultValue={values?.contactName ?? contact.name} id="contactName" maxLength={120} name="contactName" required /><FieldError id="contactName-error">{errors.contactName}</FieldError></Field>
            <Field className={fieldWidth.md} data-invalid={Boolean(errors.contactPhone)}><FieldLabel htmlFor="contactPhone">Nomor telepon</FieldLabel><Input aria-describedby={errors.contactPhone ? "contactPhone-error" : undefined} aria-invalid={Boolean(errors.contactPhone)} className="min-h-11" defaultValue={values?.contactPhone ?? contact.phone} id="contactPhone" name="contactPhone" required type="tel" /><FieldError id="contactPhone-error">{errors.contactPhone}</FieldError></Field>
          </FieldRow></FieldGroup>
          <fieldset aria-describedby={errors.roles ? "roles-error" : undefined} aria-invalid={Boolean(errors.roles)} className="grid gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" id="roles" tabIndex={-1}>
            <legend className="text-sm font-medium">Peran kontak</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Keyed on the submitted value: a form action resets the form, and
                  the checkbox resets to the default it mounted with. */}
              <FieldLabel className="min-h-11 w-full items-center rounded-lg border px-3 py-2" htmlFor="roleSender"><Checkbox defaultChecked={values ? values.roleSender === "on" : contact.isSender} id="roleSender" key={`sender-${values ? values.roleSender ?? "off" : "initial"}`} name="roleSender" />Bisa dipakai sebagai pengirim</FieldLabel>
              <FieldLabel className="min-h-11 w-full items-center rounded-lg border px-3 py-2" htmlFor="roleRecipient"><Checkbox defaultChecked={values ? values.roleRecipient === "on" : contact.isRecipient} id="roleRecipient" key={`recipient-${values ? values.roleRecipient ?? "off" : "initial"}`} name="roleRecipient" />Bisa dipakai sebagai penerima</FieldLabel>
            </div>
            <FieldError id="roles-error">{errors.roles}</FieldError>
          </fieldset></FieldSet>
          <div className="flex justify-end border-t pt-4">
            <MutationButton idle="Simpan perubahan" pending="Menyimpan…" />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

type EditableAddress = {
  address: string;
  destinationAreaId: string | null;
  destinationAreaLabel: string | null;
  id: string;
  label: string;
};

export function ContactAddressForm({
  address,
  contactId,
  outlets,
}: {
  address?: EditableAddress;
  contactId: string;
  outlets: DestinationAreaOutlet[];
}) {
  const [state, action, pending] = useActionState<ContactAddressState, FormData>(address ? updateContactAddressAction : addContactAddressAction, {});
  const feedbackRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const errors = state.errors ?? {};
  const values = state.values ?? {};
  useEffect(() => {
    if (state.message) feedbackRef.current?.focus();
    if (state.success) router.refresh();
  }, [router, state.message, state.success]);
  return (
    <form action={action} aria-busy={pending} className="grid gap-6" id="alamat-baru" noValidate>
      <input name="contactId" type="hidden" value={contactId} />
      {address ? <input name="addressId" type="hidden" value={address.id} /> : null}
      <MutationFeedback state={state} targetRef={feedbackRef} />
      {Object.keys(errors).length > 0 ? <Alert role="alert" variant="destructive"><AlertTitle>{address ? "Periksa perubahan alamat" : "Periksa alamat baru"}</AlertTitle><AlertDescription><ul className="list-disc pl-5">{Object.entries(errors).map(([field, message]) => <li key={field}><a href={`#${field}`}>{message}</a></li>)}</ul></AlertDescription></Alert> : null}
      <FieldSet><FieldLegend>{address ? `Edit ${address.label}` : "Alamat baru"}</FieldLegend><FieldGroup>
        <Field className={fieldWidth.lg} data-invalid={Boolean(errors.addressLabel)}><FieldLabel htmlFor="addressLabel">Label alamat</FieldLabel><Input aria-describedby={errors.addressLabel ? "addressLabel-hint addressLabel-error" : "addressLabel-hint"} aria-invalid={Boolean(errors.addressLabel)} className="min-h-11" defaultValue={values.addressLabel ?? address?.label} id="addressLabel" maxLength={60} name="addressLabel" required /><FieldDescription id="addressLabel-hint">Contoh: Gudang Bandung, Rumah, Toko Pusat.</FieldDescription><FieldError id="addressLabel-error">{errors.addressLabel}</FieldError></Field>
        <Field className={fieldWidth.full} data-invalid={Boolean(errors.addressText)}><FieldLabel htmlFor="addressText">Alamat lengkap</FieldLabel><Textarea aria-describedby={errors.addressText ? "addressText-error" : undefined} aria-invalid={Boolean(errors.addressText)} defaultValue={values.addressText ?? address?.address} id="addressText" maxLength={500} name="addressText" required rows={3} /><FieldError id="addressText-error">{errors.addressText}</FieldError></Field>
        <DestinationAreaSelector
          defaultArea={address?.destinationAreaId && address.destinationAreaLabel ? { areaId: address.destinationAreaId, areaLabel: address.destinationAreaLabel } : null}
          defaultQuery={state.areaQuery}
          defaultSelection={state.selectedArea}
          error={errors.areaLabel}
          key={state.selectedArea ? `${state.selectedArea.outletId}:${state.selectedArea.areaId}:${state.selectedArea.query}` : state.areaQuery ? `${state.areaQuery.outletId}:${state.areaQuery.query}:invalid` : `area-${address?.id ?? "new"}`}
          outlets={outlets}
        />
      </FieldGroup></FieldSet>
      <div className="flex justify-end border-t pt-4">
        <MutationButton idle={address ? "Simpan perubahan alamat" : "Simpan alamat"} pending="Menyimpan…" />
      </div>
    </form>
  );
}

export function ArchiveSubmitButton() {
  const { pending } = useFormStatus();
  return <Button className="min-h-11" disabled={pending} type="submit" variant="destructive">{pending ? "Mengarsipkan…" : "Ya, arsipkan kontak"}</Button>;
}

export function ArchiveHashFocus() {
  useEffect(() => {
    const focusHeading = () => {
      if (window.location.hash === "#arsip-heading") {
        requestAnimationFrame(() => document.getElementById("arsip-heading")?.focus());
      }
    };
    focusHeading();
    window.addEventListener("hashchange", focusHeading);
    return () => window.removeEventListener("hashchange", focusHeading);
  }, []);
  return null;
}

export function ArchiveConfirmationForm({ contactId }: { contactId: string }) {
  const [state, action, pending] = useActionState<ContactArchiveState, FormData>(archiveContactAction, {});
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);
  return (
    <form action={action} aria-busy={pending} className="grid gap-3">
      <input name="contactId" type="hidden" value={contactId} />
      {state.error ? <Alert ref={errorRef} role="alert" tabIndex={-1} variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Kontak tidak dapat diarsipkan</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <ArchiveSubmitButton />
        <Button asChild className="min-h-11" variant="outline"><a href={`/app/kontak/${contactId}#arsip-heading`}>Batal</a></Button>
      </div>
    </form>
  );
}
