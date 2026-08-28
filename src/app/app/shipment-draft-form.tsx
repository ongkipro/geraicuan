"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { saveShipmentDraft, type ShipmentDraftActionState } from "@/app/app/actions";

type Outlet = { id: string; name: string };

type ShipmentDraftFormProps = { autoFocusFirstField: boolean; outlets: Outlet[] };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="sales-primary ship-submit" disabled={pending} type="submit">
      {pending ? "Menyimpan…" : "Simpan draf"}
    </button>
  );
}

function FieldError({ error, id }: { error?: string; id: string }) {
  return error ? <p className="ship-field-error" id={id}>{error}</p> : null;
}

export function ShipmentDraftForm({ autoFocusFirstField, outlets }: ShipmentDraftFormProps) {
  const [state, formAction, pending] = useActionState<ShipmentDraftActionState, FormData>(
    saveShipmentDraft,
    {},
  );
  const errors = state.errors ?? {};
  const errorEntries = Object.entries(errors);
  const values = state.values ?? {};
  const fieldError = (field: string) => errors[field];
  const describedBy = (field: string) => (fieldError(field) ? `${field}-error` : undefined);
  const errorSummaryRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (state.errors) errorSummaryRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} aria-busy={pending} className="ship-form" id="form-kiriman">
      {errorEntries.length > 0 ? (
        <section className="ship-error-summary" ref={errorSummaryRef} role="alert" tabIndex={-1}>
          <h2>Periksa {errorEntries.length} isian berikut</h2>
          <ul>
            {errorEntries.map(([field, message]) => (
              <li key={field}><a href={`#${field}`}>{message}</a></li>
            ))}
          </ul>
        </section>
      ) : null}

      <fieldset className="ship-group">
        <legend>Pengirim</legend>
        <div className="ship-pair">
          <label htmlFor="senderName">Nama pengirim
            <input aria-describedby={describedBy("senderName")} aria-invalid={Boolean(fieldError("senderName"))} autoFocus={autoFocusFirstField && !state.errors} defaultValue={values.senderName} id="senderName" name="senderName" required />
            <FieldError error={fieldError("senderName")} id="senderName-error" />
          </label>
          <label htmlFor="senderPhone">Nomor telepon
            <input aria-describedby={describedBy("senderPhone")} aria-invalid={Boolean(fieldError("senderPhone"))} defaultValue={values.senderPhone} id="senderPhone" name="senderPhone" required type="tel" />
            <FieldError error={fieldError("senderPhone")} id="senderPhone-error" />
          </label>
        </div>
        <label htmlFor="senderAddress">Alamat pengirim
          <textarea aria-describedby={describedBy("senderAddress")} aria-invalid={Boolean(fieldError("senderAddress"))} defaultValue={values.senderAddress} id="senderAddress" name="senderAddress" required rows={3} />
          <FieldError error={fieldError("senderAddress")} id="senderAddress-error" />
        </label>
      </fieldset>

      <fieldset className="ship-group">
        <legend>Penerima</legend>
        <div className="ship-pair">
          <label htmlFor="recipientName">Nama penerima
            <input aria-describedby={describedBy("recipientName")} aria-invalid={Boolean(fieldError("recipientName"))} defaultValue={values.recipientName} id="recipientName" name="recipientName" required />
            <FieldError error={fieldError("recipientName")} id="recipientName-error" />
          </label>
          <label htmlFor="recipientPhone">Nomor telepon
            <input aria-describedby={describedBy("recipientPhone")} aria-invalid={Boolean(fieldError("recipientPhone"))} defaultValue={values.recipientPhone} id="recipientPhone" name="recipientPhone" required type="tel" />
            <FieldError error={fieldError("recipientPhone")} id="recipientPhone-error" />
          </label>
        </div>
        <label htmlFor="recipientAddress">Alamat penerima
          <textarea aria-describedby={describedBy("recipientAddress")} aria-invalid={Boolean(fieldError("recipientAddress"))} defaultValue={values.recipientAddress} id="recipientAddress" name="recipientAddress" required rows={3} />
          <FieldError error={fieldError("recipientAddress")} id="recipientAddress-error" />
        </label>
        <div className="ship-pair">
          <label htmlFor="destinationAreaLabel">Area tujuan
            <input aria-describedby={describedBy("destinationAreaLabel")} aria-invalid={Boolean(fieldError("destinationAreaLabel"))} defaultValue={values.destinationAreaLabel} id="destinationAreaLabel" name="destinationAreaLabel" required />
            <FieldError error={fieldError("destinationAreaLabel")} id="destinationAreaLabel-error" />
          </label>
          <label htmlFor="destinationAreaId">ID area tujuan
            <input aria-describedby={describedBy("destinationAreaId")} aria-invalid={Boolean(fieldError("destinationAreaId"))} defaultValue={values.destinationAreaId} id="destinationAreaId" name="destinationAreaId" required />
            <FieldError error={fieldError("destinationAreaId")} id="destinationAreaId-error" />
          </label>
        </div>
      </fieldset>

      <fieldset className="ship-group">
        <legend>Paket</legend>
        <label htmlFor="packageContent">Isi paket
          <input aria-describedby={describedBy("packageContent")} aria-invalid={Boolean(fieldError("packageContent"))} defaultValue={values.packageContent} id="packageContent" name="packageContent" required />
          <FieldError error={fieldError("packageContent")} id="packageContent-error" />
        </label>
        <div className="ship-pair">
          <label htmlFor="packageWeightGrams">Berat (gram)
            <input aria-describedby={describedBy("packageWeightGrams")} aria-invalid={Boolean(fieldError("packageWeightGrams"))} defaultValue={values.packageWeightGrams} id="packageWeightGrams" inputMode="numeric" name="packageWeightGrams" required type="text" />
            <FieldError error={fieldError("packageWeightGrams")} id="packageWeightGrams-error" />
          </label>
          <label htmlFor="packageQuantity">Jumlah paket
            <input aria-describedby={describedBy("packageQuantity")} aria-invalid={Boolean(fieldError("packageQuantity"))} defaultValue={values.packageQuantity ?? "1"} id="packageQuantity" min="1" name="packageQuantity" required type="number" />
            <FieldError error={fieldError("packageQuantity")} id="packageQuantity-error" />
          </label>
        </div>
        <div className="ship-dimensions">
          <label htmlFor="packageLengthCm">Panjang (cm)<input aria-describedby={describedBy("packageLengthCm")} aria-invalid={Boolean(fieldError("packageLengthCm"))} defaultValue={values.packageLengthCm} id="packageLengthCm" inputMode="numeric" name="packageLengthCm" type="text" /><FieldError error={fieldError("packageLengthCm")} id="packageLengthCm-error" /></label>
          <label htmlFor="packageWidthCm">Lebar (cm)<input aria-describedby={describedBy("packageWidthCm")} aria-invalid={Boolean(fieldError("packageWidthCm"))} defaultValue={values.packageWidthCm} id="packageWidthCm" inputMode="numeric" name="packageWidthCm" type="text" /><FieldError error={fieldError("packageWidthCm")} id="packageWidthCm-error" /></label>
          <label htmlFor="packageHeightCm">Tinggi (cm)<input aria-describedby={describedBy("packageHeightCm")} aria-invalid={Boolean(fieldError("packageHeightCm"))} defaultValue={values.packageHeightCm} id="packageHeightCm" inputMode="numeric" name="packageHeightCm" type="text" /><FieldError error={fieldError("packageHeightCm")} id="packageHeightCm-error" /></label>
        </div>
      </fieldset>

      <fieldset className="ship-group">
        <legend>Nilai dan pembayaran</legend>
        <div className="ship-pair">
          <label htmlFor="declaredValue">Nilai barang (Rp)
            <input aria-describedby={describedBy("declaredValue")} aria-invalid={Boolean(fieldError("declaredValue"))} defaultValue={values.declaredValue} id="declaredValue" inputMode="numeric" name="declaredValue" required type="text" />
            <FieldError error={fieldError("declaredValue")} id="declaredValue-error" />
          </label>
          <fieldset className="ship-payment" id="paymentType">
            <legend>Metode pembayaran</legend>
            <label><input defaultChecked={values.paymentType === "NON_COD"} name="paymentType" required type="radio" value="NON_COD" />Non-COD</label>
            <label><input defaultChecked={values.paymentType === "COD"} name="paymentType" required type="radio" value="COD" />COD</label>
            <FieldError error={fieldError("paymentType")} id="paymentType-error" />
          </fieldset>
        </div>
      </fieldset>

      <label className="ship-outlet" htmlFor="outletId">Outlet asal
        <select aria-describedby={describedBy("outletId")} aria-invalid={Boolean(fieldError("outletId"))} defaultValue={values.outletId ?? (outlets.length === 1 ? outlets[0].id : "")} id="outletId" name="outletId" required>
          <option value="">Pilih outlet</option>
          {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
        </select>
        <FieldError error={fieldError("outletId")} id="outletId-error" />
      </label>
      <SubmitButton />
    </form>
  );
}
