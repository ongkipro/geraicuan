"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { saveContact, type CreateContactState } from "@/app/app/kontak/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="sales-primary ship-submit" disabled={pending} type="submit">{pending ? "Menyimpan…" : "Simpan kontak"}</button>;
}

function FieldError({ error, id }: { error?: string; id: string }) {
  return error ? <p className="ship-field-error" id={id}>{error}</p> : null;
}

export function ContactForm() {
  const [state, formAction, pending] = useActionState<CreateContactState, FormData>(saveContact, {});
  const errors = state.errors ?? {};
  const values = state.values ?? {};
  const errorEntries = Object.entries(errors);
  const errorSummaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (errorEntries.length > 0) errorSummaryRef.current?.focus();
  }, [errorEntries.length]);

  const describedBy = (field: string) => errors[field] ? `${field}-error` : undefined;
  return <form action={formAction} aria-busy={pending} className="ship-form" id="form-kontak">
    {errorEntries.length > 0 ? <section className="ship-error-summary" ref={errorSummaryRef} role="alert" tabIndex={-1}><h2>Periksa isian kontak</h2><ul>{errorEntries.map(([field, message]) => <li key={field}><a href={`#${field}`}>{message}</a></li>)}</ul></section> : null}
    <fieldset className="ship-group"><legend>Kontak</legend>
      <label htmlFor="contactName">Nama<input aria-describedby={describedBy("contactName")} aria-invalid={Boolean(errors.contactName)} autoFocus={!state.errors} defaultValue={values.contactName} id="contactName" name="contactName" required /><FieldError error={errors.contactName} id="contactName-error" /></label>
      <label htmlFor="contactPhone">Nomor telepon<input aria-describedby={describedBy("contactPhone")} aria-invalid={Boolean(errors.contactPhone)} defaultValue={values.contactPhone} id="contactPhone" name="contactPhone" required type="tel" /><FieldError error={errors.contactPhone} id="contactPhone-error" /></label>
      <fieldset className="ship-payment" id="roles"><legend>Peran kontak</legend><label><input defaultChecked={state.errors ? values.roleSender === "on" : true} name="roleSender" type="checkbox" />Bisa dipakai sebagai pengirim</label><label><input defaultChecked={state.errors ? values.roleRecipient === "on" : true} name="roleRecipient" type="checkbox" />Bisa dipakai sebagai penerima</label><FieldError error={errors.roles} id="roles-error" /></fieldset>
    </fieldset>
    <fieldset className="ship-group"><legend>Alamat pertama</legend>
      <label htmlFor="addressLabel">Label alamat<input aria-describedby={describedBy("addressLabel")} aria-invalid={Boolean(errors.addressLabel)} defaultValue={values.addressLabel} id="addressLabel" name="addressLabel" required /><span className="bulk-hint">Contoh: Gudang Bandung, Rumah, Toko Pusat.</span><FieldError error={errors.addressLabel} id="addressLabel-error" /></label>
      <label htmlFor="addressText">Alamat<textarea aria-describedby={describedBy("addressText")} aria-invalid={Boolean(errors.addressText)} defaultValue={values.addressText} id="addressText" name="addressText" required rows={3} /><FieldError error={errors.addressText} id="addressText-error" /></label>
      <div className="ship-pair"><label htmlFor="areaLabel">Nama area<input aria-describedby={describedBy("areaLabel")} aria-invalid={Boolean(errors.areaLabel)} defaultValue={values.areaLabel} id="areaLabel" name="areaLabel" /><FieldError error={errors.areaLabel} id="areaLabel-error" /></label><label htmlFor="areaId">ID area<input aria-describedby={describedBy("areaId")} aria-invalid={Boolean(errors.areaId)} defaultValue={values.areaId} id="areaId" name="areaId" /><FieldError error={errors.areaId} id="areaId-error" /></label></div>
      <p className="bulk-hint">Isi area bila kontak dipakai sebagai penerima agar area tujuan draf dapat diisi otomatis.</p>
    </fieldset>
    <p className="bulk-hint">Perubahan kontak tidak mengubah kiriman yang sudah dibuat.</p><SubmitButton />
  </form>;
}
