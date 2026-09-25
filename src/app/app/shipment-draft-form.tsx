"use client";

import { AlertTriangle, CircleAlert, ClipboardList, MapPin, MapPinHouse, Package as PackageIcon, UserRound, Wallet, Warehouse } from "lucide-react";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import {
  saveShipmentDraft,
  searchRecipientShipmentContacts,
  searchSenderShipmentContacts,
  selectShipmentContact,
  type ShipmentContactRole,
  type ShipmentContactSearchResult,
  type ShipmentContactSelection,
  type ShipmentContactSelectionActionState,
  type ShipmentDraftActionState,
} from "@/app/app/actions";
import {
  DestinationAreaSelector,
  type DestinationAreaSelection,
} from "@/app/app/destination-area-selector";
import { SelectedContactProvenance } from "@/app/app/shipment-draft-experience";
import { SearchCombobox, type TypeaheadOutcome } from "@/components/cms/search-combobox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cardBandClassName, fieldWidth, FieldRow } from "@/components/cms/cms-layouts";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldSet, FieldTitle } from "@/components/ui/field";
import { CharacterClassInput, CharacterClassTextarea } from "@/components/ui/character-class-input";
import { partyNameClass } from "@/lib/field-character-classes";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { isPaymentMethod, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-method";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type OutletPickupPoint = {
  pickupAddressId: string;
  pickupAddressLabel: string;
  originAreaLabel: string;
  isDefault: boolean;
};

type Outlet = { id: string; name: string; pickupPoints: OutletPickupPoint[] };

type ShipmentDraftFormProps = {
  autoFocusFirstField: boolean;
  outlets: Outlet[];
  submissionId: string;
};

