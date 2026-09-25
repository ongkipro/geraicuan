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
import { CharacterClassInput, CharacterClassTextarea } from "@/components/ui/character-class-input";
import { partyNameClass } from "@/lib/field-character-classes";
import { CopyPhoneButton, WhatsAppLink } from "@/app/app/kontak/contact-ui";
import {
  CONTACT_ROLE_EFFECTS,
  CONTACT_ROLE_NAME_CONFLICT_MESSAGE,
  CONTACT_ROLES,
  CONTACT_ROLES_CARD,
  contactRoleLabel,
  type ContactRole,
} from "@/lib/contact-role-filter";

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

type IdentityContact = { id: string; isRecipient: boolean; isSender: boolean; name: string; phone: string };

function useIdentityAction() {
  const [state, action, pending] = useActionState<ContactIdentityState, FormData>(updateContactAction, {});
  const feedbackRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state.message) feedbackRef.current?.focus();
    if (state.success) router.refresh();
  }, [router, state.message, state.success]);
  return { action, errors: state.errors ?? {}, feedbackRef, pending, state };
}

/** Moves focus into a field on the page and selects its text, e.g. the Kontak card's name. */
function focusField(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  const field = document.getElementById(id);
  if (!(field instanceof HTMLInputElement)) return;
  event.preventDefault();
  field.scrollIntoView({ block: "center" });
  field.focus();
  field.select();
}

function IdentityErrors({ errors, targets = {}, title }: { errors: Record<string, string>; targets?: Record<string, string>; title: string }) {
  if (Object.keys(errors).length === 0) return null;
  return <Alert role="alert" variant="destructive"><AlertTitle>{title}</AlertTitle><AlertDescription><ul className="list-disc pl-5">{Object.entries(errors).map(([field, message]) => {
    const target = targets[field] ?? field;
    return <li key={field}><a href={`#${target}`} onClick={(event) => focusField(event, target)}>{message}</a></li>;
  })}</ul></AlertDescription></Alert>;
}

/**
 * T-188: the contact's name and phone as their own card. `updateContactAction`
 * saves identity and roles together, so each card posts the other card's
 * stored values unchanged as hidden fields.
 */
