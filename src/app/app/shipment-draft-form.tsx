"use client";

import { useActionState, useCallback, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  saveShipmentDraft,
  searchRecipientShipmentContacts,
  searchSenderShipmentContacts,
  selectShipmentContact,
  type ShipmentContactRole,
  type ShipmentContactSearchActionState,
  type ShipmentContactSelection,
  type ShipmentContactSelectionActionState,
  type ShipmentDraftActionState,
} from "@/app/app/actions";

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

function setFormField(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    field.value = value;
  }
}

type ContactPickerProps = {
  onSelect: (selection: ShipmentContactSelection) => void;
  role: ShipmentContactRole;
  saveError?: string;
};

function ContactPicker({ onSelect, role, saveError }: ContactPickerProps) {
  const searchServerAction = role === "SENDER"
    ? searchSenderShipmentContacts
    : searchRecipientShipmentContacts;
  const [searchState, searchAction, searchPending] = useActionState<
    ShipmentContactSearchActionState,
    FormData
  >(searchServerAction, {});
  const [selectionState, selectionAction, selectionPending] = useActionState<
    ShipmentContactSelectionActionState,
    FormData
  >(selectShipmentContact, {});
  const prefix = role === "SENDER" ? "sender" : "recipient";
  const partyLabel = role === "SENDER" ? "pengirim" : "penerima";
  const searchBelongsToPicker = searchState.role === undefined || searchState.role === role;
  const results = searchState.role === role ? searchState.results ?? [] : [];
  const searchError = searchBelongsToPicker ? searchState.error : undefined;
  const searchMessage = searchBelongsToPicker ? searchState.message : undefined;
  const selection = selectionState.selection?.role === role
    ? selectionState.selection
    : undefined;
  const searchHintId = `${prefix}-contact-search-hint`;
  const searchErrorId = `${prefix}-contact-search-error`;
  const resultsId = `${prefix}-contact-results`;

  useEffect(() => {
    if (selection) onSelect(selection);
  }, [onSelect, selection]);

  return (
    <div
      aria-busy={searchPending || selectionPending}
      aria-describedby={saveError ? `${prefix}ContactSelection-error` : undefined}
      className="ship-payment"
      id={`${prefix}ContactSelection`}
      tabIndex={-1}
    >
      <label htmlFor={`${prefix}ContactQuery`}>Gunakan kontak tersimpan (opsional)</label>
      <div className="ship-pair">
        <input
          aria-controls={resultsId}
          aria-describedby={searchError ? `${searchHintId} ${searchErrorId}` : searchHintId}
          aria-invalid={Boolean(searchError)}
          autoComplete="off"
          id={`${prefix}ContactQuery`}
          maxLength={80}
          name={`${prefix}ContactQuery`}
          placeholder={`Cari nama atau nomor ${partyLabel}`}
          type="search"
        />
        <button
          aria-controls={resultsId}
          className="sales-secondary"
          disabled={searchPending || selectionPending}
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (form) searchAction(new FormData(form));
          }}
          type="button"
        >
          {searchPending ? "Mencari…" : "Cari kontak"}
        </button>
      </div>
      <p className="bulk-hint" id={searchHintId}>
        Masukkan minimal 2 karakter. Hasil hanya menampilkan kontak aktif untuk peran ini.
      </p>
      {searchError ? (
        <p className="ship-field-error" id={searchErrorId} role="alert">{searchError}</p>
      ) : null}
      {searchMessage ? <p className="bulk-hint" role="status">{searchMessage}</p> : null}
      {results.length > 0 ? (
        <>
          <p className="bulk-hint" id={`${resultsId}-label`}>
            Pilih alamat kontak untuk menyalin data ke isian {partyLabel}.
          </p>
          <ul
            aria-labelledby={`${resultsId}-label`}
            className="contact-addresses"
            id={resultsId}
          >
            {results.map((result) => (
              <li key={`${result.contactId}:${result.addressId}`}>
                <button
                  className="sales-secondary"
                  disabled={searchPending || selectionPending}
                  onClick={() => {
                    const formData = new FormData();
                    formData.set("contactSelection", `${role}:${result.contactId}:${result.addressId}`);
                    selectionAction(formData);
                  }}
                  type="button"
                >
                  <strong>{result.name}</strong>
                  {" · "}
                  {result.phoneMasked}
                  {" · "}
                  {result.addressLabel}
                  {" · "}
                  {result.destinationAreaLabel ?? "Area belum disimpan"}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {selectionState.error ? (
        <p className="ship-field-error" role="alert">{selectionState.error}</p>
      ) : null}
      {selection ? (
        <>
          <input name={`${prefix}ContactId`} type="hidden" value={selection.contactId} />
          <input name={`${prefix}ContactAddressId`} type="hidden" value={selection.addressId} />
          <input name={`${prefix}ContactSnapshotName`} type="hidden" value={selection.name} />
          <input name={`${prefix}ContactSnapshotPhone`} type="hidden" value={selection.phone} />
          <input name={`${prefix}ContactSnapshotAddress`} type="hidden" value={selection.address} />
          <input
            name={`${prefix}ContactSnapshotDestinationAreaId`}
            type="hidden"
            value={selection.destinationAreaId ?? ""}
          />
          <input
            name={`${prefix}ContactSnapshotDestinationAreaLabel`}
            type="hidden"
            value={selection.destinationAreaLabel ?? ""}
          />
          <p className="bulk-hint" role="status">
            Kontak diterapkan. Isian manual tetap dapat diubah.
          </p>
        </>
      ) : null}
      <FieldError error={saveError} id={`${prefix}ContactSelection-error`} />
    </div>
  );
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
  const formRef = useRef<HTMLFormElement>(null);
  const recipientAreaSelectionRef = useRef<{ id: string; label: string } | null>(null);
  const applySenderSelection = useCallback((selection: ShipmentContactSelection) => {
    const form = formRef.current;
    if (!form) return;
    setFormField(form, "senderName", selection.name);
    setFormField(form, "senderPhone", selection.phone);
    setFormField(form, "senderAddress", selection.address);
  }, []);
  const applyRecipientSelection = useCallback((selection: ShipmentContactSelection) => {
    const form = formRef.current;
    if (!form) return;
    setFormField(form, "recipientName", selection.name);
    setFormField(form, "recipientPhone", selection.phone);
    setFormField(form, "recipientAddress", selection.address);

    if (!selection.destinationAreaId || !selection.destinationAreaLabel) return;
    const areaIdField = form.elements.namedItem("destinationAreaId");
    const areaLabelField = form.elements.namedItem("destinationAreaLabel");
    if (
      !(areaIdField instanceof HTMLInputElement) ||
      !(areaLabelField instanceof HTMLInputElement)
    ) {
      return;
    }
    const previousSelection = recipientAreaSelectionRef.current;
    const targetIsBlank = areaIdField.value.trim() === "" && areaLabelField.value.trim() === "";
    const targetWasSelectionSet = previousSelection !== null &&
      areaIdField.value === previousSelection.id &&
      areaLabelField.value === previousSelection.label;
    if (targetIsBlank || targetWasSelectionSet) {
      areaIdField.value = selection.destinationAreaId;
      areaLabelField.value = selection.destinationAreaLabel;
      recipientAreaSelectionRef.current = {
        id: selection.destinationAreaId,
        label: selection.destinationAreaLabel,
      };
    } else {
      recipientAreaSelectionRef.current = null;
    }
  }, []);
  useEffect(() => {
    if (state.errors) errorSummaryRef.current?.focus();
  }, [state]);

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="ship-form"
      id="form-kiriman"
      ref={formRef}
    >
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
        <ContactPicker
          onSelect={applySenderSelection}
          role="SENDER"
          saveError={fieldError("senderContactSelection")}
        />
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
        <ContactPicker
          onSelect={applyRecipientSelection}
          role="RECIPIENT"
          saveError={fieldError("recipientContactSelection")}
        />
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
            <input aria-describedby={describedBy("destinationAreaLabel")} aria-invalid={Boolean(fieldError("destinationAreaLabel"))} defaultValue={values.destinationAreaLabel} id="destinationAreaLabel" name="destinationAreaLabel" onChange={() => { recipientAreaSelectionRef.current = null; }} required />
            <FieldError error={fieldError("destinationAreaLabel")} id="destinationAreaLabel-error" />
          </label>
          <label htmlFor="destinationAreaId">ID area tujuan
            <input aria-describedby={describedBy("destinationAreaId")} aria-invalid={Boolean(fieldError("destinationAreaId"))} defaultValue={values.destinationAreaId} id="destinationAreaId" name="destinationAreaId" onChange={() => { recipientAreaSelectionRef.current = null; }} required />
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
