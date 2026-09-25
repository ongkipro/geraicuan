"use client";

import { AlertTriangle, CircleAlert, MapPin, Minus, Plus, Trash2 } from "lucide-react";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
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
import {
  composeProductRows,
  MENGANTAR_COD_FEE_RATE_LABEL,
  packageSummaryLabel,
  parseProductRows,
  type ProductRow,
  SelectedContactProvenance,
  ShipmentFlowSummary,
} from "@/app/app/shipment-draft-experience";
import { SearchCombobox, type TypeaheadOutcome } from "@/components/cms/search-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cardBandClassName, fieldWidth, FieldRow, FormLayout, PageAside } from "@/components/cms/cms-layouts";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldSet, FieldTitle } from "@/components/ui/field";
import { CharacterClassInput, CharacterClassTextarea } from "@/components/ui/character-class-input";
import { partyNameClass } from "@/lib/field-character-classes";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { isPaymentMethod, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-method";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
  /** T-205: the gerai's own name and WhatsApp, for the "Alamat gerai" sender source. */
  senderIdentity?: { name: string; phone: string | null } | null;
  submissionId: string;
};

type DestinationState =
  | { mode: "empty" }
  | { mode: "contact"; areaId: string; areaLabel: string }
  | ({ mode: "manual" } & DestinationAreaSelection);

/** GeraiOS section pattern (spec 10): a step number beside the heading; the number is decoration, the heading names the section. */