type DestinationState =
  | { mode: "empty" }
  | { mode: "contact"; areaId: string; areaLabel: string }
  | ({ mode: "manual" } & DestinationAreaSelection);

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
  const queryField = `${prefix}ContactQuery`;
  const selection = selectionState.selection?.role === role
    ? selectionState.selection
    : undefined;
  const selectedAddressLabel = selection &&
      chosenAddress?.contactId === selection.contactId &&
      chosenAddress.addressId === selection.addressId
    ? chosenAddress.addressLabel
    : undefined;
  const searchHintId = `${prefix}-contact-search-hint`;

  useEffect(() => {
    if (selection) onSelect(selection);
  }, [onSelect, selection]);

  async function searchContacts(query: string): Promise<TypeaheadOutcome<ShipmentContactSearchResult>> {
    const formData = new FormData();
    formData.set(queryField, query);
    const result = await searchServerAction({}, formData);
    return {
      error: result.error,
      items: result.results ?? [],
      message: result.message,
      success: !result.error,
    };
  }

  return (
    <div
      aria-busy={selectionPending}
      aria-describedby={saveError ? `${prefix}ContactSelection-error` : undefined}
      className="grid min-w-0 gap-3 rounded-lg border border-dashed bg-muted/30 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      id={`${prefix}ContactSelection`}
      tabIndex={-1}
    >
      <label className="text-sm font-medium" htmlFor={queryField}>Gunakan kontak tersimpan (opsional)</label>
      <SearchCombobox<ShipmentContactSearchResult>
        ariaDescribedBy={searchHintId}
        cacheScope={role}
        checkedId={selection ? `${selection.contactId}:${selection.addressId}` : null}
        disabled={selectionPending}
        id={queryField}
        itemId={(result) => `${result.contactId}:${result.addressId}`}
        itemValue={(result) => `${result.name} ${result.phone} ${result.addressLabel}`}
        listAriaLabel={`Cari kontak ${partyLabel}`}
        minLength={3}
        onSelect={(result) => {
          const formData = new FormData();
          formData.set("contactSelection", `${role}:${result.contactId}:${result.addressId}`);
          setChosenAddress({
            addressId: result.addressId,
            addressLabel: result.addressLabel,
            contactId: result.contactId,
          });
          startTransition(() => selectionAction(formData));
        }}
        placeholder={`Cari nama atau nomor ${partyLabel}`}
        renderItem={(result) => (
          <span className="grid min-w-0 flex-1 gap-0.5 wrap-anywhere">
            <strong>{result.name}</strong>
            <span className="text-xs font-normal tabular-nums text-muted-foreground">{result.phone}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {result.addressLabel}
              {" · "}
              {result.destinationAreaLabel ?? "Area belum disimpan"}
            </span>
          </span>
        )}
        search={searchContacts}
        searchPlaceholder={`Cari nama atau nomor ${partyLabel}`}
        triggerContent={selection ? <>Kontak terpilih: {selection.name}</> : null}
      />
      <p className="max-w-2xl text-sm leading-5 text-muted-foreground" id={searchHintId}>
        Ketik minimal 3 karakter. Hasil hanya menampilkan kontak aktif untuk peran ini.
      </p>
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
  const [pickupAddressId, setPickupAddressId] = useState<string>("");
  const [destination, setDestination] = useState<DestinationState>({ mode: "empty" });
  const [destinationRevision, setDestinationRevision] = useState(0);
  const pickupPoints = outlets.find((outlet) => outlet.id === selectedOutletId)?.pickupPoints ?? [];
  // The outlet default stands until the operator picks another point, and a
  // stale choice from a previously selected outlet never survives.
  const effectivePickup = pickupPoints.find((point) => point.pickupAddressId === pickupAddressId)
    ?? pickupPoints.find((point) => point.isDefault)
    ?? null;
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
    input: Omit<ComponentProps<typeof CharacterClassInput>, "aria-describedby" | "aria-invalid" | "id" | "name">,
    options: { className?: string; hint?: ReactNode } = {},
  ) => (
    <Field className={options.className} data-invalid={Boolean(fieldError(field))}>
      <FieldLabel htmlFor={field}>{label}</FieldLabel>
      <CharacterClassInput
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
      <CharacterClassTextarea aria-describedby={describedBy(field)} aria-invalid={Boolean(fieldError(field))} defaultValue={values[field as keyof typeof values]} characterClass="ADDRESS" id={field} name={field} required rows={3} />
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
        <section className="grid gap-3 rounded-lg border border-destructive/40 bg-card p-4 text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring" id="shipment-draft-errors" ref={errorSummaryRef} role="alert" tabIndex={-1}>
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
        <CardHeader className={cardBandClassName}>
          <CardTitle id="draft-origin-heading" className="flex items-center gap-2">{/* icon marks the section at a glance */}<Warehouse aria-hidden="true" className="size-4 text-muted-foreground" />Gudang asal</CardTitle>
          <CardDescription>Outlet dan titik penjemputan paket untuk kiriman ini.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldSet aria-labelledby="draft-origin-heading" className="min-w-0 gap-5">
            <Field className={fieldWidth.lg} data-invalid={Boolean(fieldError("outletId"))}>
              <FieldLabel htmlFor="outletId">Outlet asal</FieldLabel>
              <Select
                onValueChange={(value) => {
                  setSelectedOutletId(value);
                  // Another outlet has other pickup points; fall back to its default.
                  setPickupAddressId("");
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
              <p aria-live="polite" className="text-sm text-muted-foreground empty:hidden" role="status">
                {destinationResetMessage}
              </p>
            </Field>
            {pickupPoints.length > 1 ? (
              <Field className={fieldWidth.full} data-invalid={Boolean(fieldError("pickupAddressId"))}>
                <FieldLabel htmlFor="pickupAddressId">Titik pickup</FieldLabel>
                <Select onValueChange={setPickupAddressId} value={effectivePickup?.pickupAddressId ?? ""}>
                  <SelectTrigger
                    aria-describedby={describedBy("pickupAddressId")}
                    aria-invalid={Boolean(fieldError("pickupAddressId"))}
                    className="min-h-11 w-full md:min-h-8"
                    id="pickupAddressId"
                  >
                    <SelectValue placeholder="Pilih titik pickup" />
                  </SelectTrigger>
                  <SelectContent>
                    {pickupPoints.map((point) => (
                      <SelectItem key={point.pickupAddressId} value={point.pickupAddressId}>
                        {point.isDefault ? `${point.pickupAddressLabel} · Utama` : point.pickupAddressLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input name="pickupAddressId" type="hidden" value={effectivePickup?.pickupAddressId ?? ""} />
                <FieldError error={fieldError("pickupAddressId")} id="pickupAddressId-error" />
                <FieldDescription>
                  Area asal: {effectivePickup?.originAreaLabel ?? "—"}
                </FieldDescription>
              </Field>
            ) : effectivePickup ? (
              <Field className={fieldWidth.full}>
                <FieldTitle>Titik pickup</FieldTitle>
                <div className="rounded-lg border bg-muted/20 px-3.5 py-2.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground leading-snug [overflow-wrap:anywhere]">{effectivePickup.pickupAddressLabel}</p>
                    {effectivePickup.isDefault ? (
                      <span className="inline-flex shrink-0 items-center rounded-md border border-border/80 bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-xs">
                        Utama
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/70" />
                    Area asal: <span className="font-medium text-foreground">{effectivePickup.originAreaLabel}</span>
                  </p>
                </div>
                <input name="pickupAddressId" type="hidden" value={effectivePickup.pickupAddressId} />
              </Field>
            ) : null}
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={cardBandClassName}>
          <CardTitle id="draft-sender-heading" className="flex items-center gap-2">{/* icon marks the section at a glance */}<UserRound aria-hidden="true" className="size-4 text-muted-foreground" />Pengirim</CardTitle>
          <CardDescription>Pilih kontak tersimpan atau isi data pengirim secara manual.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldSet aria-labelledby="draft-sender-heading" className="min-w-0 gap-5">
            <ContactPicker
              onSelect={applySenderSelection}
              role="SENDER"
              saveError={fieldError("senderContactSelection")}
            />
            <FieldRow>
              {inputField("senderName", "Nama pengirim", { autoFocus: autoFocusFirstField && !state.errors, characterClass: partyNameClass({ isSender: true }), defaultValue: values.senderName, required: true }, { className: fieldWidth.lg })}
              {inputField("senderPhone", "Nomor telepon", { characterClass: "PHONE", defaultValue: values.senderPhone, required: true, type: "tel" }, { className: fieldWidth.md })}
            </FieldRow>
            {addressField("senderAddress", "Alamat pengirim")}
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={cardBandClassName}>
          <CardTitle id="draft-recipient-heading" className="flex items-center gap-2">{/* icon marks the section at a glance */}<MapPinHouse aria-hidden="true" className="size-4 text-muted-foreground" />Penerima</CardTitle>
          <CardDescription>Pilih kontak tersimpan atau isi data penerima dan area tujuan secara manual.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldSet aria-labelledby="draft-recipient-heading" className="min-w-0 gap-5">
            <ContactPicker
              onSelect={applyRecipientSelection}
              role="RECIPIENT"
              saveError={fieldError("recipientContactSelection")}
            />
            <FieldRow>
              {inputField("recipientName", "Nama penerima", { characterClass: "PERSON_NAME", defaultValue: values.recipientName, required: true }, { className: fieldWidth.lg })}
              {inputField("recipientPhone", "Nomor telepon", { characterClass: "PHONE", defaultValue: values.recipientPhone, required: true, type: "tel" }, { className: fieldWidth.md })}
            </FieldRow>
            {addressField("recipientAddress", "Alamat penerima")}
            {inputField(
              "recipientAddressLandmark",
              <span>Patokan rumah <span className="font-normal text-muted-foreground">(Opsional)</span></span>,
              { characterClass: "ADDRESS", defaultValue: values.recipientAddressLandmark, maxLength: 160, placeholder: "Contoh: seberang masjid, pagar hijau" },
              { className: fieldWidth.full, hint: "Membantu kurir menemukan alamat. Dicetak pada label bila diisi." },
            )}
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
        <CardHeader className={cardBandClassName}>
          <CardTitle id="draft-package-heading" className="flex items-center gap-2">{/* icon marks the section at a glance */}<PackageIcon aria-hidden="true" className="size-4 text-muted-foreground" />Paket</CardTitle>
          <CardDescription>Dimensi bersifat opsional; isi ketiganya bila digunakan.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldSet aria-labelledby="draft-package-heading" className="min-w-0 gap-5">
            {inputField("packageContent", "Isi paket", { characterClass: "FREE_TEXT", defaultValue: values.packageContent, required: true }, { className: fieldWidth.lg })}
            <FieldRow>
              {inputField("packageWeightGrams", "Berat (gram)", { characterClass: "NUMERIC_INTEGER", defaultValue: values.packageWeightGrams, required: true, type: "text" }, { className: fieldWidth.sm })}
              {inputField("packageQuantity", "Jumlah paket", { characterClass: "NUMERIC_INTEGER", defaultValue: values.packageQuantity ?? "1", required: true, type: "text" }, { className: fieldWidth.xs })}
            </FieldRow>
            <fieldset className="contents">
              <legend className="sr-only">Dimensi paket</legend>
              <FieldRow>
                {inputField("packageLengthCm", "Panjang (cm)", { characterClass: "NUMERIC_INTEGER", defaultValue: values.packageLengthCm, type: "text" }, { className: fieldWidth.xs })}
                {inputField("packageWidthCm", "Lebar (cm)", { characterClass: "NUMERIC_INTEGER", defaultValue: values.packageWidthCm, type: "text" }, { className: fieldWidth.xs })}
                {inputField("packageHeightCm", "Tinggi (cm)", { characterClass: "NUMERIC_INTEGER", defaultValue: values.packageHeightCm, type: "text" }, { className: fieldWidth.xs })}
              </FieldRow>
            </fieldset>
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={cardBandClassName}>
          <CardTitle id="draft-handling-heading" className="flex items-center gap-2">{/* icon marks the section at a glance */}<ClipboardList aria-hidden="true" className="size-4 text-muted-foreground" />Instruksi dan penanganan</CardTitle>
          <CardDescription>Isian operasional yang juga diminta formulir pesanan Mengantar.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldSet aria-labelledby="draft-handling-heading" className="min-w-0 gap-5">
            <Field data-invalid={Boolean(fieldError("shippingInstruction"))}>
              <FieldLabel htmlFor="shippingInstruction">
                Instruksi pengiriman <span className="font-normal text-muted-foreground">(Opsional)</span>
              </FieldLabel>
              <CharacterClassTextarea
                aria-describedby={fieldError("shippingInstruction")
                  ? "shippingInstruction-hint shippingInstruction-error"
                  : "shippingInstruction-hint"}
                aria-invalid={Boolean(fieldError("shippingInstruction"))}
                characterClass="FREE_TEXT"
                defaultValue={values.shippingInstruction}
                id="shippingInstruction"
                maxLength={500}
                name="shippingInstruction"
                rows={2}
              />
              <FieldDescription id="shippingInstruction-hint">
                Catatan untuk kurir, maksimal 500 karakter.
              </FieldDescription>
              <FieldError error={fieldError("shippingInstruction")} id="shippingInstruction-error" />
            </Field>

            <HazardousDeclaration defaultChecked={values.isHazardous === "true"} invalid={Boolean(fieldError("isHazardous"))} />

          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={cardBandClassName}>
          <CardTitle id="draft-payment-heading" className="flex items-center gap-2">{/* icon marks the section at a glance */}<Wallet aria-hidden="true" className="size-4 text-muted-foreground" />Nilai dan pembayaran</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentMethodFields
            declaredValueError={fieldError("declaredValue")}
            defaultDeclaredValue={values.declaredValue}
            defaultMethod={values.paymentType}
            paymentTypeError={fieldError("paymentType")}
          />
        </CardContent>
      </Card>

    </form>
  );
}

/**
 * The hazardous declaration and the consequence of making it. Extracted so the ticked
 * state — the part an operator actually has to read — can be rendered in a test instead
 * of living only inside a form whose state a server render can never reach.
 */
export function HazardousDeclaration({ defaultChecked = false, invalid = false }: { defaultChecked?: boolean; invalid?: boolean }) {
  const [isHazardous, setIsHazardous] = useState(defaultChecked);
  return (
    <>
            <Field className="items-start" data-invalid={invalid} orientation="horizontal">
        <Checkbox
          aria-describedby="isHazardous-hint"
          checked={isHazardous}
          className="mt-0.5"
          id="isHazardous"
          name="isHazardous"
          onCheckedChange={(checked) => setIsHazardous(checked === true)}
          value="true"
        />
        <div className="grid gap-1">
          <FieldLabel className="leading-5" htmlFor="isHazardous">
            Barang berbahaya (hazardous)
          </FieldLabel>
          <FieldDescription id="isHazardous-hint">
            Baterai lithium, aerosol, cairan mudah terbakar, atau bahan kimia. Wajib
            dinyatakan: salah menyatakan bisa membuat paket ditahan atau ditolak kurir.
          </FieldDescription>
        </div>
      </Field>
      {isHazardous ? (
        <p
          aria-live="polite"
          className="flex items-start gap-2 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn-surface)] p-3 text-sm text-[var(--warn)]"
          role="status"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Sebagian layanan menolak barang berbahaya. Periksa hasil estimasi: layanan yang
            tidak menerimanya tidak boleh dipilih untuk kiriman ini.
          </span>
        </p>
      ) : null}
    </>
  );
}

type PaymentMethodOption = {
  description: string;
  fieldAnnouncement: string;
  value: PaymentMethod;
};

/** T-186 / PR-64: the three ways a shipment is paid, in the order operators meet them. */
const PAYMENT_METHOD_OPTIONS: readonly PaymentMethodOption[] = [
  {
    description: "Pembeli sudah membayar. Kurir tidak menagih apa pun ke penerima.",
    fieldAnnouncement: "Kolom nilai barang untuk asuransi ditampilkan.",
    value: "NON_COD",
  },
  {
    description: "Kurir menagih nilai barang, ongkir, dan biaya COD ke penerima.",
    fieldAnnouncement: "Kolom nilai barang ditampilkan. Total COD dihitung otomatis setelah layanan dipilih.",
    value: "COD",
  },
  {
    description: "Barang sudah dibayar di luar GeraiCUAN. Kurir hanya menagih ongkir ke penerima.",
    fieldAnnouncement: "Kolom nilai barang yang sudah dibayar ditampilkan. Ongkir yang ditagih diatur saat memilih layanan.",
    value: "COD_ONGKIR",
  },
];

type PaymentMethodFieldsProps = {
  declaredValueError?: string;
  defaultDeclaredValue?: string;
  defaultMethod?: string;
  paymentTypeError?: string;
};

/**
 * The payment choice and the one field that belongs to it (PR-64). Only the
 * chosen method's panel is rendered, so a field for another method is never in
 * the form and never submitted; the goods value typed in one panel carries to
 * the next because it is the same fact. Exported so a render test can bind each
 * method's field to that method alone.
 */
export function PaymentMethodFields({
  declaredValueError,
  defaultDeclaredValue = "",
  defaultMethod,
  paymentTypeError,
}: PaymentMethodFieldsProps) {
  const [method, setMethod] = useState<PaymentMethod>(
    isPaymentMethod(defaultMethod) ? defaultMethod : "NON_COD",
  );
  const [declaredValue, setDeclaredValue] = useState(defaultDeclaredValue);
  const [announcement, setAnnouncement] = useState("");
  const invalidValue = Boolean(declaredValueError);
  const valueInput = (label: string, hint: string) => (
    <Field className={fieldWidth.lg} data-invalid={invalidValue}>
      <FieldLabel htmlFor="declaredValue">{label}</FieldLabel>
      <CharacterClassInput
        aria-describedby={invalidValue ? "declaredValue-hint declaredValue-error" : "declaredValue-hint"}
        aria-invalid={invalidValue}
        characterClass="RUPIAH"
        className="min-h-11 md:min-h-9 sm:max-w-56"
        id="declaredValue"
        name="declaredValue"
        onChange={(event) => setDeclaredValue(event.target.value)}
        required
        type="text"
        value={declaredValue}
      />
      <FieldDescription id="declaredValue-hint">{hint}</FieldDescription>
      <FieldError error={declaredValueError} id="declaredValue-error" />
    </Field>
  );
  const computedNote = (title: string, body: ReactNode) => (
    <div className="grid gap-1 rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
      <p className="font-medium">{title}</p>
      <p className="leading-6 text-muted-foreground">{body}</p>
    </div>
  );

  return (
    <FieldSet aria-labelledby="draft-payment-heading" className="min-w-0 gap-5">
      <fieldset
        aria-describedby={paymentTypeError ? "paymentType-error" : undefined}
        aria-invalid={Boolean(paymentTypeError)}
        className="grid gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id="paymentType"
        tabIndex={-1}
      >
        <legend className="mb-1 text-base font-medium">Metode pembayaran</legend>
        <RadioGroup
          className="grid gap-3 md:grid-cols-3"
          name="paymentType"
          onValueChange={(value) => {
            if (!isPaymentMethod(value)) return;
            setMethod(value);
            setAnnouncement(
              PAYMENT_METHOD_OPTIONS.find((option) => option.value === value)?.fieldAnnouncement ?? "",
            );
          }}
          required
          value={method}
        >
          {PAYMENT_METHOD_OPTIONS.map((option) => (
            <FieldLabel
              className="min-h-14 w-full cursor-pointer items-start gap-3 rounded-lg border-2 px-4 py-3 font-normal transition-colors hover:border-primary/40 hover:bg-muted/20 has-data-checked:border-primary has-data-checked:bg-primary/5"
              htmlFor={`paymentType-${option.value}`}
              key={option.value}
            >
              <RadioGroupItem
                aria-describedby={`paymentType-${option.value}-description`}
                className="mt-1 size-5"
                id={`paymentType-${option.value}`}
                value={option.value}
              />
              <span className="grid gap-1">
                <span className="text-base font-semibold">{PAYMENT_METHOD_LABELS[option.value]}</span>
                <span className="text-sm leading-5 text-muted-foreground" id={`paymentType-${option.value}-description`}>
                  {option.description}
                </span>
              </span>
            </FieldLabel>
          ))}
        </RadioGroup>
        <FieldError error={paymentTypeError} id="paymentType-error" />
      </fieldset>
      <p aria-live="polite" className="sr-only" role="status">{announcement}</p>
      <div className="grid gap-4" data-payment-panel={method}>
        {method === "NON_COD" ? (
          valueInput(
            "Nilai barang untuk asuransi (Rp)",
            "Nilai barang yang dipertanggungkan dan dikirim ke Mengantar. Kurir tidak menagih apa pun.",
          )
        ) : method === "COD" ? (
          <>
            {valueInput(
              "Nilai barang (Rp)",
              "Harga barang yang dibayar penerima kepada kurir.",
            )}
            {computedNote(
              "Total COD dihitung otomatis",
              "Setelah layanan dipilih, total yang ditagih kurir = nilai barang + ongkir + biaya COD Mengantar (3,33% dari total). Angka ini tidak diketik.",
            )}
          </>
        ) : (
          <>
            {valueInput(
              "Nilai barang yang sudah dibayar (Rp)",
              "Tidak ditagih kurir. Dikirim ke Mengantar sebagai nilai barang untuk asuransi.",
            )}
            {computedNote(
              "Ongkir yang ditagih kurir diatur saat memilih layanan",
              "Nilai awalnya titik impas: ongkir yang dipotong Mengantar ditambah biaya COD 3,33%. Boleh dinaikkan, tidak boleh diturunkan; selisihnya diterima penjual.",
            )}
          </>
        )}
      </div>
    </FieldSet>
  );
}
