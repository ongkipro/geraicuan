"use client";

import { Archive, CheckCircle2, CircleAlert, Loader2, Pencil, Plus, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { DestinationAreaPicker, type DestinationAreaOutlet } from "@/app/app/_shared/destination-area-picker";
import {
  addContactAddressAction,
  archiveContactAction,
  setPrimaryContactAddressAction,
  updateContactAction,
  updateContactAddressAction,
  type ContactAddressState,
  type ContactArchiveState,
  type ContactIdentityState,
  type ContactPrimaryAddressState,
} from "@/app/app/kontak/[contactId]/actions";
import { CategorySelect, ErrorSummary, FieldMessage, RoleOptions } from "@/app/app/kontak/contact-form-parts";
import { ContactSection } from "@/app/app/kontak/contact-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CharacterClassInput, CharacterClassTextarea } from "@/components/ui/character-class-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import type { ContactRole } from "@/lib/contact-role-filter";
import { partyNameClass } from "@/lib/field-character-classes";
import { areaDisplayCase } from "@/lib/label-format";

export type DetailContact = { category: string | null; id: string; isRecipient: boolean; isSender: boolean; name: string; phone: string };
export type DetailAddress = {
  address: string;
  destinationAreaId: string | null;
  destinationAreaLabel: string | null;
  id: string;
  isPrimary: boolean;
  label: string;
};

/** Contacts hold at most 20 active addresses (`hasActiveContactAddressMutationTarget`). */
export const MAX_ACTIVE_ADDRESSES = 20;

function SaveButton({ className, idle }: { className?: string; idle: string }) {
  const { pending } = useFormStatus();
  return (
    <Button className={className} disabled={pending} type="submit" variant="outline">
      {pending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}
      {pending ? "Menyimpan…" : idle}
    </Button>
  );
}

/** Success beside the control (`role=status`); a failure without field errors as an alert. */
function Outcome({ state }: { state: { errors?: object; message?: string; success?: boolean } }) {
  if (!state.message) return null;
  if (state.success) {
    return <p className="flex items-center gap-1.5 text-sm text-ok" role="status"><CheckCircle2 aria-hidden="true" className="size-4" />{state.message}</p>;
  }
  if (state.errors && Object.keys(state.errors).length > 0) return null;
  return (
    <Alert role="alert" variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Perubahan belum tersimpan</AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

function useIdentityAction() {
  const router = useRouter();
  const [state, action, pending] = useActionState<ContactIdentityState, FormData>(updateContactAction, {});
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.success) router.refresh();
    else if (state.errors) summaryRef.current?.focus();
  }, [router, state]);
  return { action, errors: state.errors ?? {}, pending, state, summaryRef };
}

/**
 * T-246 "Data kontak": name, phone, kategori and the roles in one form with one save.
 * `updateContactAction` always saved identity and roles together (it validates both), so one
 * form posting every field keeps its contract; the two-card split only duplicated the button.
 */
export function ContactDataSection({ contact }: { contact: DetailContact }) {
  const { action, errors, pending, state, summaryRef } = useIdentityAction();
  const values = state.values;
  return (
    <ContactSection id="data-kontak" title="Data kontak">
      <form action={action} aria-busy={pending} className="grid gap-2" id="form-kontak" noValidate>
        <input name="contactId" type="hidden" value={contact.id} />
        <ErrorSummary
          errors={{ category: errors.category, contactName: errors.contactName, contactPhone: errors.contactPhone, roles: errors.roles }}
          ref={summaryRef}
          title="Periksa data kontak"
        />
        {/* T-250: stacked in the 340px side column; two columns when the section is ≥ 576px (single-column layout). */}
        <div className="grid gap-x-4 @xl/section:grid-cols-2">
          <Field className="gap-2" data-invalid={Boolean(errors.contactName)}>
            <FieldLabel htmlFor="contactName">Nama lengkap</FieldLabel>
            <CharacterClassInput
              aria-describedby="contactName-error"
              aria-invalid={Boolean(errors.contactName)}
              autoComplete="off"
              characterClass={partyNameClass(contact)}
              defaultValue={values?.contactName ?? contact.name}
              id="contactName"
              maxLength={120}
              name="contactName"
              required
            />
            <FieldMessage error={errors.contactName} id="contactName-error" />
          </Field>
          <Field className="gap-2" data-invalid={Boolean(errors.contactPhone)}>
            <FieldLabel htmlFor="contactPhone">Nomor telepon / WhatsApp</FieldLabel>
            <CharacterClassInput
              aria-describedby="contactPhone-error"
              aria-invalid={Boolean(errors.contactPhone)}
              autoComplete="off"
              characterClass="PHONE"
              defaultValue={values?.contactPhone ?? contact.phone}
              id="contactPhone"
              name="contactPhone"
              required
              type="tel"
            />
            <FieldMessage error={errors.contactPhone} id="contactPhone-error" />
          </Field>
          <div className="@xl/section:col-span-2">
            <CategorySelect defaultValue={values ? values.category : contact.category} error={errors.category} key={values ? `v-${values.category}` : `s-${contact.category}`} />
          </div>
        </div>
        <p className="text-sm font-medium text-foreground">Peran</p>
        {/* Keyed on the submitted values: a form action resets the checkboxes to their defaults. */}
        <RoleOptions
          defaults={{
            penerima: values ? values.roleRecipient === "on" : contact.isRecipient,
            pengirim: values ? values.roleSender === "on" : contact.isSender,
          }}
          compact
          error={errors.roles}
          key={values ? `${values.roleSender}-${values.roleRecipient}` : "stored"}
        />
        <Outcome state={state} />
        <SaveButton className="w-full" idle="Simpan data kontak" />
      </form>
    </ContactSection>
  );
}