function SectionTitle({ children, id, step }: { children: ReactNode; id: string; step: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground tabular-nums">{step}</span>
      <CardTitle id={id}>{children}</CardTitle>
    </div>
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
      className="grid min-w-0 gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

type SenderSource = "gerai" | "kontak" | "baru";
type SenderFields = { address: string; name: string; phone: string };
type KeyedProductRow = ProductRow & { key: number };

const SENDER_SOURCES: readonly { label: string; value: SenderSource }[] = [
  { label: "Alamat gerai", value: "gerai" },
  { label: "Buku kontak", value: "kontak" },
  { label: "Input baru", value: "baru" },
];

// Mirrors the server's 1–1.000 range (`src/lib/shipment-draft.ts`), which stays the authority.
const MAX_PRODUCT_QUANTITY = 1_000;

// Mirrors the server's sender-address limit (`src/lib/shipment-draft.ts` MAX_ADDRESS_LENGTH).
const MAX_SENDER_ADDRESS_LENGTH = 500;

/**
 * The stored pickup label is "pickup name, street, sub-district, district, city, province, zip"
 * (`src/lib/mengantar-locations.ts`). The label prints the address only: the leading name is
 * Mengantar's pickup name, which need not be the gerai's (masking), and the area is already in
 * the label, so nothing is appended.
 */
export function geraiAddress(point: Pick<OutletPickupPoint, "pickupAddressLabel"> | null) {
  if (!point) return "";
  const parts = point.pickupAddressLabel.split(",").map((part) => part.trim()).filter(Boolean);
  return (parts.length > 1 ? parts.slice(1) : parts).join(", ").slice(0, MAX_SENDER_ADDRESS_LENGTH);
}

function effectivePickupOf(outlets: Outlet[], outletId: string, pickupAddressId: string) {
  const points = outlets.find((outlet) => outlet.id === outletId)?.pickupPoints ?? [];
  return points.find((point) => point.pickupAddressId === pickupAddressId)
    ?? points.find((point) => point.isDefault)
    ?? null;
}

export function ShipmentDraftForm({ autoFocusFirstField, outlets, senderIdentity = null, submissionId }: ShipmentDraftFormProps) {
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
  const effectivePickup = effectivePickupOf(outlets, selectedOutletId, pickupAddressId);
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

  // T-205: the sender printed on the label, filled from one of three sources. The
  // fields stay visible and editable in every source: they are what the label prints.
  const [senderSource, setSenderSource] = useState<SenderSource>(
    senderIdentity && values.senderName === undefined ? "gerai" : "baru",
  );
  const geraiSender = (point: OutletPickupPoint | null): SenderFields => ({
    address: geraiAddress(point),
    name: senderIdentity?.name ?? "",
    phone: senderIdentity?.phone ?? "",
  });
  const [sender, setSender] = useState<SenderFields>(() => (
    senderSource === "gerai"
      ? geraiSender(effectivePickup)
      : { address: values.senderAddress ?? "", name: values.senderName ?? "", phone: values.senderPhone ?? "" }
  ));
  const choosePickup = (outletId: string, nextPickupAddressId: string) => {
    if (senderSource !== "gerai") return;
    const address = geraiAddress(effectivePickupOf(outlets, outletId, nextPickupAddressId));
    setSender((current) => ({ ...current, address }));
  };
  const chooseSenderSource = (source: SenderSource) => {
    setSenderSource(source);
    if (source === "gerai") setSender(geraiSender(effectivePickup));
    if (source === "baru") setSender({ address: "", name: "", phone: "" });
  };

  // T-205: several product rows, stored as the one content text and total quantity.
  const [productRows, setProductRows] = useState<KeyedProductRow[]>(() =>
    parseProductRows(values.packageContent, values.packageQuantity ?? "1").map((row, key) => ({ ...row, key })));
  const composed = composeProductRows(productRows);
  const updateProductRow = (key: number, change: Partial<ProductRow>) =>
    setProductRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const stepQuantity = (key: number, quantity: string, delta: number) => {
    // A cleared field counts as 0, so "+" gives 1 rather than 2.
    const current = /^\d+$/.test(quantity) ? Number(quantity) : 0;
    updateProductRow(key, { quantity: String(Math.min(MAX_PRODUCT_QUANTITY, Math.max(1, current + delta))) });
  };
  const [weight, setWeight] = useState(values.packageWeightGrams ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    isPaymentMethod(values.paymentType) ? values.paymentType : "NON_COD",
  );

  const applySenderSelection = useCallback((selection: ShipmentContactSelection) => {
    setSender({ address: selection.address, name: selection.name, phone: selection.phone });
  }, [setSender]);
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
        className="min-h-11 md:min-h-10"
        id={field}
        name={field}
        {...input}
      />
      {options.hint ? <FieldDescription id={`${field}-hint`}>{options.hint}</FieldDescription> : null}
      <FieldError error={fieldError(field)} id={`${field}-error`} />
    </Field>
  );
  const addressField = (field: string, label: string, control: { onChange?: ComponentProps<typeof CharacterClassTextarea>["onChange"]; value?: string } = {}) => (
    <Field data-invalid={Boolean(fieldError(field))}>
      <FieldLabel htmlFor={field}>{label}</FieldLabel>
      <CharacterClassTextarea
        aria-describedby={describedBy(field)}
        aria-invalid={Boolean(fieldError(field))}
        characterClass="ADDRESS"
        id={field}
        name={field}
        required
        rows={3}
        {...(control.onChange ? { onChange: control.onChange, value: control.value } : { defaultValue: values[field as keyof typeof values] })}
      />
      <FieldError error={fieldError(field)} id={`${field}-error`} />
    </Field>
  );

  const destinationLabel = effectiveDestination.mode === "empty" ? null : effectiveDestination.areaLabel;
  const packageErrors = [fieldError("packageContent"), fieldError("packageQuantity")].filter(Boolean);

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="grid gap-6"
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
      <FormLayout
        aside={(
          <PageAside label="Ringkasan pembuatan kiriman">
            <Card>
              <CardHeader><CardTitle>Ringkasan kiriman</CardTitle></CardHeader>
              <CardContent className="grid gap-5">
                <ShipmentFlowSummary
                  destination={destinationLabel}
                  origin={effectivePickup?.originAreaLabel ?? null}
                  rows={[
                    { label: "Pengirim di label", value: sender.name.trim() || "—" },
                    { label: "Berat & jumlah", value: packageSummaryLabel(weight, composed.packageQuantity) },
                    { label: "Pembayaran", value: PAYMENT_METHOD_LABELS[paymentMethod] },
                  ]}
                />
                <p className="border-t pt-4 text-sm text-muted-foreground">
                  Ongkir dan total muncul setelah tarif Mengantar dimuat.
                </p>
                {/* One primary per width: below the split the bottom bar carries it (spec 10). */}
                <Button className="hidden min-h-11 w-full @4xl/page:inline-flex" disabled={pending} type="submit">
                  {pending ? "Menyimpan draf…" : "Simpan & cek tarif"}
                </Button>
                <p className="text-sm text-muted-foreground">
                  Draf disimpan, lalu tarif Mengantar dimuat otomatis. Belum ada pesanan yang dikirim ke penyedia.
                </p>
              </CardContent>
            </Card>
          </PageAside>
        )}
      >
      {errorEntries.length > 0 ? (
        <section className="grid gap-3 rounded-xl bg-card p-4 text-destructive border outline-none focus-visible:ring-2 focus-visible:ring-ring" id="shipment-draft-errors" ref={errorSummaryRef} role="alert" tabIndex={-1}>
          <h2 className="flex items-center gap-2 font-medium"><CircleAlert aria-hidden="true" className="size-4 shrink-0" />Periksa {errorEntries.length} isian berikut</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {errorEntries.map(([field, message]) => (
              <li key={field}>
                <a className="underline underline-offset-4" href={field === "form" ? "#shipment-draft-errors" : field.startsWith("destinationArea") ? "#areaLabel" : `#${field}`}>{message}</a>
              </li>
            ))}
          </ul>
          {state.duplicateDetected && (
            <div className="rounded-md bg-[var(--warn-surface)] p-3 text-foreground">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--warn)]" aria-hidden="true" />
                <div className="grid gap-2">
                  <p className="text-sm font-semibold text-[var(--warn)]">
                    Pesanan serupa terdeteksi
                  </p>
                  <p className="text-sm text-muted-foreground">
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
          <SectionTitle id="draft-origin-heading" step={1}>Asal kiriman</SectionTitle>
          <CardDescription>Outlet dan titik pickup tempat paket dijemput kurir.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* T-205: pickup vs drop-off and the pickup date/slot are deliberately not rendered.
              Nothing stores or sends them yet: they wait on T-153's Mengantar request contract
              (`POST /time`, unverified). Vehicle type is not built — Mengantar has no field for it. */}
          <FieldSet aria-labelledby="draft-origin-heading" className="min-w-0 gap-5">
            <Field className={fieldWidth.lg} data-invalid={Boolean(fieldError("outletId"))}>
              <FieldLabel htmlFor="outletId">Outlet asal</FieldLabel>
              <Select
                onValueChange={(value) => {
                  setSelectedOutletId(value);
                  // Another outlet has other pickup points; fall back to its default.
                  setPickupAddressId("");
                  choosePickup(value, "");
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
                  className="min-h-11 w-full md:min-h-10"
                  id="outletId"
                >
                  <SelectValue placeholder="Pilih outlet">{outlets.find((outlet) => outlet.id === selectedOutletId)?.name}</SelectValue>
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
                <Select
                  onValueChange={(value) => {
                    setPickupAddressId(value);
                    choosePickup(selectedOutletId, value);
                  }}
                  value={effectivePickup?.pickupAddressId ?? ""}
                >
                  <SelectTrigger
                    aria-describedby={describedBy("pickupAddressId")}
                    aria-invalid={Boolean(fieldError("pickupAddressId"))}
                    className="min-h-11 w-full md:min-h-10"
                    id="pickupAddressId"
                  >
                    <SelectValue placeholder="Pilih titik pickup">{effectivePickup ? (effectivePickup.isDefault ? `${effectivePickup.pickupAddressLabel} · Utama` : effectivePickup.pickupAddressLabel) : undefined}</SelectValue>
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
                <div className="text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground leading-snug wrap-anywhere">{effectivePickup.pickupAddressLabel}</p>
                    {effectivePickup.isDefault ? (
                      <Badge className="shrink-0" variant="secondary">Utama</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
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
          <SectionTitle id="draft-sender-heading" step={2}>Pengirim di label</SectionTitle>
          <CardDescription>Nama, telepon, dan alamat ini yang dicetak sebagai pengirim pada label resi.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldSet aria-labelledby="draft-sender-heading" className="min-w-0 gap-5">
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Sumber data pengirim</legend>
              {/* A segmented choice of where the fields below are filled from. Radios, not
                  tabs: picking a source fills the same fields, it does not switch panels. */}
              <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
                {SENDER_SOURCES.filter((source) => source.value !== "gerai" || senderIdentity).map((source) => (
                  <label
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:min-h-10",
                      "has-checked:bg-background has-checked:font-semibold has-checked:text-foreground has-checked:shadow-resting has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    )}
                    key={source.value}
                  >
                    <input
                      checked={senderSource === source.value}
                      className="sr-only"
                      name="senderSource"
                      onChange={() => chooseSenderSource(source.value)}
                      type="radio"
                      value={source.value}
                    />
                    {source.label}
                  </label>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {senderSource === "gerai"
                  ? "Diisi dari nama gerai, WhatsApp gerai, dan titik pickup. Boleh diubah sebelum disimpan."
                  : senderSource === "kontak"
                    ? "Pilih kontak pengirim tersimpan; datanya disalin ke isian di bawah."
                    : "Isi nama pengirim yang ingin dicetak, misalnya nama gerai atau reseller."}
              </p>
            </fieldset>
            {senderSource === "kontak" ? (
              <ContactPicker
                onSelect={applySenderSelection}
                role="SENDER"
                saveError={fieldError("senderContactSelection")}
              />
            ) : null}
            <FieldRow>
              {inputField("senderName", "Nama pengirim", {
                autoFocus: autoFocusFirstField && !state.errors && senderSource === "baru",
                characterClass: partyNameClass({ isSender: true }),
                onChange: (event) => setSender((current) => ({ ...current, name: event.target.value })),
                required: true,
                value: sender.name,
              }, { className: fieldWidth.lg })}
              {inputField("senderPhone", "Nomor telepon", {
                characterClass: "PHONE",
                onChange: (event) => setSender((current) => ({ ...current, phone: event.target.value })),
                required: true,
                type: "tel",
                value: sender.phone,
              }, { className: fieldWidth.md })}
            </FieldRow>
            {addressField("senderAddress", "Alamat pengirim", {
              onChange: (event) => setSender((current) => ({ ...current, address: event.target.value })),
              value: sender.address,
            })}
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={cardBandClassName}>
          <SectionTitle id="draft-recipient-heading" step={3}>Penerima</SectionTitle>
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
              {inputField("recipientName", "Nama penerima", { autoFocus: autoFocusFirstField && !state.errors && senderSource !== "baru", characterClass: "PERSON_NAME", defaultValue: values.recipientName, required: true }, { className: fieldWidth.lg })}
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
              <p className="text-sm text-muted-foreground" role="status">Pilih outlet asal sebelum mencari area tujuan.</p>
            )}
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={cardBandClassName}>
          <SectionTitle id="draft-payment-heading" step={4}>Pembayaran</SectionTitle>
        </CardHeader>
        <CardContent>
          <PaymentMethodFields
            declaredValueError={fieldError("declaredValue")}
            defaultDeclaredValue={values.declaredValue}
            defaultMethod={values.paymentType}
            onMethodChange={setPaymentMethod}
            paymentTypeError={fieldError("paymentType")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={cardBandClassName}>
          <SectionTitle id="draft-package-heading" step={5}>Produk &amp; paket</SectionTitle>
          <CardDescription>Produk dan jumlahnya dicetak sebagai isi paket. Berat wajib; dimensi opsional (isi ketiganya bila digunakan).</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldSet aria-labelledby="draft-package-heading" className="min-w-0 gap-5">
            <ul aria-label="Daftar produk" className="grid gap-5">
              {productRows.map((row, index) => {
                const first = index === 0;
                const nameId = first ? "packageContent" : `product-${row.key}-name`;
                const quantityId = first ? "packageQuantity" : `product-${row.key}-quantity`;
                const rowLabel = productRows.length > 1 ? ` produk ${index + 1}` : "";
                const quantityNumber = /^\d+$/.test(row.quantity) ? Number(row.quantity) : 0;
                const productName = row.name.trim() || `produk ${index + 1}`;
                return (
                  <li className="flex flex-wrap items-end gap-x-4 gap-y-3" key={row.key}>
                    <Field className="min-w-0 flex-1 basis-60" data-invalid={first && Boolean(fieldError("packageContent"))}>
                      <FieldLabel htmlFor={nameId}>Nama produk<span className="sr-only">{rowLabel}</span></FieldLabel>
                      <CharacterClassInput
                        aria-describedby={first && fieldError("packageContent") ? "packageContent-error" : undefined}
                        aria-invalid={first && Boolean(fieldError("packageContent"))}
                        autoComplete="off"
                        characterClass="FREE_TEXT"
                        className="min-h-11 md:min-h-10"
                        id={nameId}
                        onChange={(event) => updateProductRow(row.key, { name: event.target.value })}
                        placeholder={first ? "Contoh: Kain batik" : undefined}
                        required
                        value={row.name}
                      />
                    </Field>
                    <Field className="w-fit" data-invalid={first && Boolean(fieldError("packageQuantity"))}>
                      <FieldLabel htmlFor={quantityId}>Jumlah<span className="sr-only">{rowLabel}</span></FieldLabel>
                      <div className="flex items-center gap-2">
                        <Button
                          aria-controls={quantityId}
                          aria-label={`Kurangi jumlah ${productName}`}
                          className="max-md:size-11"
                          disabled={quantityNumber <= 1}
                          onClick={() => stepQuantity(row.key, row.quantity, -1)}
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <Minus aria-hidden="true" />
                        </Button>
                        <CharacterClassInput
                          aria-describedby={first && fieldError("packageQuantity") ? "packageQuantity-error" : undefined}
                          aria-invalid={first && Boolean(fieldError("packageQuantity"))}
                          characterClass="NUMERIC_INTEGER"
                          className="min-h-11 w-16 text-center tabular-nums md:min-h-10"
                          id={quantityId}
                          inputMode="numeric"
                          onChange={(event) => updateProductRow(row.key, { quantity: event.target.value })}
                          required
                          type="text"
                          value={row.quantity}
                        />
                        <Button
                          aria-controls={quantityId}
                          aria-label={`Tambah jumlah ${productName}`}
                          className="max-md:size-11"
                          disabled={quantityNumber >= MAX_PRODUCT_QUANTITY}
                          onClick={() => stepQuantity(row.key, row.quantity, 1)}
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <Plus aria-hidden="true" />
                        </Button>
                      </div>
                    </Field>
                    {productRows.length > 1 ? (
                      <Button
                        aria-label={`Hapus ${productName}`}
                        className="max-md:size-11"
                        onClick={() => setProductRows((rows) => rows.filter((candidate) => candidate.key !== row.key))}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {packageErrors.length > 0 ? (
              <div className="grid gap-1">
                <FieldError error={fieldError("packageContent")} id="packageContent-error" />
                <FieldError error={fieldError("packageQuantity")} id="packageQuantity-error" />
              </div>
            ) : null}
            <Button
              className="min-h-11 w-full sm:w-fit md:min-h-10"
              onClick={() => setProductRows((rows) => [...rows, { key: Math.max(...rows.map((row) => row.key)) + 1, name: "", quantity: "1" }])}
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" />
              Tambah produk
            </Button>
            <input name="packageContent" type="hidden" value={composed.packageContent} />
            <input name="packageQuantity" type="hidden" value={composed.packageQuantity} />
            <p className="text-sm text-muted-foreground wrap-anywhere">
              Isi paket di label: <span className="text-foreground">{composed.packageContent || "—"}</span>
              {" · "}Total <span className="tabular-nums text-foreground">{composed.packageQuantity || "—"}</span> barang
              {" · "}
              {/* The composed text shares the server's 240-character content limit (MAX_CONTENT_LENGTH). */}
              <span className={cn("tabular-nums", composed.packageContent.length > 240 && "font-medium text-destructive")}>
                {composed.packageContent.length}/240 karakter
              </span>
            </p>
            <FieldRow className="border-t pt-5">
              {inputField("packageWeightGrams", "Berat (gram)", {
                characterClass: "NUMERIC_INTEGER",
                inputMode: "numeric",
                onChange: (event) => setWeight(event.target.value),
                required: true,
                type: "text",
                value: weight,
              }, { className: fieldWidth.sm })}
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
          <FieldSet aria-labelledby="draft-handling-heading" className="mt-6 min-w-0 gap-5 border-t pt-5">
            <h3 className="text-sm font-semibold" id="draft-handling-heading">Instruksi dan penanganan</h3>
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
      </FormLayout>

      {/* V-40: scale values only; the one arbitrary value is the documented safe-area
          exception — the bar must clear the iOS home indicator, which no scale step expresses. */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t bg-card px-4 pt-3 pb-[max(--spacing(3),env(safe-area-inset-bottom))] shadow-md sm:-mx-6 sm:px-6 @4xl/page:hidden">
        <p className="text-xs text-muted-foreground">Langkah 1 dari 3 · Isi data</p>
        <p className="truncate text-sm font-semibold">
          {destinationLabel ? `Ke ${destinationLabel}` : "Isi pengirim, penerima, dan paket"}
        </p>
        <Button className="mt-2 min-h-11 w-full" disabled={pending} type="submit">
          {pending ? "Menyimpan draf…" : "Simpan & cek tarif"}
        </Button>
      </div>
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
            Barang berbahaya
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
          className="flex items-start gap-2 rounded-lg bg-[var(--warn-surface)] p-3 text-sm text-[var(--warn)]"
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
  /** T-205: the fee the method carries, shown on its card. */
  feeHint: string;
  value: PaymentMethod;
};

/** T-186 / PR-64: the three ways a shipment is paid, in the order operators meet them. */
const PAYMENT_METHOD_OPTIONS: readonly PaymentMethodOption[] = [
  {
    description: "Pembeli sudah membayar. Kurir tidak menagih apa pun ke penerima.",
    feeHint: "Tanpa biaya COD",
    fieldAnnouncement: "Kolom nilai barang untuk asuransi ditampilkan.",
    value: "NON_COD",
  },
  {
    description: "Kurir menagih nilai barang, ongkir, dan biaya COD ke penerima.",
    feeHint: `Biaya COD ${MENGANTAR_COD_FEE_RATE_LABEL} dari total tagihan`,
    fieldAnnouncement: "Kolom nilai barang ditampilkan. Total COD dihitung otomatis setelah layanan dipilih.",
    value: "COD",
  },
  {
    description: "Barang sudah dibayar di luar GeraiCUAN. Kurir hanya menagih ongkir ke penerima.",
    feeHint: `Biaya COD ${MENGANTAR_COD_FEE_RATE_LABEL} dari ongkir ditagih`,
    fieldAnnouncement: "Kolom nilai barang yang sudah dibayar ditampilkan. Ongkir yang ditagih diatur saat memilih layanan.",
    value: "COD_ONGKIR",
  },
];

type PaymentMethodFieldsProps = {
  declaredValueError?: string;
  defaultDeclaredValue?: string;
  defaultMethod?: string;
  /** T-205: the chosen method, for the summary rail. */
  onMethodChange?: (method: PaymentMethod) => void;
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
  onMethodChange,
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
        className="min-h-11 md:min-h-10 sm:max-w-56"
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
    <div className="grid gap-1 text-sm">
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
            onMethodChange?.(value);
            setAnnouncement(
              PAYMENT_METHOD_OPTIONS.find((option) => option.value === value)?.fieldAnnouncement ?? "",
            );
          }}
          required
          value={method}
        >
          {PAYMENT_METHOD_OPTIONS.map((option) => (
            <FieldLabel
              className="group/payment min-h-14 w-full cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 font-normal transition-colors hover:bg-muted has-data-checked:border-primary has-data-checked:bg-accent"
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
                <span className="text-base font-semibold group-has-data-checked/payment:text-accent-foreground">{PAYMENT_METHOD_LABELS[option.value]}</span>
                <span className="grid gap-1 text-sm leading-5 text-muted-foreground" id={`paymentType-${option.value}-description`}>
                  <span>{option.description}</span>
                  <span className="font-medium text-foreground">{option.feeHint}</span>
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
