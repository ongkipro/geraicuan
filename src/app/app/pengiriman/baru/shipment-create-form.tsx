"use client";

import {
  ArrowRight,
  CalendarDays,
  Car,
  CircleAlert,
  Clock,
  Info,
  Loader2,
  MapPin,
  Motorbike,
  Plus,
  Search,
  Store,
  Trash2,
  Truck,
} from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";

import {
  saveShipmentDraft,
  searchRecipientShipmentContacts,
  searchSenderShipmentContacts,
  selectShipmentContact,
  type ShipmentContactRole,
  type ShipmentContactSearchResult,
  type ShipmentContactSelection,
  type ShipmentDraftActionState,
} from "@/app/app/actions";
import { DestinationAreaPicker } from "@/app/app/_shared/destination-area-picker";
import { SearchPicker } from "@/app/app/pengiriman/_components/search-picker";
import { OptionCard } from "@/components/app/option-card";
import { Button } from "@/components/ui/button";
import { CharacterClassInput, CharacterClassTextarea } from "@/components/ui/character-class-input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-method";
import {
  availablePickupSlots,
  composeProductRows,
  composeProductWeightGrams,
  geraiSenderIdentity,
  gramsToKilogramLabel,
  HANDOVER_TYPE_LABELS,
  MENGANTAR_COD_FEE_RATE_LABEL,
  pickupDateOptions,
  pickupSlotLabel,
  PICKUP_VEHICLE_LABELS,
  PICKUP_VEHICLES,
  type HandoverType,
  type PickupVehicle,
} from "@/lib/shipment-draft-logic";
import { cn } from "@/lib/utils";

import {
  FLOW_SECTIONS,
  FlowStepper,
  flowSectionStates,
  InsetBlock,
  Required,
  requiredFieldsMissing,
  saveGuard,
  SectionCard,
  SectionStatus,
  spineSegments,
  SubBlockTitle,
  type FlowStep,
} from "./flow-parts";
import { FillChecklist, MobileActionBar, RailColumn, SummaryRail, type RailData } from "./summary-rail";

export type FlowPickupPoint = { isDefault: boolean; originAreaLabel: string; pickupAddressId: string; pickupAddressLabel: string };
export type FlowOutlet = { id: string; name: string; pickupPoints: FlowPickupPoint[] };

type Destination =
  | { mode: "empty" }
  | { areaId: string; areaLabel: string; mode: "contact" }
  | { areaId: string; areaLabel: string; mode: "manual"; outletId: string; query: string };

type ProductRowState = { key: number; name: string; quantity: string; weightKg: string };

const MAX_CONTENT_LENGTH = 240;

const controlClass = "text-sm";

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p className="text-xs text-destructive" id={id}>{message}</p> : null;
}

function FormField({ children, error, htmlFor, label, required = false }: {
  children: ReactNode;
  error?: string;
  htmlFor: string;
  label: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-invalid={Boolean(error) || undefined}>
      <label className="text-sm font-medium" htmlFor={htmlFor}>{label}{required ? <Required /> : null}</label>
      {children}
      <FieldError id={`${htmlFor}-error`} message={error} />
    </div>
  );
}

const PICKUP_VEHICLE_ICONS: Record<PickupVehicle, typeof Truck> = { MOBIL: Car, MOTOR: Motorbike, TRUK: Truck };

function effectivePickup(outlets: FlowOutlet[], outletId: string, pickupAddressId: string) {
  const points = outlets.find((outlet) => outlet.id === outletId)?.pickupPoints ?? [];
  return points.find((point) => point.pickupAddressId === pickupAddressId) ?? points.find((point) => point.isDefault) ?? points[0] ?? null;
}

/** "Cari kontak tersimpan": search the role's contacts, then resolve the chosen address on the server. */
function ContactSearch({ onSelected, role }: { onSelected: (selection: ShipmentContactSelection) => void; role: ShipmentContactRole }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const party = role === "SENDER" ? "pengirim" : "penerima";
  async function search(query: string) {
    const formData = new FormData();
    formData.set(role === "SENDER" ? "senderContactQuery" : "recipientContactQuery", query);
    const result = await (role === "SENDER" ? searchSenderShipmentContacts : searchRecipientShipmentContacts)({}, formData);
    return { error: result.error, items: result.results ?? [], message: result.error ?? result.message, success: !result.error };
  }
  async function choose(item: ShipmentContactSearchResult) {
    const formData = new FormData();
    formData.set("contactSelection", `${role}:${item.contactId}:${item.addressId}`);
    setPending(true);
    const result = await selectShipmentContact({}, formData);
    setPending(false);
    setMessage(result.error ?? null);
    if (result.selection) onSelected(result.selection);
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <SearchPicker<ShipmentContactSearchResult>
        cacheScope={`contact-${role}`}
        itemKey={(item) => `${item.contactId}:${item.addressId}`}
        label={`Cari kontak ${party}`}
        onSelect={(item) => void choose(item)}
        placeholder={`Nama atau nomor ${party}`}
        renderItem={(item) => (
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold">{item.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{item.phone} · {item.addressLabel}</span>
            {item.destinationAreaLabel ? <span className="text-xs text-muted-foreground">{item.destinationAreaLabel}</span> : null}
          </span>
        )}
        search={search}
        trigger={(
          <Button className="h-10 px-0 font-semibold max-md:h-11" type="button" variant="link">
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Search aria-hidden="true" />}
            Cari kontak tersimpan
          </Button>
        )}
      />
      {message ? <p className="text-xs text-destructive" role="alert">{message}</p> : null}
    </div>
  );
}

