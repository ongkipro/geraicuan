import "server-only";

import { characterClassError, normalizeFieldText, partyNameClass } from "@/lib/field-character-classes";
import { isPaymentMethod, type PaymentMethod } from "@/lib/payment-method";
import { checkPickupSchedule, isHandoverType, isPickupVehicle, normalizePartyPhone, type HandoverType, type PickupVehicle } from "@/lib/shipment-draft-logic";

const MAX_ADDRESS_LENGTH = 500;
const MAX_AREA_ID_LENGTH = 160;
const MAX_AREA_LABEL_LENGTH = 160;
// T-225: moved to the client-safe logic module so the sign-up form checks with the server's rule.
export { normalizePartyPhone };

const MAX_CONTENT_LENGTH = 240;
const MAX_DIMENSION_CM = 1_000;
const MAX_INSTRUCTION_LENGTH = 500;
const MAX_LANDMARK_LENGTH = 160;
const MAX_NAME_LENGTH = 120;
const MAX_QUANTITY = 1_000;
const MAX_VALUE_IDR = 2_147_483_647;
const MAX_WEIGHT_GRAMS = 100_000;

const DIMENSION_LABELS = {
  packageHeightCm: "Tinggi paket",
  packageLengthCm: "Panjang paket",
  packageWidthCm: "Lebar paket",
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_AREA_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SAFE_AREA_LABEL_PATTERN = /^[^\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]+$/u;

export const GRAMS_PER_KILOGRAM = 1_000;
/** Couriers bill whole kilograms and never less than one. */
export const MIN_BILLABLE_WEIGHT_KG = 1;

export class ShipmentWeightUnavailableError extends Error {
  constructor() {
    super("Shipment weight cannot be converted to a billable weight.");
  }
}

/**
 * The one grams -> kilograms rule for every provider call. Rounding up against a
 * 1 kg floor is how couriers bill, and it is what stops a 1 g draft from being
 * priced and ordered as `weight: 0.001`.
 */
export function toBillableWeightKg(weightGrams: number) {
  if (
    !Number.isSafeInteger(weightGrams)
    || weightGrams < 1
    || weightGrams > MAX_WEIGHT_GRAMS
  ) {
    throw new ShipmentWeightUnavailableError();
  }

  return Math.max(
    MIN_BILLABLE_WEIGHT_KG,
    Math.ceil(weightGrams / GRAMS_PER_KILOGRAM),
  );
}

export type ShipmentDraftInput = {
  declaredValueIdr: number;
  destinationAreaId: string;
  destinationAreaLabel: string;
  /**
   * True only when the area was re-checked against the outlet's Mengantar
   * account during this submission. A draft stored without it is explicitly
   * unverified and cannot be submitted to the provider.
   */
  destinationAreaVerified: boolean;
  /** True for COD and COD Ongkir: the courier collects cash. */
  isCod: boolean;
  isHazardous: boolean;
  outletId: string;
  /** T-186 / PR-64: how the shipment is paid; `isCod` is derived from it. */
  paymentMethod: PaymentMethod;
  packageContent: string;
  packageHeightCm: number | null;
  packageLengthCm: number | null;
  packageQuantity: number;
  packageWeightGrams: number;
  packageWidthCm: number | null;
  /**
   * T-157: which of the outlet's pickup points this shipment leaves from.
   * `null` means "whatever the outlet default is"; the repository resolves and
   * authorizes the value server-side, so a forged id never reaches the provider.
   */
  pickupAddressId: string | null;
  recipientAddress: string;
  recipientAddressLandmark: string | null;
  recipientName: string;
  recipientPhone: string;
  senderAddress: string;
  senderName: string;
  senderPhone: string;
  shippingInstruction: string | null;
  /**
   * T-211 / PR-70: how the parcel reaches the courier, and for pickup the WIB date and
   * one-hour slot start ("09:00"). Stored and shown only — not sent to Mengantar until
   * T-153 verifies the order contract. Absent (null) on drafts that predate it.
   */
  handoverType?: HandoverType | null;
  pickupDate?: string | null;
  pickupSlot?: string | null;
  /** T-232 / PR-90: optional pickup vehicle; always null unless the handover is PICKUP. */
  pickupVehicle?: PickupVehicle | null;
};

export type ShipmentDraftField =
  | "declaredValue"
  | "destinationAreaId"
  | "destinationAreaLabel"
  | "handoverType"
  | "outletId"
  | "packageContent"
  | "packageHeightCm"
  | "packageLengthCm"
  | "packageQuantity"
  | "packageWeightGrams"
  | "packageWidthCm"
  | "paymentType"
  | "pickupAddressId"
  | "pickupDate"
  | "pickupSlot"
  | "pickupVehicle"
  | "recipientAddress"
  | "recipientAddressLandmark"
  | "recipientName"
  | "recipientPhone"
  | "senderAddress"
  | "senderName"
  | "senderPhone"
  | "shippingInstruction";

export type ShipmentDraftValidation =
  | { input: ShipmentDraftInput; ok: true }
  | { errors: Partial<Record<ShipmentDraftField, string>>; ok: false };

function readText(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? normalizeFieldText(value) : "";
}

/**
 * The national significant number of an already-canonical phone: `081234…` → `81234…`.
 * Comparisons use this because rows stored before the canonical rule (and party
 * snapshots, which are immutable by contract) may still read `+6281234…`.
 */
export function partyPhoneNationalNumber(canonicalPhone: string) {
  return canonicalPhone.replace(/^0/, "");
}

function readWholeNumber(value: string) {
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

function readRupiah(value: string) {
  if (!/^\d{1,3}(?:[.\s]\d{3})*$/.test(value) && !/^\d+$/.test(value)) {
    return Number.NaN;
  }

  return Number(value.replace(/[.\s]/g, ""));
}

export function validateShipmentDraft(formData: FormData, now: Date = new Date()): ShipmentDraftValidation {
  const raw = {
    declaredValue: readText(formData, "declaredValue"),
    destinationAreaId: readText(formData, "destinationAreaId"),
    destinationAreaLabel: readText(formData, "destinationAreaLabel"),
    outletId: readText(formData, "outletId"),
    packageContent: readText(formData, "packageContent"),
    packageHeightCm: readText(formData, "packageHeightCm"),
    packageLengthCm: readText(formData, "packageLengthCm"),
    packageQuantity: readText(formData, "packageQuantity"),
    packageWeightGrams: readText(formData, "packageWeightGrams"),
    packageWidthCm: readText(formData, "packageWidthCm"),
    pickupAddressId: readText(formData, "pickupAddressId"),
    recipientAddress: readText(formData, "recipientAddress"),
    recipientAddressLandmark: readText(formData, "recipientAddressLandmark"),
    recipientName: readText(formData, "recipientName"),
    recipientPhone: readText(formData, "recipientPhone"),
    senderAddress: readText(formData, "senderAddress"),
    senderName: readText(formData, "senderName"),
    senderPhone: readText(formData, "senderPhone"),
    shippingInstruction: readText(formData, "shippingInstruction"),
  };
  const errors: Partial<Record<ShipmentDraftField, string>> = {};
  const paymentType = readText(formData, "paymentType");
  if (!raw.outletId || !UUID_PATTERN.test(raw.outletId)) {
    errors.outletId = "Pilih outlet asal.";
  }
  if (
    !raw.destinationAreaId
    || raw.destinationAreaId.length > MAX_AREA_ID_LENGTH
    || !PROVIDER_AREA_ID_PATTERN.test(raw.destinationAreaId)
  ) {
    errors.destinationAreaId = "Pilih area tujuan yang valid.";
  }
  if (
    !raw.destinationAreaLabel
    || raw.destinationAreaLabel.length > MAX_AREA_LABEL_LENGTH
    || !SAFE_AREA_LABEL_PATTERN.test(raw.destinationAreaLabel)
  ) {
    errors.destinationAreaLabel = "Nama area tujuan wajib diisi dan maksimal 160 karakter.";
  }

  // T-196: every field also has a character class. The class message wins over
  // the generic shape message, so the operator learns what to remove.
  const classError = (
    field: ShipmentDraftField & keyof typeof raw,
    kind: Parameters<typeof characterClassError>[0],
    label: string,
  ) => {
    const message = characterClassError(kind, label, raw[field]);
    if (message) errors[field] = message;
    return message !== null;
  };

  // A sender may be a store ("Gerai 88"); a recipient is a person.
  for (const [field, label, isSender] of [["senderName", "Nama pengirim", true], ["recipientName", "Nama penerima", false]] as const) {
    if (!raw[field] || raw[field].length > MAX_NAME_LENGTH) {
      errors[field] = "Nama wajib diisi dan maksimal 120 karakter.";
    } else {
      classError(field, partyNameClass({ isSender }), label);
    }
  }

  for (const [field, label] of [["senderAddress", "Alamat pengirim"], ["recipientAddress", "Alamat penerima"]] as const) {
    if (!raw[field] || raw[field].length > MAX_ADDRESS_LENGTH) {
      errors[field] = "Alamat wajib diisi dan maksimal 500 karakter.";
    } else {
      classError(field, "ADDRESS", label);
    }
  }

  const senderPhone = normalizePartyPhone(raw.senderPhone);
  const recipientPhone = normalizePartyPhone(raw.recipientPhone);
  if (!classError("senderPhone", "PHONE", "Nomor telepon pengirim") && !senderPhone) {
    errors.senderPhone = "Nomor telepon pengirim tidak valid.";
  }
  if (!classError("recipientPhone", "PHONE", "Nomor telepon penerima") && !recipientPhone) {
    errors.recipientPhone = "Nomor telepon penerima tidak valid.";
  }

  if (!raw.packageContent || raw.packageContent.length > MAX_CONTENT_LENGTH) {
    errors.packageContent = "Isi paket wajib diisi dan maksimal 240 karakter.";
  } else {
    classError("packageContent", "FREE_TEXT", "Isi paket");
  }

  // Operational free text Mengantar's own order form collects. Optional, but
  // never blank-but-present, and never carrying control or bidi characters
  // into a provider payload or a printed label.
  const optionalText = (
    field: "recipientAddressLandmark" | "shippingInstruction",
    maxLength: number,
    message: string,
    label: string,
  ) => {
    const value = raw[field];
    if (value === "") return null;
    if (value.length > maxLength || !SAFE_AREA_LABEL_PATTERN.test(value)) {
      errors[field] = message;
      return null;
    }
    return classError(field, field === "recipientAddressLandmark" ? "ADDRESS" : "FREE_TEXT", label)
      ? null
      : value;
  };
  const shippingInstruction = optionalText(
    "shippingInstruction",
    MAX_INSTRUCTION_LENGTH,
    "Instruksi pengiriman maksimal 500 karakter tanpa karakter kontrol.",
    "Instruksi pengiriman",
  );
  const recipientAddressLandmark = optionalText(
    "recipientAddressLandmark",
    MAX_LANDMARK_LENGTH,
    "Patokan rumah maksimal 160 karakter tanpa karakter kontrol.",
    "Patokan rumah",
  );

  const isHazardous = readText(formData, "isHazardous") === "true";

  // An empty field is "use the outlet default": the shape is checked here, but
  // only the repository decides whether the id is one this outlet may use.
  let pickupAddressId: string | null = null;
  if (raw.pickupAddressId !== "") {
    if (
      raw.pickupAddressId.length > MAX_AREA_ID_LENGTH
      || !PROVIDER_AREA_ID_PATTERN.test(raw.pickupAddressId)
    ) {
      errors.pickupAddressId = "Pilih titik pickup yang valid.";
    } else {
      pickupAddressId = raw.pickupAddressId;
    }
  }

  const packageWeightGrams = readWholeNumber(raw.packageWeightGrams);
  if (classError("packageWeightGrams", "NUMERIC_INTEGER", "Berat paket")) {
    // The class message already names the problem.
  } else if (
    !Number.isSafeInteger(packageWeightGrams) ||
    packageWeightGrams < 1 ||
    packageWeightGrams > MAX_WEIGHT_GRAMS
  ) {
    errors.packageWeightGrams = "Berat paket harus 1–100.000 gram.";
  }

  const packageQuantity = readWholeNumber(raw.packageQuantity);
  if (classError("packageQuantity", "NUMERIC_INTEGER", "Jumlah paket")) {
    // The class message already names the problem.
  } else if (
    !Number.isSafeInteger(packageQuantity) ||
    packageQuantity < 1 ||
    packageQuantity > MAX_QUANTITY
  ) {
    errors.packageQuantity = "Jumlah paket harus 1–1.000.";
  }

  const dimensionFields = [
    "packageLengthCm",
    "packageWidthCm",
    "packageHeightCm",
  ] as const;
  const hasDimensions = dimensionFields.some((field) => raw[field] !== "");
  const dimensions: Record<(typeof dimensionFields)[number], number | null> = {
    packageHeightCm: null,
    packageLengthCm: null,
    packageWidthCm: null,
  };
  if (hasDimensions) {
    for (const field of dimensionFields) {
      const value = readWholeNumber(raw[field]);
      if (classError(field, "NUMERIC_INTEGER", DIMENSION_LABELS[field])) {
        // The class message already names the problem.
      } else if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DIMENSION_CM) {
        errors[field] = "Isi panjang, lebar, dan tinggi sekaligus, atau kosongkan ketiganya.";
      } else {
        dimensions[field] = value;
      }
    }
  }

  const declaredValueIdr = readRupiah(raw.declaredValue);
  if (classError("declaredValue", "RUPIAH", "Nilai barang")) {
    // The class message already names the problem.
  } else if (
    !Number.isSafeInteger(declaredValueIdr) ||
    declaredValueIdr < 0 ||
    declaredValueIdr > MAX_VALUE_IDR
  ) {
    errors.declaredValue = "Nilai barang harus berupa rupiah bulat yang valid.";
  } else if (paymentType === "COD" && declaredValueIdr === 0) {
    errors.declaredValue = "Nilai barang COD harus lebih dari Rp0.";
  } else if (paymentType === "COD_ONGKIR" && declaredValueIdr === 0) {
    errors.declaredValue = "Nilai barang untuk COD Ongkir harus lebih dari Rp0.";
  }

  // T-211 / PR-70: optional for callers that predate it (absent = not recorded); when given,
  // a pickup needs a date inside the window and a slot still ≥ 90 minutes ahead.
  const handoverValue = readText(formData, "handoverType");
  let handoverType: HandoverType | null = null;
  let pickupDate: string | null = null;
  let pickupSlot: string | null = null;
  let pickupVehicle: PickupVehicle | null = null;
  if (handoverValue !== "") {
    if (!isHandoverType(handoverValue)) {
      errors.handoverType = "Pilih tipe penyerahan paket: Penjemputan terjadwal atau Drop di outlet.";
    } else {
      handoverType = handoverValue;
      if (handoverType === "PICKUP") {
        const date = readText(formData, "pickupDate");
        const slot = readText(formData, "pickupSlot");
        const scheduleError = checkPickupSchedule(date, slot, now);
        if (scheduleError === "date") {
          errors.pickupDate = "Pilih tanggal penjemputan (hari ini sampai 6 hari ke depan).";
        } else if (scheduleError === "slot") {
          errors.pickupSlot = "Pilih jam penjemputan 09.00–18.00 WIB, paling cepat 90 menit dari sekarang.";
        } else {
          pickupDate = date;
          pickupSlot = slot;
        }
        // T-232: optional; absent stores NULL. A value for a drop-off is ignored, like its schedule.
        const vehicle = readText(formData, "pickupVehicle");
        if (vehicle !== "") {
          if (isPickupVehicle(vehicle)) pickupVehicle = vehicle;
          else errors.pickupVehicle = "Pilih kendaraan penjemputan: Motor, Mobil, atau Truk.";
        }
      }
    }
  }

  if (!isPaymentMethod(paymentType)) {
    errors.paymentType = "Pilih metode pembayaran: Non-COD, COD, atau COD Ongkir.";
  }

  if (
    Object.keys(errors).length > 0
    || !senderPhone
    || !recipientPhone
    || !isPaymentMethod(paymentType)
  ) {
    return { errors, ok: false };
  }

  return {
    input: {
      declaredValueIdr,
      destinationAreaId: raw.destinationAreaId,
      destinationAreaLabel: raw.destinationAreaLabel,
      // Form validation never contacts the provider, so the area starts
      // unverified; the caller flips it after re-checking with Mengantar.
      destinationAreaVerified: false,
      handoverType,
      isCod: paymentType !== "NON_COD",
      isHazardous,
      outletId: raw.outletId,
      packageContent: raw.packageContent,
      packageHeightCm: dimensions.packageHeightCm,
      packageLengthCm: dimensions.packageLengthCm,
      packageQuantity,
      packageWeightGrams,
      packageWidthCm: dimensions.packageWidthCm,
      paymentMethod: paymentType,
      pickupAddressId,
      pickupDate,
      pickupSlot,
      pickupVehicle,
      recipientAddress: raw.recipientAddress,
      recipientAddressLandmark,
      recipientName: raw.recipientName,
      recipientPhone,
      senderAddress: raw.senderAddress,
      senderName: raw.senderName,
      senderPhone,
      shippingInstruction,
    },
    ok: true,
  };
}
