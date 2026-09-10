"use client";

import { AlertTriangle } from "lucide-react";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
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
import {
  DestinationAreaSelector,
  type DestinationAreaSelection,
} from "@/app/app/destination-area-selector";
import {
  invokeContactSearchFromKeyboard,
  SelectedContactProvenance,
} from "@/app/app/shipment-draft-experience";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Outlet = { id: string; name: string };

type ShipmentDraftFormProps = {
  autoFocusFirstField: boolean;
  outlets: Outlet[];
  submissionId: string;
};

type DestinationState =
  | { mode: "empty" }
  | { mode: "contact"; areaId: string; areaLabel: string }
  | ({ mode: "manual" } & DestinationAreaSelection);

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="min-h-11 sm:w-fit" disabled={pending} type="submit">
      {pending ? "Menyimpan…" : "Simpan draf"}
    </Button>
  );
}

function FieldError({ error, id }: { error?: string; id: string }) {
  return error ? <p className="text-sm leading-5 text-destructive" id={id}>{error}</p> : null;
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
  const [chosenAddress, setChosenAddress] = useState<{
    addressId: string;
    addressLabel: string;
    contactId: string;
  } | null>(null);
  const prefix = role === "SENDER" ? "sender" : "recipient";
  const partyLabel = role === "SENDER" ? "pengirim" : "penerima";
  const searchBelongsToPicker = searchState.role === undefined || searchState.role === role;
  const results = searchState.role === role ? searchState.results ?? [] : [];
  const searchError = searchBelongsToPicker ? searchState.error : undefined;
  const searchMessage = searchBelongsToPicker ? searchState.message : undefined;
  const selection = selectionState.selection?.role === role
    ? selectionState.selection
    : undefined;
  const selectedAddressLabel = selection &&
      chosenAddress?.contactId === selection.contactId &&
      chosenAddress.addressId === selection.addressId
    ? chosenAddress.addressLabel
    : undefined;
  const searchHintId = `${prefix}-contact-search-hint`;
  const searchErrorId = `${prefix}-contact-search-error`;
  const resultsId = `${prefix}-contact-results`;

  const runSearch = (form: HTMLFormElement | null) => {
    if (!form || searchPending || selectionPending) return;
    const formData = new FormData(form);
    startTransition(() => searchAction(formData));
  };

  useEffect(() => {
    if (selection) onSelect(selection);
  }, [onSelect, selection]);

  return (
    <div
      aria-busy={searchPending || selectionPending}
      aria-describedby={saveError ? `${prefix}ContactSelection-error` : undefined}
      className="grid min-w-0 gap-3 bg-muted/30 px-4 py-4"
      id={`${prefix}ContactSelection`}
      tabIndex={-1}
    >
      <label className="text-sm font-medium" htmlFor={`${prefix}ContactQuery`}>Gunakan kontak tersimpan (opsional)</label>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          aria-controls={resultsId}
          aria-describedby={searchError ? `${searchHintId} ${searchErrorId}` : searchHintId}
          aria-invalid={Boolean(searchError)}
          autoComplete="off"
          className="min-h-11"
          id={`${prefix}ContactQuery`}
          maxLength={80}
          name={`${prefix}ContactQuery`}
          onKeyDown={(event) => {
            invokeContactSearchFromKeyboard(
              {
                isComposing: event.nativeEvent.isComposing,
                key: event.key,
                preventDefault: () => event.preventDefault(),
              },
              () => runSearch(event.currentTarget.form),
            );
          }}
          placeholder={`Cari nama atau nomor ${partyLabel}`}
          type="search"
        />
        <Button
          aria-controls={resultsId}
          className="min-h-11 w-full sm:w-auto"
          disabled={searchPending || selectionPending}
          onClick={(event) => runSearch(event.currentTarget.form)}
          type="button"
          variant="outline"
        >
          {searchPending ? "Mencari…" : "Cari kontak"}
        </Button>
      </div>
      <p className="text-sm leading-5 text-muted-foreground" id={searchHintId}>
        Masukkan minimal 2 karakter. Hasil hanya menampilkan kontak aktif untuk peran ini.
      </p>
      {searchError ? (
        <p className="text-sm leading-5 text-destructive" id={searchErrorId} role="alert">{searchError}</p>
      ) : null}
      {searchMessage ? <p className="text-sm leading-5 text-muted-foreground" role="status">{searchMessage}</p> : null}
      {results.length > 0 ? (
        <>
          <p className="text-sm leading-5 text-muted-foreground" id={`${resultsId}-label`}>
            Pilih alamat kontak untuk menyalin data ke isian {partyLabel}.
          </p>
          <ul
            aria-labelledby={`${resultsId}-label`}
            className="grid list-none gap-2 p-0"
            id={resultsId}
          >
            {results.map((result) => (
              <li key={`${result.contactId}:${result.addressId}`}>
                <Button
                  className="h-auto min-h-11 w-full min-w-0 flex-col items-stretch justify-start gap-1 whitespace-normal px-3 py-2 text-left sm:flex-row sm:items-center"
                  disabled={searchPending || selectionPending}
                  onClick={() => {
                    const formData = new FormData();
                    formData.set("contactSelection", `${role}:${result.contactId}:${result.addressId}`);
                    setChosenAddress({
                      addressId: result.addressId,
                      addressLabel: result.addressLabel,
                      contactId: result.contactId,
                    });
                    startTransition(() => selectionAction(formData));
                  }}
                  type="button"
                  variant="outline"
                >
                  <span className="grid min-w-0 gap-0.5 wrap-anywhere">
                    <strong>{result.name}</strong>
                    {" · "}
                    {result.phoneMasked}
                  </span>
                  <span className="block text-sm font-normal leading-5 text-muted-foreground">
                    {result.addressLabel}
                    {" · "}
                    {result.destinationAreaLabel ?? "Area belum disimpan"}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {selectionState.error ? (
        <p className="text-sm leading-5 text-destructive" role="alert">{selectionState.error}</p>
      ) : null}
      {selection ? (
        <>
          <input name={`${prefix}ContactId`} type="hidden" value={selection.contactId} />
          <input name={`${prefix}ContactAddressId`} type="hidden" value={selection.addressId} />
          <input name={`${prefix}ContactUpdatedAt`} type="hidden" value={selection.contactUpdatedAt} />
          <input name={`${prefix}ContactAddressUpdatedAt`} type="hidden" value={selection.addressUpdatedAt} />
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
          <SelectedContactProvenance
            addressLabel={selectedAddressLabel}
            partyLabel={partyLabel}
            selection={selection}
          />
        </>
      ) : null}
      <FieldError error={saveError} id={`${prefix}ContactSelection-error`} />
    </div>
  );
}

export function ShipmentDraftForm({ autoFocusFirstField, outlets, submissionId }: ShipmentDraftFormProps) {
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
  const [selectedOutletId, setSelectedOutletId] = useState(
    values.outletId ?? (outlets.length === 1 ? outlets[0].id : ""),
  );
  const [destination, setDestination] = useState<DestinationState>({ mode: "empty" });
  const [destinationRevision, setDestinationRevision] = useState(0);
  const [destinationEditedAfterSubmit, setDestinationEditedAfterSubmit] = useState(true);
  const [destinationResetMessage, setDestinationResetMessage] = useState("");
  const destinationRejected = Boolean(
    fieldError("destinationAreaLabel") ||
      fieldError("destinationAreaId") ||
      (destination.mode === "contact" && fieldError("recipientContactSelection")),
  ) && !destinationEditedAfterSubmit;
  const effectiveDestination: DestinationState = destinationRejected
    ? { mode: "empty" }
    : destination;
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

    setDestination(selection.destinationAreaId && selection.destinationAreaLabel
      ? {
          mode: "contact",
          areaId: selection.destinationAreaId,
          areaLabel: selection.destinationAreaLabel,
        }
      : { mode: "empty" });
    setDestinationRevision((revision) => revision + 1);
    setDestinationEditedAfterSubmit(true);
    setDestinationResetMessage("");
  }, [
    setDestination,
    setDestinationEditedAfterSubmit,
    setDestinationResetMessage,
    setDestinationRevision,
  ]);
  useEffect(() => {
    if (state.errors) errorSummaryRef.current?.focus();
  }, [state]);

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="grid gap-6 pb-8"
      id="form-kiriman"
      noValidate
      onSubmit={() => setDestinationEditedAfterSubmit(false)}
      ref={formRef}
    >
      <input name="submissionId" type="hidden" value={submissionId} />
      <input name="destinationMode" type="hidden" value={effectiveDestination.mode} />
      <input
        name="destinationAreaId"
        type="hidden"
        value={effectiveDestination.mode === "empty" ? "" : effectiveDestination.areaId}
      />
      <input
        name="destinationAreaLabel"
        type="hidden"
        value={effectiveDestination.mode === "empty" ? "" : effectiveDestination.areaLabel}
      />
      {errorEntries.length > 0 ? (
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring" id="shipment-draft-errors" ref={errorSummaryRef} role="alert" tabIndex={-1}>
          <h2 className="font-medium">Periksa {errorEntries.length} isian berikut</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {errorEntries.map(([field, message]) => (
              <li key={field}>
                <a href={field === "form" ? "#shipment-draft-errors" : field.startsWith("destinationArea") ? "#areaLabel" : `#${field}`}>{message}</a>
              </li>
            ))}
          </ul>
          {state.duplicateDetected && (
            <div className="mt-4 rounded-md border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-3 text-foreground">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-[var(--warn)] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-[var(--warn)]">
                    Peringatan Pesanan Serupa (Double Order Check)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Nomor telepon penerima ini sudah memiliki pesanan dalam 7 hari terakhir. Untuk menghindari pengiriman ganda yang merugikan ongkir, centang konfirmasi di bawah jika Anda yakin ingin tetap memprosesnya.
                  </p>
                  <label className="flex items-center gap-2.5 cursor-pointer pt-1 text-sm font-medium" htmlFor="confirmDuplicate">
                    <input
                      type="checkbox"
                      id="confirmDuplicate"
                      name="confirmDuplicate"
                      value="true"
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span>Saya yakin ini bukan pesanan duplikat, tetap buat kiriman ini.</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <div className="grid gap-2 rounded-lg border bg-card p-4 text-sm font-medium sm:p-5">
        <label htmlFor="outletId">Outlet asal</label>
        <Select
          onValueChange={(value) => {
            setSelectedOutletId(value);
            setDestination({ mode: "empty" });
            setDestinationRevision((revision) => revision + 1);
            setDestinationEditedAfterSubmit(true);
            setDestinationResetMessage(
              "Outlet berubah. Area tujuan sebelumnya dihapus; pilih ulang area untuk outlet ini.",
            );
          }}
          value={selectedOutletId}
        >
          <SelectTrigger
            aria-describedby={describedBy("outletId")}
            aria-invalid={Boolean(fieldError("outletId"))}
            className="min-h-11 w-full"
            id="outletId"
          >
            <SelectValue placeholder="Pilih outlet" />
          </SelectTrigger>
          <SelectContent>
            {outlets.map((outlet) => <SelectItem key={outlet.id} value={outlet.id}>{outlet.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <input name="outletId" type="hidden" value={selectedOutletId} />
        <FieldError error={fieldError("outletId")} id="outletId-error" />
        <p className="font-normal text-muted-foreground">Outlet menentukan akun Mengantar untuk pencarian area dan estimasi.</p>
        <p aria-live="polite" className="font-normal text-muted-foreground" role="status">
          {destinationResetMessage}
        </p>
      </div>

      <fieldset className="grid gap-5 rounded-lg border bg-card p-4 sm:p-5">
        <legend className="px-1 text-base font-medium">Pengirim</legend>
        <ContactPicker
          onSelect={applySenderSelection}
          role="SENDER"
          saveError={fieldError("senderContactSelection")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium" htmlFor="senderName">Nama pengirim
            <Input className="min-h-11" aria-describedby={describedBy("senderName")} aria-invalid={Boolean(fieldError("senderName"))} autoFocus={autoFocusFirstField && !state.errors} defaultValue={values.senderName} id="senderName" name="senderName" required />
            <FieldError error={fieldError("senderName")} id="senderName-error" />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="senderPhone">Nomor telepon
            <Input className="min-h-11" aria-describedby={describedBy("senderPhone")} aria-invalid={Boolean(fieldError("senderPhone"))} defaultValue={values.senderPhone} id="senderPhone" name="senderPhone" required type="tel" />
            <FieldError error={fieldError("senderPhone")} id="senderPhone-error" />
          </label>
        </div>
        <label className="grid gap-2 text-sm font-medium" htmlFor="senderAddress">Alamat pengirim
          <Textarea aria-describedby={describedBy("senderAddress")} aria-invalid={Boolean(fieldError("senderAddress"))} defaultValue={values.senderAddress} id="senderAddress" name="senderAddress" required rows={3} />
          <FieldError error={fieldError("senderAddress")} id="senderAddress-error" />
        </label>
      </fieldset>

      <fieldset className="grid gap-5 rounded-lg border bg-card p-4 sm:p-5">
        <legend className="px-1 text-base font-medium">Penerima</legend>
        <ContactPicker
          onSelect={applyRecipientSelection}
          role="RECIPIENT"
          saveError={fieldError("recipientContactSelection")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium" htmlFor="recipientName">Nama penerima
            <Input className="min-h-11" aria-describedby={describedBy("recipientName")} aria-invalid={Boolean(fieldError("recipientName"))} defaultValue={values.recipientName} id="recipientName" name="recipientName" required />
            <FieldError error={fieldError("recipientName")} id="recipientName-error" />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="recipientPhone">Nomor telepon
            <Input className="min-h-11" aria-describedby={describedBy("recipientPhone")} aria-invalid={Boolean(fieldError("recipientPhone"))} defaultValue={values.recipientPhone} id="recipientPhone" name="recipientPhone" required type="tel" />
            <FieldError error={fieldError("recipientPhone")} id="recipientPhone-error" />
          </label>
        </div>
        <label className="grid gap-2 text-sm font-medium" htmlFor="recipientAddress">Alamat penerima
          <Textarea aria-describedby={describedBy("recipientAddress")} aria-invalid={Boolean(fieldError("recipientAddress"))} defaultValue={values.recipientAddress} id="recipientAddress" name="recipientAddress" required rows={3} />
          <FieldError error={fieldError("recipientAddress")} id="recipientAddress-error" />
        </label>
        {selectedOutletId ? (
          <DestinationAreaSelector
            defaultArea={effectiveDestination.mode === "contact"
              ? { areaId: effectiveDestination.areaId, areaLabel: effectiveDestination.areaLabel }
              : null}
            defaultQuery={destinationRejected && destination.mode === "manual"
              ? { outletId: destination.outletId, query: destination.query }
              : null}
            defaultSelection={effectiveDestination.mode === "manual" ? effectiveDestination : null}
            error={fieldError("destinationAreaLabel") ?? fieldError("destinationAreaId")}
            fixedOutletId={selectedOutletId}
            key={`${selectedOutletId}:${destinationRevision}:${destinationRejected ? "rejected" : "ready"}`}
            onSelectionChange={(selection) => {
              setDestination(selection
                ? { mode: "manual", ...selection }
                : { mode: "empty" });
              setDestinationEditedAfterSubmit(true);
              setDestinationResetMessage("");
            }}
            outlets={outlets}
            required
          />
        ) : (
          <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground" role="status">Pilih outlet asal sebelum mencari area tujuan.</p>
        )}
      </fieldset>

      <fieldset className="grid gap-5 rounded-lg border bg-card p-4 sm:p-5">
        <legend className="px-1 text-base font-medium">Paket</legend>
        <label className="grid gap-2 text-sm font-medium" htmlFor="packageContent">Isi paket
          <Input className="min-h-11" aria-describedby={describedBy("packageContent")} aria-invalid={Boolean(fieldError("packageContent"))} defaultValue={values.packageContent} id="packageContent" name="packageContent" required />
          <FieldError error={fieldError("packageContent")} id="packageContent-error" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium" htmlFor="packageWeightGrams">Berat (gram)
            <Input className="min-h-11" aria-describedby={describedBy("packageWeightGrams")} aria-invalid={Boolean(fieldError("packageWeightGrams"))} defaultValue={values.packageWeightGrams} id="packageWeightGrams" inputMode="numeric" name="packageWeightGrams" required type="text" />
            <FieldError error={fieldError("packageWeightGrams")} id="packageWeightGrams-error" />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="packageQuantity">Jumlah paket
            <Input className="min-h-11" aria-describedby={describedBy("packageQuantity")} aria-invalid={Boolean(fieldError("packageQuantity"))} defaultValue={values.packageQuantity ?? "1"} id="packageQuantity" min="1" name="packageQuantity" required type="number" />
            <FieldError error={fieldError("packageQuantity")} id="packageQuantity-error" />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium" htmlFor="packageLengthCm">Panjang (cm)<Input className="min-h-11" aria-describedby={describedBy("packageLengthCm")} aria-invalid={Boolean(fieldError("packageLengthCm"))} defaultValue={values.packageLengthCm} id="packageLengthCm" inputMode="numeric" name="packageLengthCm" type="text" /><FieldError error={fieldError("packageLengthCm")} id="packageLengthCm-error" /></label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="packageWidthCm">Lebar (cm)<Input className="min-h-11" aria-describedby={describedBy("packageWidthCm")} aria-invalid={Boolean(fieldError("packageWidthCm"))} defaultValue={values.packageWidthCm} id="packageWidthCm" inputMode="numeric" name="packageWidthCm" type="text" /><FieldError error={fieldError("packageWidthCm")} id="packageWidthCm-error" /></label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="packageHeightCm">Tinggi (cm)<Input className="min-h-11" aria-describedby={describedBy("packageHeightCm")} aria-invalid={Boolean(fieldError("packageHeightCm"))} defaultValue={values.packageHeightCm} id="packageHeightCm" inputMode="numeric" name="packageHeightCm" type="text" /><FieldError error={fieldError("packageHeightCm")} id="packageHeightCm-error" /></label>
        </div>
      </fieldset>

      <fieldset className="grid gap-5 rounded-lg border bg-card p-4 sm:p-5">
        <legend className="px-1 text-base font-medium">Nilai dan pembayaran</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium" htmlFor="declaredValue">Nilai barang (Rp)
            <Input className="min-h-11" aria-describedby={describedBy("declaredValue")} aria-invalid={Boolean(fieldError("declaredValue"))} defaultValue={values.declaredValue} id="declaredValue" inputMode="numeric" name="declaredValue" required type="text" />
            <FieldError error={fieldError("declaredValue")} id="declaredValue-error" />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="cogsAmount">
            <span>Modal HPP / COGS (Rp) <span className="font-normal text-muted-foreground">(Opsional)</span></span>
            <Input className="min-h-11" aria-describedby="cogsAmount-hint cogsAmount-error" aria-invalid={Boolean(fieldError("cogsAmount"))} defaultValue={values.cogsAmount} id="cogsAmount" inputMode="numeric" name="cogsAmount" placeholder="Contoh: 50.000" type="text" />
            <span className="text-xs text-muted-foreground font-normal" id="cogsAmount-hint">
              Digunakan untuk kalkulasi estimasi laba bersih (Net Margin) di menu Analitik.
            </span>
            <FieldError error={fieldError("cogsAmount")} id="cogsAmount-error" />
          </label>
          <fieldset
            aria-describedby={describedBy("paymentType")}
            aria-invalid={Boolean(fieldError("paymentType"))}
            className="sm:col-span-2 grid gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="paymentType"
            tabIndex={-1}
          >
            <legend className="mb-1 text-sm font-medium">Metode pembayaran</legend>
            <RadioGroup className="grid sm:grid-cols-2 gap-3" defaultValue={values.paymentType === "COD" ? "COD" : "NON_COD"} name="paymentType" required>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 text-sm font-normal hover:bg-muted/50 transition-colors"><RadioGroupItem value="NON_COD" />Non-COD (Ongkir dibayar pengirim)</label>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 text-sm font-normal hover:bg-muted/50 transition-colors"><RadioGroupItem value="COD" />COD (Bayar di tempat oleh penerima)</label>
            </RadioGroup>
            <FieldError error={fieldError("paymentType")} id="paymentType-error" />
          </fieldset>
        </div>
      </fieldset>

      <SubmitButton />
    </form>
  );
}
