"use client";

import { Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { DestinationAreaPicker, type DestinationAreaOutlet } from "@/app/app/_shared/destination-area-picker";
import { saveContact, type CreateContactState } from "@/app/app/kontak/actions";
import { ErrorSummary, FieldMessage, RoleOptions } from "@/app/app/kontak/contact-form-parts";
import { DataCard } from "@/components/app/data-card";
import { Button } from "@/components/ui/button";
import { CharacterClassInput, CharacterClassTextarea } from "@/components/ui/character-class-input";
import { Field, FieldLabel } from "@/components/ui/field";
import { contactDetailHref, contactListHref, type ContactRole } from "@/lib/contact-role-filter";
import { partyNameClass } from "@/lib/field-character-classes";

/**
 * Spec 17 `/app/kontak/baru` (ref kontak-baru.html): cards Kontak · Peran · Alamat pertama, then
 * Batal and the one primary "Simpan kontak". A saved contact opens its detail page.
 */
export function ContactCreateForm({ canManageSettings, outlets, role }: {
  canManageSettings: boolean;
  outlets: DestinationAreaOutlet[];
  role: ContactRole;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<CreateContactState, FormData>(saveContact, {});
  const errors = state.errors ?? {};
  const values = state.values ?? {};
  const summaryRef = useRef<HTMLDivElement>(null);
  // T-196: the name rule follows the Pengirim checkbox as it is ticked.
  const [isSender, setIsSender] = useState(state.errors ? values.roleSender === "on" : role === "pengirim");

  useEffect(() => {
    if (state.successId) router.replace(`${contactDetailHref(state.successId, state.successRole ?? role)}&tersimpan=1`);
    else if (state.errors) summaryRef.current?.focus();
  }, [role, router, state]);

  const invalid = (field: string) => ({ "aria-describedby": `${field}-error`, "aria-invalid": Boolean(errors[field]) });

  return (
    <form action={action} aria-busy={pending} className="flex flex-col gap-6" noValidate>
      <input name="peran" type="hidden" value={role} />
      <ErrorSummary errors={errors} ref={summaryRef} targets={{ roles: "roles" }} title="Periksa isian kontak" />

      <DataCard title="Kontak">
        <div className="grid gap-x-4 md:grid-cols-2">
          <Field className="gap-2" data-invalid={Boolean(errors.contactName)}>
            <FieldLabel htmlFor="contactName">Nama lengkap</FieldLabel>
            <CharacterClassInput
              {...invalid("contactName")}
              autoComplete="off"
              characterClass={partyNameClass({ isSender })}
              defaultValue={values.contactName}
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
              {...invalid("contactPhone")}
              autoComplete="off"
              characterClass="PHONE"
              defaultValue={values.contactPhone}
              id="contactPhone"
              name="contactPhone"
              placeholder="08xxxxxxxxxx"
              required
              type="tel"
            />
            <FieldMessage error={errors.contactPhone} id="contactPhone-error" />
          </Field>
        </div>
      </DataCard>

      <DataCard title="Peran">
        <RoleOptions
          defaults={{
            penerima: state.errors ? values.roleRecipient === "on" : role === "penerima",
            pengirim: state.errors ? values.roleSender === "on" : role === "pengirim",
          }}
          error={errors.roles}
          onSenderChange={setIsSender}
        />
      </DataCard>

      <DataCard title="Alamat pertama">
        <div className="grid gap-2">
          <Field className="gap-2" data-invalid={Boolean(errors.addressLabel)}>
            <FieldLabel htmlFor="addressLabel">Label alamat</FieldLabel>
            <CharacterClassInput
              {...invalid("addressLabel")}
              characterClass="BUSINESS_NAME"
              defaultValue={values.addressLabel}
              id="addressLabel"
              maxLength={60}
              name="addressLabel"
              placeholder="Contoh: Rumah, Gudang Bandung"
              required
            />
            <FieldMessage error={errors.addressLabel} id="addressLabel-error" />
          </Field>
          <DestinationAreaPicker
            canManageSettings={canManageSettings}
            defaultQuery={state.areaQuery}
            defaultSelection={state.selectedArea}
            error={errors.areaLabel}
            key={state.selectedArea ? `${state.selectedArea.areaId}:${state.selectedArea.query}` : state.areaQuery ? `${state.areaQuery.query}:invalid` : "area"}
            label="Kecamatan tujuan Mengantar"
            outlets={outlets}
          />
          <Field className="mt-2 gap-2" data-invalid={Boolean(errors.addressText)}>
            <FieldLabel htmlFor="addressText">Alamat lengkap &amp; patokan</FieldLabel>
            <CharacterClassTextarea
              {...invalid("addressText")}
              characterClass="ADDRESS"
              defaultValue={values.addressText}
              id="addressText"
              maxLength={500}
              name="addressText"
              placeholder="Nama jalan, nomor rumah, RT/RW, kelurahan, patokan"
              required
              rows={3}
            />
            <FieldMessage error={errors.addressText} id="addressText-error" />
          </Field>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button asChild variant="outline"><Link href={contactListHref(role)}>Batal</Link></Button>
          <Button disabled={pending} type="submit">
            {pending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}
            {pending ? "Menyimpan…" : "Simpan kontak"}
          </Button>
        </div>
      </DataCard>
    </form>
  );
}
