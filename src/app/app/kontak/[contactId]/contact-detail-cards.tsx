"use client";

import { Archive, CheckCircle2, CircleAlert, Loader2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { DestinationAreaPicker, type DestinationAreaOutlet } from "@/app/app/_shared/destination-area-picker";
import {
  addContactAddressAction,
  archiveContactAction,
  updateContactAction,
  updateContactAddressAction,
  type ContactAddressState,
  type ContactArchiveState,
  type ContactIdentityState,
} from "@/app/app/kontak/[contactId]/actions";
import { ErrorSummary, FieldMessage, RoleOptions } from "@/app/app/kontak/contact-form-parts";
import { DataCard } from "@/components/app/data-card";
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
import { Card } from "@/components/ui/card";
import { CharacterClassInput, CharacterClassTextarea } from "@/components/ui/character-class-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { CONTACT_ROLE_NAME_CONFLICT_MESSAGE, CONTACT_ROLES_CARD, type ContactRole } from "@/lib/contact-role-filter";
import { partyNameClass } from "@/lib/field-character-classes";
import { areaDisplayCase } from "@/lib/label-format";

export type DetailContact = { id: string; isRecipient: boolean; isSender: boolean; name: string; phone: string };
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

function SaveButton({ idle }: { idle: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant="outline">
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

/** Name and phone. `updateContactAction` saves identity and roles together, so the roles ride along unchanged. */
export function ContactIdentityCard({ contact }: { contact: DetailContact }) {
  const { action, errors, pending, state, summaryRef } = useIdentityAction();
  const values = state.values;
  return (
    <DataCard title="Kontak">
      <form action={action} aria-busy={pending} className="grid gap-2" id="form-kontak" noValidate>
        <input name="contactId" type="hidden" value={contact.id} />
        {contact.isSender ? <input name="roleSender" type="hidden" value="on" /> : null}
        {contact.isRecipient ? <input name="roleRecipient" type="hidden" value="on" /> : null}
        <ErrorSummary errors={{ contactName: errors.contactName, contactPhone: errors.contactPhone }} ref={summaryRef} title="Periksa data kontak" />
        <div className="grid gap-x-4 md:grid-cols-2">
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
        </div>
        <Outcome state={state} />
        <div className="flex justify-end"><SaveButton idle="Simpan kontak" /></div>
      </form>
    </DataCard>
  );
}

/** Which menus the contact appears in. Name and phone ride along unchanged; `card` phrases errors for this card. */
export function ContactRolesCard({ contact }: { contact: DetailContact }) {
  const { action, errors, pending, state } = useIdentityAction();
  const values = state.values;
  const nameConflict = errors.roles === CONTACT_ROLE_NAME_CONFLICT_MESSAGE;
  return (
    <DataCard title="Peran">
      <form action={action} aria-busy={pending} className="grid gap-2" id="form-peran" noValidate>
        <input name="contactId" type="hidden" value={contact.id} />
        <input name="contactName" type="hidden" value={contact.name} />
        <input name="contactPhone" type="hidden" value={contact.phone} />
        <input name="card" type="hidden" value={CONTACT_ROLES_CARD} />
        {/* Keyed on the submitted values: a form action resets the checkboxes to their defaults. */}
        <RoleOptions
          defaults={{
            penerima: values ? values.roleRecipient === "on" : contact.isRecipient,
            pengirim: values ? values.roleSender === "on" : contact.isSender,
          }}
          error={errors.roles}
          key={values ? `${values.roleSender}-${values.roleRecipient}` : "stored"}
        />
        {nameConflict ? <a className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="#contactName">Ubah nama di kartu Kontak</a> : null}
        <Outcome state={state} />
        <div className="flex justify-end"><SaveButton idle="Simpan peran" /></div>
      </form>
    </DataCard>
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
    <DataCard
      action={archived ? undefined : (
        <span className="flex flex-col items-end gap-1">
          <AddressDialog
            canManageSettings={canManageSettings}
            contactId={contact.id}
            contactName={contact.name}
            outlets={outlets}
            trigger={<Button disabled={full} size="sm" variant="outline"><Plus aria-hidden="true" />Tambah alamat</Button>}
          />
          {full ? <span className="text-xs text-muted-foreground">Batas {MAX_ACTIVE_ADDRESSES} alamat aktif tercapai</span> : null}
        </span>
      )}
      count={addresses.length}
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
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada alamat untuk kontak ini.</p>
      ) : (
        <ul className="grid gap-3" id="alamat">
          {addresses.map((address) => (
            <li className="grid gap-2 rounded-lg border p-4 data-[primary=true]:bg-muted/50" data-primary={address.isPrimary} key={address.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold wrap-anywhere">{address.label}</span>
                  {address.isPrimary ? <Badge variant="outline">Utama</Badge> : null}
                </span>
                {archived ? null : (
                  <AddressDialog
                    address={address}
                    canManageSettings={canManageSettings}
                    contactId={contact.id}
                    contactName={contact.name}
                    outlets={outlets}
                    trigger={(
                      <Button aria-label={`Edit alamat ${address.label}`} size="sm" variant="ghost">
                        <Pencil aria-hidden="true" />Edit
                      </Button>
                    )}
                  />
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
    </DataCard>
  );
}

/** Spec 10 §4.11 / §5.1: the archive confirmation names the contact and the consequence, in an AlertDialog. */
export function ContactArchiveZone({ contact, role }: { contact: DetailContact; role: ContactRole }) {
  const [state, action, pending] = useActionState<ContactArchiveState, FormData>(archiveContactAction, {});
  return (
    <Card className="border border-danger/30 bg-tile-danger px-6 max-md:px-4">
      <div className="grid gap-3">
        <h2 className="text-base font-semibold text-danger">Zona hati-hati</h2>
        <p className="text-sm text-muted-foreground">Kontak yang diarsipkan tidak muncul lagi saat membuat kiriman. Kiriman lama tetap menyimpan datanya.</p>
        {state.error ? (
          <Alert role="alert" variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Kontak tidak dapat diarsipkan</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-fit" variant="destructive"><Archive aria-hidden="true" />Arsipkan kontak</Button>
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
      </div>
    </Card>
  );
}