function AddressForm({
  address,
  canManageSettings,
  contactId,
  onDone,
  outlets,
}: {
  address?: DetailAddress;
  canManageSettings: boolean;
  contactId: string;
  onDone: () => void;
  outlets: DestinationAreaOutlet[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ContactAddressState, FormData>(address ? updateContactAddressAction : addContactAddressAction, {});
  const errors = state.errors ?? {};
  const values = state.values ?? {};
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.success) {
      router.refresh();
      onDone();
    } else if (state.errors) summaryRef.current?.focus();
  }, [onDone, router, state]);
  const prefix = address ? `edit-${address.id}` : "baru";
  return (
    <form action={action} aria-busy={pending} className="grid gap-2" noValidate>
      <input name="contactId" type="hidden" value={contactId} />
      {address ? <input name="addressId" type="hidden" value={address.id} /> : null}
      <ErrorSummary
        errors={{ addressLabel: errors.addressLabel, addressText: errors.addressText, areaLabel: errors.areaLabel }}
        ref={summaryRef}
        targets={{ addressLabel: `${prefix}-label`, addressText: `${prefix}-text` }}
        title={address ? "Periksa perubahan alamat" : "Periksa alamat baru"}
      />
      <Outcome state={state} />
      <Field className="gap-2" data-invalid={Boolean(errors.addressLabel)}>
        <FieldLabel htmlFor={`${prefix}-label`}>Label alamat</FieldLabel>
        <CharacterClassInput
          aria-describedby={`${prefix}-label-error`}
          aria-invalid={Boolean(errors.addressLabel)}
          characterClass="BUSINESS_NAME"
          defaultValue={values.addressLabel ?? address?.label}
          id={`${prefix}-label`}
          maxLength={60}
          name="addressLabel"
          placeholder="Contoh: Rumah, Gudang Bandung"
          required
        />
        <FieldMessage error={errors.addressLabel} id={`${prefix}-label-error`} />
      </Field>
      {/* The picker renders its error only when present; keep the same inline error space as the fields around it. */}
      <div className="pb-5 has-data-[slot=field-error]:pb-0">
        <DestinationAreaPicker
          canManageSettings={canManageSettings}
          defaultArea={address?.destinationAreaId && address.destinationAreaLabel ? { areaId: address.destinationAreaId, areaLabel: address.destinationAreaLabel } : null}
          defaultQuery={state.areaQuery}
          defaultSelection={state.selectedArea}
          error={errors.areaLabel}
          key={state.selectedArea ? `${state.selectedArea.areaId}:${state.selectedArea.query}` : state.areaQuery ? `${state.areaQuery.query}:invalid` : "area"}
          label="Kecamatan tujuan Mengantar"
          outlets={outlets}
        />
      </div>
      <Field className="mt-2 gap-2" data-invalid={Boolean(errors.addressText)}>
        <FieldLabel htmlFor={`${prefix}-text`}>Alamat lengkap &amp; patokan</FieldLabel>
        <CharacterClassTextarea
          aria-describedby={`${prefix}-text-error`}
          aria-invalid={Boolean(errors.addressText)}
          characterClass="ADDRESS"
          defaultValue={values.addressText ?? address?.address}
          id={`${prefix}-text`}
          maxLength={500}
          name="addressText"
          required
          rows={3}
        />
        <FieldMessage error={errors.addressText} id={`${prefix}-text-error`} />
      </Field>
      <DialogFooter>
        <Button onClick={onDone} type="button" variant="outline">Batal</Button>
        <SaveButton idle={address ? "Simpan perubahan" : "Simpan alamat"} />
      </DialogFooter>
    </form>
  );
}

