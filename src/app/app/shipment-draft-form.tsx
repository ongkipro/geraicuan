"use client";

import { AlertTriangle, CircleAlert } from "lucide-react";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
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
    <Button className="min-h-11 max-md:w-full md:min-h-8" disabled={pending} type="submit">
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
      className="grid min-w-0 gap-3 rounded-lg border border-dashed bg-muted/30 p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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

  const inputField = (
    field: string,
    label: ReactNode,
    input: Omit<ComponentProps<typeof Input>, "aria-describedby" | "aria-invalid" | "id" | "name">,
    options: { className?: string; hint?: ReactNode } = {},
  ) => (
    <Field className={options.className} data-invalid={Boolean(fieldError(field))}>
      <FieldLabel htmlFor={field}>{label}</FieldLabel>
      <Input
        aria-describedby={options.hint ? `${field}-hint ${field}-error` : describedBy(field)}
        aria-invalid={Boolean(fieldError(field))}
        className="min-h-11 md:min-h-8"
        id={field}
        name={field}
        {...input}
      />
      {options.hint ? <FieldDescription id={`${field}-hint`}>{options.hint}</FieldDescription> : null}
      <FieldError error={fieldError(field)} id={`${field}-error`} />
    </Field>
  );
  const addressField = (field: string, label: string) => (
    <Field data-invalid={Boolean(fieldError(field))}>
      <FieldLabel htmlFor={field}>{label}</FieldLabel>
      <Textarea aria-describedby={describedBy(field)} aria-invalid={Boolean(fieldError(field))} defaultValue={values[field as keyof typeof values]} id={field} name={field} required rows={3} />
      <FieldError error={fieldError(field)} id={`${field}-error`} />
    </Field>
  );

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
        <section className="grid gap-3 rounded-lg border border-destructive/40 bg-card p-4 text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring/50" id="shipment-draft-errors" ref={errorSummaryRef} role="alert" tabIndex={-1}>
          <h2 className="flex items-center gap-2 font-medium"><CircleAlert aria-hidden="true" className="size-4 shrink-0" />Periksa {errorEntries.length} isian berikut</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {errorEntries.map(([field, message]) => (
              <li key={field}>
                <a className="underline underline-offset-4" href={field === "form" ? "#shipment-draft-errors" : field.startsWith("destinationArea") ? "#areaLabel" : `#${field}`}>{message}</a>
              </li>
            ))}
          </ul>
          {state.duplicateDetected && (
            <div className="rounded-md border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-3 text-foreground">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--warn)]" aria-hidden="true" />
                <div className="grid gap-2">
                  <p className="text-sm font-semibold text-[var(--warn)]">
                    Peringatan Pesanan Serupa (Double Order Check)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Nomor telepon penerima ini sudah memiliki pesanan dalam 7 hari terakhir. Untuk menghindari pengiriman ganda yang merugikan ongkir, centang konfirmasi di bawah jika Anda yakin ingin tetap memprosesnya.
                  </p>
                  <Field className="items-start" orientation="horizontal">
                    <Checkbox className="mt-0.5" id="confirmDuplicate" name="confirmDuplicate" value="true" />
                    <FieldLabel className="leading-5" htmlFor="confirmDuplicate">Saya yakin ini bukan pesanan duplikat, tetap buat kiriman ini.</FieldLabel>
                  </Field>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <Card>
        <CardContent>
          <Field data-invalid={Boolean(fieldError("outletId"))}>
            <FieldLabel htmlFor="outletId">Outlet asal</FieldLabel>
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
                className="min-h-11 w-full md:min-h-8"
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
            <FieldDescription>Outlet menentukan akun Mengantar untuk pencarian area dan estimasi.</FieldDescription>
            <p aria-live="polite" className="text-sm text-muted-foreground empty:hidden" role="status">
              {destinationResetMessage}
            </p>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle id="draft-sender-heading">Pengirim</CardTitle>
          <CardDescription>Pilih kontak tersimpan atau isi data pengirim secara manual.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldSet aria-labelledby="draft-sender-heading" className="min-w-0 gap-5">
            <ContactPicker
              onSelect={applySenderSelection}
              role="SENDER"
              saveError={fieldError("senderContactSelection")}
            />
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              {inputField("senderName", "Nama pengirim", { autoFocus: autoFocusFirstField && !state.errors, defaultValue: values.senderName, required: true })}
              {inputField("senderPhone", "Nomor telepon", { defaultValue: values.senderPhone, required: true, type: "tel" })}
            </FieldGroup>
            {addressField("senderAddress", "Alamat pengirim")}
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle id="draft-recipient-heading">Penerima</CardTitle>
          <CardDescription>Pilih kontak tersimpan atau isi data penerima dan area tujuan secara manual.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldSet aria-labelledby="draft-recipient-heading" className="min-w-0 gap-5">
            <ContactPicker
              onSelect={applyRecipientSelection}
              role="RECIPIENT"
              saveError={fieldError("recipientContactSelection")}
            />
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              {inputField("recipientName", "Nama penerima", { defaultValue: values.recipientName, required: true })}
              {inputField("recipientPhone", "Nomor telepon", { defaultValue: values.recipientPhone, required: true, type: "tel" })}
            </FieldGroup>
            {addressField("recipientAddress", "Alamat penerima")}
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
              <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground" role="status">Pilih outlet asal sebelum mencari area tujuan.</p>
            )}
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle id="draft-package-heading">Paket</CardTitle>
          <CardDescription>Dimensi bersifat opsional; isi ketiganya bila digunakan.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldSet aria-labelledby="draft-package-heading" className="min-w-0 gap-5">
            {inputField("packageContent", "Isi paket", { defaultValue: values.packageContent, required: true })}
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              {inputField("packageWeightGrams", "Berat (gram)", { defaultValue: values.packageWeightGrams, inputMode: "numeric", required: true, type: "text" })}
              {inputField("packageQuantity", "Jumlah paket", { defaultValue: values.packageQuantity ?? "1", min: "1", required: true, type: "number" })}
            </FieldGroup>
            <FieldGroup className="grid gap-5 sm:grid-cols-3">
              {inputField("packageLengthCm", "Panjang (cm)", { defaultValue: values.packageLengthCm, inputMode: "numeric", type: "text" })}
              {inputField("packageWidthCm", "Lebar (cm)", { defaultValue: values.packageWidthCm, inputMode: "numeric", type: "text" })}
              {inputField("packageHeightCm", "Tinggi (cm)", { defaultValue: values.packageHeightCm, inputMode: "numeric", type: "text" })}
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle id="draft-payment-heading">Nilai dan pembayaran</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldSet aria-labelledby="draft-payment-heading" className="min-w-0 gap-5">
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              {inputField("declaredValue", "Nilai barang (Rp)", { defaultValue: values.declaredValue, inputMode: "numeric", required: true, type: "text" })}
              {inputField(
                "cogsAmount",
                <span>Modal HPP / COGS (Rp) <span className="font-normal text-muted-foreground">(Opsional)</span></span>,
                { defaultValue: values.cogsAmount, inputMode: "numeric", placeholder: "Contoh: 50.000", type: "text" },
                { hint: "Digunakan untuk kalkulasi estimasi laba bersih (Net Margin) di menu Analitik." },
              )}
            </FieldGroup>
            <fieldset
              aria-describedby={describedBy("paymentType")}
              aria-invalid={Boolean(fieldError("paymentType"))}
              className="grid gap-3 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              id="paymentType"
              tabIndex={-1}
            >
              <legend className="mb-1 text-sm font-medium">Metode pembayaran</legend>
              <RadioGroup className="grid gap-3 sm:grid-cols-2" defaultValue={values.paymentType === "COD" ? "COD" : "NON_COD"} name="paymentType" required>
                <FieldLabel className="min-h-11 w-full cursor-pointer items-center rounded-lg border px-4 py-2 font-normal" htmlFor="paymentType-non-cod"><RadioGroupItem id="paymentType-non-cod" value="NON_COD" />Non-COD (Ongkir dibayar pengirim)</FieldLabel>
                <FieldLabel className="min-h-11 w-full cursor-pointer items-center rounded-lg border px-4 py-2 font-normal" htmlFor="paymentType-cod"><RadioGroupItem id="paymentType-cod" value="COD" />COD (Bayar di tempat oleh penerima)</FieldLabel>
              </RadioGroup>
              <FieldError error={fieldError("paymentType")} id="paymentType-error" />
            </fieldset>
          </FieldSet>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Menyimpan draf belum membuat pesanan ke penyedia.</p>
        <SubmitButton />
      </div>
    </form>
  );
}