export function ShipmentCreateForm({
  gerai,
  nowIso,
  outlets,
  steps,
  submissionId,
}: {
  gerai: { name: string; phone: string | null };
  /** The top-bar steps; step 1 gains the live "n/4 bagian lengkap" (T-249). */
  steps: FlowStep[];
  /** The server's clock, so the pickup dates and slots render the same on server and client. */
  nowIso: string;
  outlets: FlowOutlet[];
  submissionId: string;
}) {
  const [state, formAction, pending] = useActionState<ShipmentDraftActionState, FormData>(saveShipmentDraft, {});
  const errors = state.errors ?? {};
  const errorEntries = Object.entries(errors);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.errors) summaryRef.current?.focus();
  }, [state]);

  const now = new Date(nowIso);
  const dateOptions = pickupDateOptions(now);

  // 1 Penyerahan & asal
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const [pickupAddressId, setPickupAddressId] = useState("");
  const [changingOrigin, setChangingOrigin] = useState(false);
  const pickup = effectivePickup(outlets, outletId, pickupAddressId);
  const outlet = outlets.find((candidate) => candidate.id === outletId) ?? null;
  const originChoices = outlets.flatMap((candidate) => candidate.pickupPoints.map((point) => ({ outlet: candidate, point })));
  const [handoverType, setHandoverType] = useState<HandoverType>("PICKUP");
  const [pickupDate, setPickupDate] = useState(dateOptions[0]?.value ?? "");
  const slots = availablePickupSlots(pickupDate, now);
  const [pickupSlot, setPickupSlot] = useState<string>(slots[0] ?? "");
  const effectiveSlot = slots.includes(pickupSlot as (typeof slots)[number]) ? pickupSlot : slots[0] ?? "";
  // T-232 / PR-90: optional; "" stores NULL.
  const [pickupVehicle, setPickupVehicle] = useState<PickupVehicle | "">("");

  // 2 Pengirim (masking) & penerima
  const [masking, setMasking] = useState(false);
  const [masked, setMasked] = useState({ address: "", name: "", phone: "" });
  const geraiSender = geraiSenderIdentity(gerai, pickup);
  const sender = masking ? masked : geraiSender;
  const [recipient, setRecipient] = useState({ address: "", name: "", phone: "" });
  const [recipientContact, setRecipientContact] = useState<ShipmentContactSelection | null>(null);
  const [destination, setDestination] = useState<Destination>({ mode: "empty" });

  // 3 Pembayaran — Non-COD is the default (spec 10 §5.1).
  const [cod, setCod] = useState(false);
  const [codOngkir, setCodOngkir] = useState(false);
  const paymentMethod: PaymentMethod = cod ? (codOngkir ? "COD_ONGKIR" : "COD") : "NON_COD";
  const [declaredValue, setDeclaredValue] = useState("");

  // 4 Produk & paket
  const [rows, setRows] = useState<ProductRowState[]>([{ key: 0, name: "", quantity: "1", weightKg: "" }]);
  const composed = composeProductRows(rows);
  const weightGrams = composeProductWeightGrams(rows);
  const [instruction, setInstruction] = useState("");
  const [landmark, setLandmark] = useState("");
  const [dimensions, setDimensions] = useState({ height: "", length: "", width: "" });
  const [hazardous, setHazardous] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const detailsHaveError = Boolean(errors.packageLengthCm || errors.packageWidthCm || errors.packageHeightCm || errors.recipientAddressLandmark);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const updateRow = (key: number, change: Partial<ProductRowState>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));

  const destinationLabel = destination.mode === "empty" ? null : destination.areaLabel;
  const destinationError = errors.destinationAreaLabel ?? errors.destinationAreaId ?? errors.recipientContactSelection;

  function applyRecipientContact(selection: ShipmentContactSelection) {
    setRecipientContact(selection);
    setRecipient({ address: selection.address, name: selection.name, phone: selection.phone });
    setDestination(selection.destinationAreaId && selection.destinationAreaLabel
      ? { areaId: selection.destinationAreaId, areaLabel: selection.destinationAreaLabel, mode: "contact" }
      : { mode: "empty" });
  }

  const fieldAnchor = (field: string) =>
    field === "form" ? "shipment-draft-errors"
      : field.startsWith("destinationArea") || field === "recipientContactSelection" ? "destination-search"
        : field === "packageContent" ? "product-0-name"
          : field === "packageQuantity" ? "product-0-quantity"
            : field === "packageWeightGrams" ? "product-0-weight"
              : field === "paymentType" ? "payment-method"
                : field.startsWith("sender") && !masking ? "sender-block"
                  : field;

  // T-249: section progress from the same required fields the form marks with *, nothing new.
  const missing = requiredFieldsMissing({
    destinationChosen: destination.mode !== "empty",
    declaredValue,
    handoverType,
    pickupDate,
    pickupReady: Boolean(pickup && outlet),
    pickupSlot: effectiveSlot,
    products: rows,
    recipient,
    sender,
  });
  const [focusedSection, setFocusedSection] = useState<number | null>(null);
  const states = flowSectionStates(missing.map((fields) => fields.length), focusedSection, true);
  const connectors = spineSegments(states);
  const completeCount = missing.filter((fields) => fields.length === 0).length;
  const progressLabel = `${completeCount}/${missing.length} bagian lengkap`;
  const guard = saveGuard(missing.map((fields) => fields.length));
  const checklist = FLOW_SECTIONS.map((candidate, index) => ({ ...candidate, missing: missing[index]?.length ?? 0, state: states[index] }));
  const railData: RailData = {
    destination: destinationLabel,
    moneyRows: [
      { amountIdr: parseRupiahOrNull(declaredValue), label: cod ? "Nilai barang" : "Nilai barang (asuransi)" },
      { amountIdr: null, label: "Ongkir" },
      ...(cod ? [{ amountIdr: null, label: `Biaya COD ${MENGANTAR_COD_FEE_RATE_LABEL}` }] : []),
    ],
    origin: pickup?.originAreaLabel ?? null,
    rows: [
      {
        label: "Tipe penyerahan",
        tone: "accent",
        value: handoverType === "PICKUP"
          ? `Pickup · ${effectiveSlot ? effectiveSlot.replace(":", ".") : "—"}${pickupVehicle ? ` · ${PICKUP_VEHICLE_LABELS[pickupVehicle]}` : ""}`
          : "Drop di outlet",
      },
      { label: "Ekspedisi", value: "—" },
      { label: "Pengirim di label", value: sender.name ? `${sender.name}${sender.phone ? ` (${sender.phone})` : ""}` : "—" },
      { label: "Berat & jumlah", value: `${weightGrams ? gramsToKilogramLabel(Number(weightGrams)) : "— kg"} (${composed.packageQuantity || "—"} barang)` },
      { label: "Metode bayar", tone: "accent", value: PAYMENT_METHOD_LABELS[paymentMethod] },
    ],
    source: "Estimasi",
    total: { amountIdr: null, label: cod ? "Total tagihan COD" : "Ongkir", note: "Tarif muncul setelah data disimpan" },
  };
  const section = (index: number) => ({
    aside: <SectionStatus missing={missing[index]?.length ?? 0} state={states[index]} />,
    connector: connectors[index],
    id: FLOW_SECTIONS[index].id,
    number: index + 1,
    state: states[index],
    title: FLOW_SECTIONS[index].title,
  });

  return (
    <>
    <FlowStepper steps={steps.map((step, index) => (index === 0 && step.state === "current" ? { ...step, progress: progressLabel } : step))} />
    <form
      aria-busy={pending}
      className="flex flex-col gap-6 pb-32 lg:pb-0"
      id="form-kiriman"
      noValidate
      onBlur={(event) => {
        // Focus left the form — unless it moved into a portalled Select/Popover of one of its sections.
        const next = event.relatedTarget as HTMLElement | null;
        if (!next || (!event.currentTarget.contains(next) && !next.closest("[data-slot$='-content']"))) setFocusedSection(null);
      }}
      onFocus={(event) => {
        const target = event.target as HTMLElement;
        if (!event.currentTarget.contains(target)) return; // a portalled Select/Popover keeps its section
        const id = target.closest("[data-flow-section]")?.getAttribute("data-flow-section");
        const index = FLOW_SECTIONS.findIndex((candidate) => candidate.id === id);
        setFocusedSection(index >= 0 && index < missing.length ? index : null);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <input name="submissionId" type="hidden" value={submissionId} />
      <input name="outletId" type="hidden" value={outletId} />
      <input name="pickupAddressId" type="hidden" value={pickup?.pickupAddressId ?? ""} />
      <input name="handoverType" type="hidden" value={handoverType} />
      <input name="pickupDate" type="hidden" value={handoverType === "PICKUP" ? pickupDate : ""} />
      <input name="pickupSlot" type="hidden" value={handoverType === "PICKUP" ? effectiveSlot : ""} />
      <input name="pickupVehicle" type="hidden" value={handoverType === "PICKUP" ? pickupVehicle : ""} />
      {masking ? null : (
        <>
          <input name="senderName" type="hidden" value={geraiSender.name} />
          <input name="senderPhone" type="hidden" value={geraiSender.phone} />
          <input name="senderAddress" type="hidden" value={geraiSender.address} />
        </>
      )}
      <input name="paymentType" type="hidden" value={paymentMethod} />
      <input name="packageContent" type="hidden" value={composed.packageContent} />
      <input name="packageQuantity" type="hidden" value={composed.packageQuantity} />
      <input name="packageWeightGrams" type="hidden" value={weightGrams} />
      <input name="isHazardous" type="hidden" value={hazardous ? "true" : "false"} />
      <input name="destinationMode" type="hidden" value={destination.mode} />
      <input name="destinationAreaId" type="hidden" value={destination.mode === "empty" ? "" : destination.areaId} />
      <input name="destinationAreaLabel" type="hidden" value={destination.mode === "empty" ? "" : destination.areaLabel} />
      {/* T-245: the shared DestinationAreaPicker posts areaId/areaLabel/areaQuery/areaOutletId (read in manual mode only). */}
      {recipientContact ? (
        <>
          <input name="recipientContactId" type="hidden" value={recipientContact.contactId} />
          <input name="recipientContactAddressId" type="hidden" value={recipientContact.addressId} />
          <input name="recipientContactUpdatedAt" type="hidden" value={recipientContact.contactUpdatedAt} />
          <input name="recipientContactAddressUpdatedAt" type="hidden" value={recipientContact.addressUpdatedAt} />
          <input name="recipientContactSnapshotName" type="hidden" value={recipientContact.name} />
          <input name="recipientContactSnapshotPhone" type="hidden" value={recipientContact.phone} />
          <input name="recipientContactSnapshotAddress" type="hidden" value={recipientContact.address} />
          <input name="recipientContactSnapshotDestinationAreaId" type="hidden" value={recipientContact.destinationAreaId ?? ""} />
          <input name="recipientContactSnapshotDestinationAreaLabel" type="hidden" value={recipientContact.destinationAreaLabel ?? ""} />
        </>
      ) : null}
      {confirmDuplicate ? <input name="confirmDuplicate" type="hidden" value="true" /> : null}

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-6">
          {errorEntries.length > 0 ? (
            <div
              className="flex flex-col gap-2 rounded-xl border border-destructive bg-card p-4 text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:ml-12"
              id="shipment-draft-errors"
              ref={summaryRef}
              role="alert"
              tabIndex={-1}
            >
              <p className="flex items-center gap-2 font-semibold"><CircleAlert aria-hidden="true" className="size-4" />Periksa {errorEntries.length} isian berikut</p>
              <ul className="list-disc pl-5 text-sm">
                {errorEntries.map(([field, message]) => (
                  <li key={field}><a className="underline underline-offset-4" href={`#${fieldAnchor(field)}`}>{message}</a></li>
                ))}
              </ul>
              {state.duplicateDetected ? (
                <label className="mt-1 flex items-start gap-2 rounded-lg bg-warn-surface p-3 text-sm text-foreground">
                  <input
                    checked={confirmDuplicate}
                    className="mt-1 size-4 shrink-0 accent-primary"
                    onChange={(event) => setConfirmDuplicate(event.target.checked)}
                    type="checkbox"
                  />
                  Saya yakin ini bukan kiriman ganda, tetap buat kiriman ini.
                </label>
              ) : null}
            </div>
          ) : null}

          {/* 1 — Penyerahan & asal */}
          <SectionCard {...section(0)}>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Tipe penyerahan paket<Required /></legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <OptionCard
                  checked={handoverType === "PICKUP"}
                  description="Kurir menjemput paket di titik pickup pada jadwal yang dipilih."
                  icon={<Truck aria-hidden="true" className="size-5" />}
                  name="handoverChoice"
                  onSelect={() => setHandoverType("PICKUP")}
                  value="PICKUP"
                >
                  {HANDOVER_TYPE_LABELS.PICKUP}
                </OptionCard>
                <OptionCard
                  checked={handoverType === "DROP_OFF"}
                  description="Paket diantar sendiri ke outlet ekspedisi terdekat."
                  icon={<Store aria-hidden="true" className="size-5" />}
                  name="handoverChoice"
                  onSelect={() => setHandoverType("DROP_OFF")}
                  value="DROP_OFF"
                >
                  {HANDOVER_TYPE_LABELS.DROP_OFF}
                </OptionCard>
              </div>
              <FieldError id="handoverType-error" message={errors.handoverType} />
            </fieldset>

            <InsetBlock>
              <div className="flex items-center justify-between gap-2 border-b pb-2.5">
                <SubBlockTitle>{handoverType === "PICKUP" ? "Alamat penjemputan" : "Asal kiriman"}</SubBlockTitle>
                {originChoices.length > 1 ? (
                  <Button
                    aria-controls="origin-choice"
                    aria-expanded={changingOrigin}
                    className="h-10 px-0 font-semibold max-md:h-11"
                    onClick={() => setChangingOrigin((open) => !open)}
                    type="button"
                    variant="link"
                  >
                    {changingOrigin ? "Selesai" : "Ubah"}
                  </Button>
                ) : null}
              </div>
              {pickup && outlet ? (
                <div className="flex flex-col gap-1" id="outletId">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    <MapPin aria-hidden="true" className="size-4 text-muted-foreground" />
                    {outlet.name}
                    {pickup.isDefault ? <span className="rounded-sm bg-card px-1.5 text-xs font-medium text-muted-foreground">Utama</span> : null}
                  </p>
                  <p className="text-sm wrap-anywhere">{pickup.pickupAddressLabel}</p>
                  <p className="text-xs text-muted-foreground">{pickup.originAreaLabel}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Titik pickup belum dipilih.</p>
              )}
              {changingOrigin ? (
                <fieldset className="flex flex-col gap-2 border-t pt-3" id="origin-choice">
                  <legend className="sr-only">Pilih outlet dan titik pickup</legend>
                  {originChoices.map(({ outlet: choiceOutlet, point }) => {
                    const checked = choiceOutlet.id === outletId && point.pickupAddressId === pickup?.pickupAddressId;
                    return (
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-sm",
                          checked && "border-primary bg-accent",
                        )}
                        key={`${choiceOutlet.id}:${point.pickupAddressId}`}
                      >
                        <input
                          checked={checked}
                          className="mt-1 size-4 accent-primary"
                          name="originChoice"
                          onChange={() => {
                            if (choiceOutlet.id !== outletId) setDestination({ mode: "empty" });
                            setOutletId(choiceOutlet.id);
                            setPickupAddressId(point.pickupAddressId);
                          }}
                          type="radio"
                        />
                        <span className="flex flex-col">
                          <span className="font-semibold">{choiceOutlet.name}</span>
                          <span className="wrap-anywhere">{point.pickupAddressLabel}</span>
                          <span className="text-xs text-muted-foreground">{point.originAreaLabel}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}
              <FieldError id="outletId-error" message={errors.outletId ?? errors.pickupAddressId} />
            </InsetBlock>

            {handoverType === "PICKUP" ? (
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField error={errors.pickupDate} htmlFor="pickupDate" label="Tanggal penjemputan" required>
                    <Select onValueChange={setPickupDate} value={pickupDate}>
                      <SelectTrigger
                        aria-describedby={errors.pickupDate ? "pickupDate-error" : undefined}
                        aria-invalid={Boolean(errors.pickupDate)}
                        className="w-full text-left *:data-[slot=select-value]:flex-1"
                        id="pickupDate"
                      >
                        <CalendarDays aria-hidden="true" className="text-muted-foreground" />
                        <SelectValue>{dateOptions.find((option) => option.value === pickupDate)?.label}</SelectValue>
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {dateOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField error={errors.pickupSlot} htmlFor="pickupSlot" label="Jam penjemputan" required>
                    <Select onValueChange={setPickupSlot} value={effectiveSlot}>
                      <SelectTrigger
                        aria-describedby={errors.pickupSlot ? "pickupSlot-error" : undefined}
                        aria-invalid={Boolean(errors.pickupSlot)}
                        className="w-full text-left *:data-[slot=select-value]:flex-1"
                        id="pickupSlot"
                      >
                        <Clock aria-hidden="true" className="text-muted-foreground" />
                        <SelectValue>{effectiveSlot ? pickupSlotLabel(effectiveSlot) : null}</SelectValue>
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {slots.map((slot) => <SelectItem key={slot} value={slot}>{pickupSlotLabel(slot)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>
                <fieldset className="mt-2.5 flex flex-col gap-2">
                  <legend className="sr-only">Kendaraan penjemputan (opsional)</legend>
                  <div className="flex min-h-5 items-center justify-between gap-2 max-md:min-h-11">
                    <span aria-hidden="true" className="text-sm font-medium">
                      Kendaraan penjemputan <span className="font-normal text-muted-foreground">(opsional)</span>
                    </span>
                    {pickupVehicle ? (
                      <Button className="h-5 px-0 font-semibold max-md:h-11" onClick={() => setPickupVehicle("")} type="button" variant="link">
                        Kosongkan
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {PICKUP_VEHICLES.map((vehicle) => {
                      const Icon = PICKUP_VEHICLE_ICONS[vehicle];
                      return (
                        <OptionCard
                          checked={pickupVehicle === vehicle}
                          icon={<Icon aria-hidden="true" className="size-5" />}
                          key={vehicle}
                          name="pickupVehicleChoice"
                          onSelect={() => setPickupVehicle(vehicle)}
                          value={vehicle}
                      >
                          {PICKUP_VEHICLE_LABELS[vehicle]}
                        </OptionCard>
                      );
                    })}
                  </div>
                  <FieldError id="pickupVehicle-error" message={errors.pickupVehicle} />
                </fieldset>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info aria-hidden="true" className="size-4 shrink-0" />Jadwal dan kendaraan disimpan di GeraiCUAN, belum dikirim ke Mengantar.
                </p>
              </div>
            ) : null}
          </SectionCard>

          {/* 2 — Pengirim (masking) & penerima */}
          <SectionCard {...section(1)}>
            <InsetBlock className="gap-3.5">
              <div className="flex flex-col justify-between gap-2 border-b pb-2.5 sm:flex-row sm:items-center" id="sender-block" tabIndex={-1}>
                <div className="flex flex-wrap items-center gap-2">
                  <SubBlockTitle>Data pengirim (cetak di label)</SubBlockTitle>
                  <span className="rounded-sm bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground uppercase">Masking</span>
                </div>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold md:min-h-0">
                  <input
                    checked={masking}
                    className="size-4 accent-primary"
                    onChange={(event) => {
                      setMasking(event.target.checked);
                      if (event.target.checked && !masked.name && !masked.phone && !masked.address) {
                        setMasked({ address: pickup?.originAreaLabel ?? "", name: gerai.name, phone: gerai.phone ?? "" });
                      }
                    }}
                    type="checkbox"
                  />
                  Gunakan masking pengirim
                </label>
              </div>
              {masking ? (
                <>
                  <div className="flex justify-end">
                    <ContactSearch
                      onSelected={(selection) => setMasked({ address: selection.address, name: selection.name, phone: selection.phone })}
                      role="SENDER"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField error={errors.senderName} htmlFor="senderName" label="Nama pengirim di label" required>
                      <CharacterClassInput
                        aria-describedby={errors.senderName ? "senderName-error" : undefined}
                        aria-invalid={Boolean(errors.senderName)}
                        characterClass="BUSINESS_NAME"
                        className={controlClass}
                        id="senderName"
                        maxLength={120}
                        name="senderName"
                        onChange={(event) => setMasked((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Contoh: Batik Sekar Official"
                        value={masked.name}
                      />
                    </FormField>
                    <FormField error={errors.senderPhone} htmlFor="senderPhone" label="No. HP / WhatsApp di label" required>
                      <CharacterClassInput
                        aria-describedby={errors.senderPhone ? "senderPhone-error" : undefined}
                        aria-invalid={Boolean(errors.senderPhone)}
                        characterClass="PHONE"
                        className={cn(controlClass, "tabular-nums")}
                        id="senderPhone"
                        name="senderPhone"
                        onChange={(event) => setMasked((current) => ({ ...current, phone: event.target.value }))}
                        type="tel"
                        value={masked.phone}
                      />
                    </FormField>
                  </div>
                  <FormField error={errors.senderAddress} htmlFor="senderAddress" label="Kota / asal pengirim di label" required>
                    <CharacterClassInput
                      aria-describedby={errors.senderAddress ? "senderAddress-error" : undefined}
                      aria-invalid={Boolean(errors.senderAddress)}
                      characterClass="ADDRESS"
                      className={controlClass}
                      id="senderAddress"
                      maxLength={500}
                      name="senderAddress"
                      onChange={(event) => setMasked((current) => ({ ...current, address: event.target.value }))}
                      placeholder="Contoh: Kota Surabaya, Jawa Timur"
                      value={masked.address}
                    />
                  </FormField>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Info aria-hidden="true" className="size-4 shrink-0" />Ongkir dan penjemputan tetap dihitung dari titik pickup gerai.
                  </p>
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    {geraiSender.name}
                    <span className="text-muted-foreground">·</span>
                    <span className="font-normal tabular-nums text-muted-foreground">{geraiSender.phone || "WhatsApp gerai belum diisi"}</span>
                  </p>
                  <p className="text-sm wrap-anywhere">{geraiSender.address || "—"}</p>
                  {!geraiSender.phone ? (
                    <p className="text-xs text-warn">Lengkapi WhatsApp gerai di Pengaturan, atau gunakan masking pengirim.</p>
                  ) : null}
                  {[errors.senderName, errors.senderPhone, errors.senderAddress].filter(Boolean).map((message) => (
                    <p className="text-xs text-destructive" key={message}>{message}</p>
                  ))}
                </div>
              )}
            </InsetBlock>

            <div className="flex flex-col gap-4 pt-1">
              <div className="flex items-center justify-between gap-2 border-b pb-1">
                <SubBlockTitle>Data pelanggan (penerima)</SubBlockTitle>
                <ContactSearch onSelected={applyRecipientContact} role="RECIPIENT" />
              </div>
              {recipientContact ? (
                <p className="text-xs text-muted-foreground" role="status">Dari kontak tersimpan: {recipientContact.name}</p>
              ) : null}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField error={errors.recipientName} htmlFor="recipientName" label="Nama pelanggan" required>
                  <CharacterClassInput
                    aria-describedby={errors.recipientName ? "recipientName-error" : undefined}
                    aria-invalid={Boolean(errors.recipientName)}
                    autoComplete="off"
                    characterClass="PERSON_NAME"
                    className={controlClass}
                    id="recipientName"
                    maxLength={120}
                    name="recipientName"
                    onChange={(event) => setRecipient((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Contoh: Budi Santoso"
                    value={recipient.name}
                  />
                </FormField>
                <FormField error={errors.recipientPhone} htmlFor="recipientPhone" label="Nomor telepon" required>
                  <CharacterClassInput
                    aria-describedby={errors.recipientPhone ? "recipientPhone-error" : undefined}
                    aria-invalid={Boolean(errors.recipientPhone)}
                    autoComplete="off"
                    characterClass="PHONE"
                    className={cn(controlClass, "tabular-nums")}
                    id="recipientPhone"
                    name="recipientPhone"
                    onChange={(event) => setRecipient((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="08123456789"
                    type="tel"
                    value={recipient.phone}
                  />
                </FormField>
              </div>
              <FormField error={errors.recipientAddress} htmlFor="recipientAddress" label="Alamat lengkap penerima" required>
                <CharacterClassTextarea
                  aria-describedby={errors.recipientAddress ? "recipientAddress-error" : undefined}
                  aria-invalid={Boolean(errors.recipientAddress)}
                  characterClass="ADDRESS"
                  className={controlClass}
                  id="recipientAddress"
                  maxLength={500}
                  name="recipientAddress"
                  onChange={(event) => setRecipient((current) => ({ ...current, address: event.target.value }))}
                  placeholder="Jalan, nomor rumah, RT/RW, kelurahan"
                  rows={2}
                  value={recipient.address}
                />
              </FormField>
              <DestinationAreaPicker
                defaultArea={destination.mode === "contact" ? { areaId: destination.areaId, areaLabel: destination.areaLabel } : null}
                description={destinationLabel ? "Area dari database Mengantar; dicek ulang saat disimpan." : "Ketik kecamatan, kelurahan, kota atau kode pos, lalu pilih."}
                disabled={!outletId}
                error={destinationError}
                fixedOutletId={outletId}
                id="destination-search"
                // Remount on a new outlet or a new recipient contact: both replace the destination.
                key={`${outletId}:${recipientContact?.addressId ?? ""}`}
                onSelectionChange={(selection) => setDestination(selection ? { ...selection, mode: "manual" } : { mode: "empty" })}
                outlets={outlets.map((outlet) => ({ id: outlet.id, name: outlet.name }))}
                required
              />
            </div>
          </SectionCard>

          {/* 3 — Pembayaran */}
          <SectionCard {...section(2)}>
            <fieldset className="flex flex-col gap-2" id="payment-method" tabIndex={-1}>
              <legend className="mb-2 text-sm font-medium">Metode pembayaran<Required /></legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <OptionCard
                  checked={cod}
                  description={<span className="font-semibold">Biaya COD {MENGANTAR_COD_FEE_RATE_LABEL}</span>}
                  name="paymentChoice"
                  onSelect={() => setCod(true)}
                  value="COD"
                >
                  COD
                  <span className={cn("rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide uppercase", cod ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>Bayar di tempat</span>
                </OptionCard>
                <OptionCard
                  checked={!cod}
                  description="Barang sudah dibayar. Kurir tidak menagih apa pun ke penerima."
                  name="paymentChoice"
                  onSelect={() => setCod(false)}
                  value="NON_COD"
                >
                  Non-COD
                  <span className={cn("rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide uppercase", !cod ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>Transfer / lunas</span>
                </OptionCard>
              </div>
              <FieldError id="paymentType-error" message={errors.paymentType} />
            </fieldset>
            <InsetBlock>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium" htmlFor="declaredValue">
                  {cod ? (codOngkir ? "Nilai barang (sudah dibayar)" : "Nilai barang (Rp)") : "Nilai barang untuk asuransi (Rp)"}<Required />
                </label>
                {cod ? (
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border bg-card px-2 text-xs md:min-h-0 md:py-0.5">
                    <input checked={codOngkir} className="size-4 accent-primary" onChange={(event) => setCodOngkir(event.target.checked)} type="checkbox" />
                    <span className="font-semibold text-foreground">COD Ongkir</span>
                    <span className="text-muted-foreground">(kurir menagih ongkir + biaya COD)</span>
                  </label>
                ) : null}
              </div>
              <div className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-muted-foreground">Rp</span>
                <CharacterClassInput
                  aria-describedby={errors.declaredValue ? "declaredValue-error" : undefined}
                  aria-invalid={Boolean(errors.declaredValue)}
                  characterClass="RUPIAH"
                  className="pl-10 text-sm font-bold tabular-nums"
                  id="declaredValue"
                  name="declaredValue"
                  onChange={(event) => setDeclaredValue(event.target.value)}
                  placeholder="0"
                  value={declaredValue}
                />
              </div>
              <FieldError id="declaredValue-error" message={errors.declaredValue} />
              {cod ? (
                <p className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {codOngkir ? `Nilai COD = ongkir + biaya COD ${MENGANTAR_COD_FEE_RATE_LABEL}, dihitung otomatis` : `Biaya COD ${MENGANTAR_COD_FEE_RATE_LABEL} dari total tagihan`}
                  </span>
                  <span className="font-semibold text-muted-foreground">Setelah cek tarif</span>
                </p>
              ) : null}
            </InsetBlock>
          </SectionCard>

          {/* 4 — Produk & paket */}
          <SectionCard {...section(3)}>
            <ul aria-label="Daftar produk" className="flex flex-col gap-3">
              {rows.map((row, index) => {
                const first = index === 0;
                const suffix = rows.length > 1 ? ` ${index + 1}` : "";
                return (
                  <li className="rounded-lg border bg-muted/60 p-3.5" key={row.key}>
                    <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-12">
                      <div className="flex flex-col gap-1.5 md:col-span-6">
                        <label className="text-sm font-medium" htmlFor={`product-${index}-name`}>Nama produk<span className="sr-only">{suffix}</span><Required /></label>
                        <CharacterClassInput
                        aria-invalid={first && Boolean(errors.packageContent)}
                          autoComplete="off"
                          characterClass="FREE_TEXT"
                          className={controlClass}
                          id={`product-${index}-name`}
                          onChange={(event) => updateRow(row.key, { name: event.target.value })}
                          placeholder={first ? "Contoh: Kemeja batik L" : undefined}
                          value={row.name}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <label className="text-sm font-medium" htmlFor={`product-${index}-quantity`}>Jumlah<span className="sr-only">{suffix}</span><Required /></label>
                        <CharacterClassInput
                        aria-invalid={first && Boolean(errors.packageQuantity)}
                          characterClass="NUMERIC_INTEGER"
                          className={cn(controlClass, "tabular-nums")}
                          id={`product-${index}-quantity`}
                          onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                          value={row.quantity}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 md:col-span-3">
                        <label className="text-sm font-medium" htmlFor={`product-${index}-weight`}>Berat (kg)<span className="sr-only">{suffix}</span><Required /></label>
                        <div className="relative">
                          <Input
                            aria-invalid={first && Boolean(errors.packageWeightGrams)}
                            className={cn(controlClass, "pr-9 tabular-nums")}
                            id={`product-${index}-weight`}
                            inputMode="decimal"
                            onChange={(event) => updateRow(row.key, { weightKg: event.target.value.replace(/[^\d.,]/g, "") })}
                            placeholder="0,5"
                            value={row.weightKg}
                          />
                          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground">kg</span>
                        </div>
                      </div>
                      <div className="flex md:col-span-1 md:justify-end">
                        {rows.length > 1 ? (
                          <Button
                            aria-label={`Hapus ${row.name.trim() || `produk ${index + 1}`}`}
                            onClick={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {[errors.packageContent, errors.packageQuantity, errors.packageWeightGrams].filter(Boolean).map((message) => (
              <p className="text-xs text-destructive" key={message}>{message}</p>
            ))}
            <button
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-accent/40"
              onClick={() => setRows((current) => [...current, { key: Math.max(...current.map((row) => row.key)) + 1, name: "", quantity: "1", weightKg: "" }])}
              type="button"
            >
              <Plus aria-hidden="true" className="size-4" />Tambah produk
            </button>
            <p aria-live="polite" className="text-xs text-muted-foreground wrap-anywhere">
              Total <span className="font-semibold text-foreground tabular-nums">{composed.packageQuantity || "—"} barang</span>
              {" · "}<span className="font-semibold text-foreground tabular-nums">{weightGrams ? gramsToKilogramLabel(Number(weightGrams)) : "— kg"}</span>
              {" · "}
              <span className={cn("tabular-nums", composed.packageContent.length > MAX_CONTENT_LENGTH && "font-semibold text-destructive")}>
                isi label {composed.packageContent.length}/{MAX_CONTENT_LENGTH} karakter
              </span>
            </p>

            <FormField error={errors.shippingInstruction} htmlFor="shippingInstruction" label={<>Instruksi pengiriman <span className="text-xs font-normal text-muted-foreground">(opsional)</span></>}>
              <CharacterClassInput
                aria-describedby={errors.shippingInstruction ? "shippingInstruction-error" : undefined}
                aria-invalid={Boolean(errors.shippingInstruction)}
                characterClass="FREE_TEXT"
                className={controlClass}
                id="shippingInstruction"
                maxLength={500}
                name="shippingInstruction"
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="Contoh: Jangan dibanting"
                value={instruction}
              />
            </FormField>

            <Collapsible onOpenChange={setDetailsOpen} open={detailsOpen || detailsHaveError}>
              <CollapsibleTrigger asChild>
                <Button className="h-10 px-0 font-semibold max-md:h-11" type="button" variant="link">
                  <ArrowRight aria-hidden="true" className={cn("transition-transform", (detailsOpen || detailsHaveError) && "rotate-90")} />
                  Detail tambahan
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-4 pt-3">
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1.5 text-sm font-medium">Dimensi paket (cm) <span className="text-xs font-normal text-muted-foreground">(opsional, isi ketiganya)</span></legend>
                  <div className="grid grid-cols-3 gap-3 sm:max-w-md">
                    {([["packageLengthCm", "Panjang", "length"], ["packageWidthCm", "Lebar", "width"], ["packageHeightCm", "Tinggi", "height"]] as const).map(([field, label, key]) => (
                      <div className="flex flex-col gap-1" key={field}>
                        <label className="text-xs text-muted-foreground" htmlFor={field}>{label}</label>
                        <CharacterClassInput
                        aria-invalid={Boolean(errors[field])}
                          characterClass="NUMERIC_INTEGER"
                          className={cn(controlClass, "tabular-nums")}
                          id={field}
                          name={field}
                          onChange={(event) => setDimensions((current) => ({ ...current, [key]: event.target.value }))}
                          value={dimensions[key]}
                        />
                      </div>
                    ))}
                  </div>
                  <FieldError id="dimensions-error" message={errors.packageLengthCm ?? errors.packageWidthCm ?? errors.packageHeightCm} />
                </fieldset>
                <FormField error={errors.recipientAddressLandmark} htmlFor="recipientAddressLandmark" label={<>Patokan rumah penerima <span className="text-xs font-normal text-muted-foreground">(opsional)</span></>}>
                  <CharacterClassInput
                    aria-invalid={Boolean(errors.recipientAddressLandmark)}
                    characterClass="ADDRESS"
                    className={controlClass}
                    id="recipientAddressLandmark"
                    maxLength={160}
                    name="recipientAddressLandmark"
                    onChange={(event) => setLandmark(event.target.value)}
                    placeholder="Contoh: seberang masjid, pagar hijau"
                    value={landmark}
                  />
                </FormField>
                <label className="flex items-start gap-3">
                  <input checked={hazardous} className="mt-1 size-4 shrink-0 accent-primary" onChange={(event) => setHazardous(event.target.checked)} type="checkbox" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Barang berbahaya</span>
                    <span className="text-xs text-muted-foreground">Baterai lithium, aerosol, cairan mudah terbakar, atau bahan kimia.</span>
                  </span>
                </label>
                {hazardous ? (
                  <p className="flex items-start gap-2 rounded-lg bg-warn-surface p-3 text-xs text-warn" role="status">
                    <CircleAlert aria-hidden="true" className="size-4 shrink-0" />Sebagian layanan menolak barang berbahaya; pilih layanan yang menerimanya.
                  </p>
                ) : null}
              </CollapsibleContent>
            </Collapsible>
          </SectionCard>

          {/* 5 — Layanan: empty until the draft is saved and priced */}
          <SectionCard {...section(4)}>
            <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center">
              <Truck aria-hidden="true" className="size-6 text-muted-foreground" />
              <p className="text-sm font-semibold">Tarif muncul setelah data disimpan</p>
              <p className="text-xs text-muted-foreground">Tekan “Simpan &amp; cek tarif” untuk melihat layanan tiap kurir.</p>
            </div>
          </SectionCard>
        </div>

        <RailColumn>
          <SummaryRail
            actions={(
              <>
                <Button aria-describedby="save-guard" className="w-full" disabled={pending} size="lg" type="submit">
                  {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                  {pending ? "Menyimpan draf…" : "Simpan & cek tarif"}
                </Button>
                <p className="line-clamp-2 text-center text-xs text-muted-foreground" id="save-guard">
                  {guard.text}
                  {guard.hidden ? <span className="sr-only"> ({guard.hidden})</span> : null}
                </p>
              </>
            )}
            progress={<FillChecklist items={checklist} />}
            {...railData}
          />
        </RailColumn>
      </div>

      <MobileActionBar
        actions={(
          <Button disabled={pending} size="lg" type="submit">
            {pending ? "Menyimpan…" : "Simpan & cek tarif"}
          </Button>
        )}
        caption={`${PAYMENT_METHOD_LABELS[paymentMethod]} · ${destinationLabel ?? "tujuan belum dipilih"}`}
        progress={progressLabel}
        summary={railData}
        total={null}
      />
    </form>
    </>
  );
}

function parseRupiahOrNull(value: string) {
  const digits = value.replace(/[.\s]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : null;
}