function AddressDialog({
  address,
  canManageSettings,
  contactId,
  contactName,
  outlets,
  trigger,
}: {
  address?: DetailAddress;
  canManageSettings: boolean;
  contactId: string;
  contactName: string;
  outlets: DestinationAreaOutlet[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{address ? `Edit ${address.label}` : "Tambah alamat"}</DialogTitle>
          <DialogDescription>{contactName}</DialogDescription>
        </DialogHeader>
        {open ? (
          <AddressForm
            address={address}
            canManageSettings={canManageSettings}
            contactId={contactId}
            onDone={() => setOpen(false)}
            outlets={outlets}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** T-241 "Jadikan utama" (ref pengirim-detail.html "Jadikan Pickup Utama"): one small form per address. */
function MakePrimaryButton({ address, contactId }: { address: DetailAddress; contactId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ContactPrimaryAddressState, FormData>(setPrimaryContactAddressAction, {});
  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state]);
  return (
    <form action={action}>
      <input name="contactId" type="hidden" value={contactId} />
      <input name="addressId" type="hidden" value={address.id} />
      <Button aria-label={`Jadikan ${address.label} alamat utama`} disabled={pending} type="submit" variant="ghost">
        {pending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Star aria-hidden="true" />}
        Jadikan utama
      </Button>
      {state.error ? <span className="block text-xs text-destructive" role="alert">{state.error}</span> : null}
    </form>
  );
}

/** Ref kontak-detail.html "Daftar alamat": primary first with "Utama", each with Edit; add behind a dialog. */
export function ContactAddressesCard({
  addresses,
  archived,
  canManageSettings,
  contact,
  outlets,
  outletsUnavailable,
}: {
  addresses: DetailAddress[];
  archived: boolean;
  canManageSettings: boolean;
  contact: DetailContact;
  outlets: DestinationAreaOutlet[];
  outletsUnavailable: boolean;
}) {
  const full = addresses.length >= MAX_ACTIVE_ADDRESSES;
  return (
    <ContactSection
      action={archived ? undefined : (
        <span className="flex flex-col items-end gap-1">
          <AddressDialog
            canManageSettings={canManageSettings}
            contactId={contact.id}
            contactName={contact.name}
            outlets={outlets}
            trigger={<Button disabled={full} variant="outline"><Plus aria-hidden="true" />Tambah alamat</Button>}
          />
          {full ? <span className="text-xs text-muted-foreground">Batas {MAX_ACTIVE_ADDRESSES} alamat aktif tercapai</span> : null}
        </span>
      )}
      count={addresses.length}
      id="alamat-kontak"
      title="Alamat"
    >
      {outletsUnavailable ? (
        <Alert role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Pencarian kecamatan tidak tersedia</AlertTitle>
          <AlertDescription>Daftar outlet gagal dimuat. Alamat tetap bisa dibaca dan diubah tanpa mengganti kecamatan.</AlertDescription>
        </Alert>
      ) : null}
      {addresses.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada alamat untuk kontak ini.</p>
      ) : (
        // T-250: a 2-up grid only when there are two or more and the section is ≥ 512px wide.
        <ul className={addresses.length >= 2 ? "grid gap-3 @lg/section:grid-cols-2" : "grid gap-3"} id="alamat">
          {addresses.map((address) => (
            <li className="grid content-start gap-2 rounded-xl border bg-card p-4 data-[primary=true]:border-primary/40" data-primary={address.isPrimary} key={address.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold wrap-anywhere">{address.label}</span>
                  {address.isPrimary ? <Badge variant="outline">Utama</Badge> : null}
                </span>
                {archived ? null : (
                  <span className="-mr-2 flex items-center gap-1">
                  {address.isPrimary ? null : <MakePrimaryButton address={address} contactId={contact.id} />}
                  <AddressDialog
                    address={address}
                    canManageSettings={canManageSettings}
                    contactId={contact.id}
                    contactName={contact.name}
                    outlets={outlets}
                    trigger={(
                      <Button aria-label={`Edit alamat ${address.label}`} variant="ghost">
                        <Pencil aria-hidden="true" />Edit
                      </Button>
                    )}
                  />
                  </span>
                )}
              </div>
              <p className="text-sm wrap-anywhere">{areaDisplayCase(address.address)}</p>
              <p className="text-xs text-muted-foreground wrap-anywhere">
                {address.destinationAreaLabel ? areaDisplayCase(address.destinationAreaLabel) : "Kecamatan belum dipilih"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ContactSection>
  );
}

/** Spec 10 §4.11 / §5.1: the archive confirmation names the contact and the consequence, in an AlertDialog. */
export function ContactArchiveZone({ contact, role }: { contact: DetailContact; role: ContactRole }) {
  const [state, action, pending] = useActionState<ContactArchiveState, FormData>(archiveContactAction, {});
  return (
    <ContactSection
      description="Kontak yang diarsipkan tidak muncul lagi saat membuat kiriman. Kiriman lama tetap menyimpan datanya."
      id="zona-hati-hati"
      title="Zona hati-hati"
    >
        {state.error ? (
          <Alert role="alert" variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Kontak tidak dapat diarsipkan</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            {/* Destructive outline: quiet at rest, the consequence is named in the dialog. */}
            <Button className="w-fit border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive" variant="outline"><Archive aria-hidden="true" />Arsipkan kontak</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Arsipkan {contact.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                {contact.name} tidak lagi bisa dipilih sebagai pengirim atau penerima di kiriman baru. Kiriman lama tetap menyimpan data kontak ini.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form action={action}>
              <input name="contactId" type="hidden" value={contact.id} />
              <input name="dari" type="hidden" value={role} />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
                <Button disabled={pending} type="submit" variant="destructive">
                  {pending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Archive aria-hidden="true" />}
                  {pending ? "Mengarsipkan…" : `Ya, arsipkan ${contact.name}`}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
    </ContactSection>
  );
}