export function ContactDetailsForm({ contact }: { contact: IdentityContact }) {
  const { action, errors, feedbackRef, pending, state } = useIdentityAction();
  const values = state.values;
  return (
    <Card>
      <CardHeader><CardTitle>Kontak</CardTitle><CardDescription>Perubahan berlaku untuk draf baru. Data pada kiriman sebelumnya tetap tersimpan.</CardDescription></CardHeader>
      <CardContent>
        <form action={action} aria-busy={pending} className="grid gap-5" id="form-kontak" noValidate>
          <input name="contactId" type="hidden" value={contact.id} />
          {contact.isSender ? <input name="roleSender" type="hidden" value="on" /> : null}
          {contact.isRecipient ? <input name="roleRecipient" type="hidden" value="on" /> : null}
          <MutationFeedback state={state} targetRef={feedbackRef} />
          <IdentityErrors errors={errors} title="Periksa data kontak" />
          <FieldSet><FieldLegend className="sr-only">Data kontak</FieldLegend><FieldGroup><FieldRow>
            <Field className={fieldWidth.lg} data-invalid={Boolean(errors.contactName)}><FieldLabel htmlFor="contactName">Nama kontak</FieldLabel><CharacterClassInput aria-describedby={errors.contactName ? "contactName-error" : undefined} aria-invalid={Boolean(errors.contactName)} characterClass={partyNameClass(contact)} className="min-h-11" defaultValue={values?.contactName ?? contact.name} id="contactName" maxLength={120} name="contactName" required /><FieldError id="contactName-error">{errors.contactName}</FieldError></Field>
            <Field className={fieldWidth.md} data-invalid={Boolean(errors.contactPhone)}><FieldLabel htmlFor="contactPhone">Nomor telepon</FieldLabel><CharacterClassInput aria-describedby={errors.contactPhone ? "contactPhone-error" : undefined} aria-invalid={Boolean(errors.contactPhone)} characterClass="PHONE" className="min-h-11" defaultValue={values?.contactPhone ?? contact.phone} id="contactPhone" name="contactPhone" required type="tel" /><FieldError id="contactPhone-error">{errors.contactPhone}</FieldError></Field>
          </FieldRow></FieldGroup></FieldSet>
          <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <CopyPhoneButton label="Salin nomor" name={contact.name} phone={contact.phone} showLabel />
              <WhatsAppLink name={contact.name} phone={contact.phone} showLabel />
            </div>
            <MutationButton idle="Simpan kontak" pending="Menyimpan…" />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** T-188: which menus the contact appears in, with what each role does. */
export function ContactRolesForm({ contact }: { contact: IdentityContact }) {
  const { action, errors, feedbackRef, pending, state } = useIdentityAction();
  const values = state.values;
  const nameConflict = errors.roles === CONTACT_ROLE_NAME_CONFLICT_MESSAGE;
  return (
    <Card>
      <CardHeader><CardTitle>Peran</CardTitle><CardDescription>Kontak dengan dua peran muncul di menu Pengirim dan Penerima.</CardDescription></CardHeader>
      <CardContent>
        <form action={action} aria-busy={pending} className="grid gap-5" id="form-peran" noValidate>
          <input name="contactId" type="hidden" value={contact.id} />
          <input name="contactName" type="hidden" value={contact.name} />
          <input name="contactPhone" type="hidden" value={contact.phone} />
          <input name="card" type="hidden" value={CONTACT_ROLES_CARD} />
          <MutationFeedback state={state} targetRef={feedbackRef} />
          <IdentityErrors errors={errors} targets={nameConflict ? { roles: "contactName" } : undefined} title="Periksa peran kontak" />
          <fieldset aria-describedby={errors.roles ? "roles-error" : undefined} aria-invalid={Boolean(errors.roles)} className="grid gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" id="roles" tabIndex={-1}>
            <legend className="sr-only">Peran kontak</legend>
            <div className="flex flex-col gap-3 sm:flex-row [&>*]:flex-1">
              {/* Keyed on the submitted value: a form action resets the form, and
                  the checkbox resets to the default it mounted with. */}
              {CONTACT_ROLES.map((role) => {
                const name = role === "pengirim" ? "roleSender" : "roleRecipient";
                const held = role === "pengirim" ? contact.isSender : contact.isRecipient;
                return (
                  <FieldLabel className="min-h-11 w-full items-start rounded-lg border p-3 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted/60" htmlFor={name} key={role}>
                    <Checkbox aria-describedby={`${name}-effect`} className="mt-0.5" defaultChecked={values ? values[name] === "on" : held} id={name} key={`${role}-${values ? values[name] ?? "off" : "initial"}`} name={name} />
                    <span className="grid gap-0.5 font-normal">
                      <span className="font-medium">{contactRoleLabel(role)}</span>
                      <span className="text-muted-foreground" id={`${name}-effect`}>{CONTACT_ROLE_EFFECTS[role]}</span>
                    </span>
                  </FieldLabel>
                );
              })}
            </div>
            <FieldError id="roles-error">
              {nameConflict ? (
                <>
                  {errors.roles}{" "}
                  <a className="font-medium underline underline-offset-4" href="#contactName" onClick={(event) => focusField(event, "contactName")}>Ubah nama di kartu Kontak</a>
                </>
              ) : errors.roles}
            </FieldError>
          </fieldset>
          <div className="flex justify-end border-t pt-4">
            <MutationButton idle="Simpan peran" pending="Menyimpan…" />
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
        <Field className={fieldWidth.lg} data-invalid={Boolean(errors.addressLabel)}><FieldLabel htmlFor="addressLabel">Label alamat</FieldLabel><CharacterClassInput aria-describedby={errors.addressLabel ? "addressLabel-hint addressLabel-error" : "addressLabel-hint"} aria-invalid={Boolean(errors.addressLabel)} characterClass="BUSINESS_NAME" className="min-h-11" defaultValue={values.addressLabel ?? address?.label} id="addressLabel" maxLength={60} name="addressLabel" required /><FieldDescription id="addressLabel-hint">Contoh: Gudang Bandung, Rumah, Toko Pusat.</FieldDescription><FieldError id="addressLabel-error">{errors.addressLabel}</FieldError></Field>
        <Field className={fieldWidth.full} data-invalid={Boolean(errors.addressText)}><FieldLabel htmlFor="addressText">Alamat lengkap</FieldLabel><CharacterClassTextarea aria-describedby={errors.addressText ? "addressText-error" : undefined} aria-invalid={Boolean(errors.addressText)} characterClass="ADDRESS" defaultValue={values.addressText ?? address?.address} id="addressText" maxLength={500} name="addressText" required rows={3} /><FieldError id="addressText-error">{errors.addressText}</FieldError></Field>
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

export function ArchiveConfirmationForm({ contactId, role }: { contactId: string; role: ContactRole }) {
  const [state, action, pending] = useActionState<ContactArchiveState, FormData>(archiveContactAction, {});
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);
  return (
    <form action={action} aria-busy={pending} className="grid gap-3">
      <input name="contactId" type="hidden" value={contactId} />
      <input name="dari" type="hidden" value={role} />
      {state.error ? <Alert ref={errorRef} role="alert" tabIndex={-1} variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Kontak tidak dapat diarsipkan</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <ArchiveSubmitButton />
        <Button asChild className="min-h-11" variant="outline"><a href={`/app/kontak/${contactId}?dari=${role}#arsip-heading`}>Batal</a></Button>
      </div>
    </form>
  );
}
