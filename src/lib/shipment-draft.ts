import "server-only";

const MAX_ADDRESS_LENGTH = 500;
const MAX_AREA_ID_LENGTH = 160;
const MAX_AREA_LABEL_LENGTH = 160;
const MAX_CONTENT_LENGTH = 240;
const MAX_DIMENSION_CM = 1_000;
const MAX_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 16;
const MAX_QUANTITY = 1_000;
const MAX_VALUE_IDR = 2_147_483_647;
const MAX_WEIGHT_GRAMS = 100_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_AREA_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SAFE_AREA_LABEL_PATTERN = /^[^\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]+$/u;

export type ShipmentDraftInput = {
  declaredValueIdr: number;
  destinationAreaId: string;
  destinationAreaLabel: string;
  isCod: boolean;
  outletId: string;
  packageContent: string;
  packageHeightCm: number | null;
  packageLengthCm: number | null;
  packageQuantity: number;
  packageWeightGrams: number;
  packageWidthCm: number | null;
  recipientAddress: string;
  recipientName: string;
  recipientPhone: string;
  senderAddress: string;
  senderName: string;
  senderPhone: string;
};

export type ShipmentDraftField =
  | "declaredValue"
  | "destinationAreaId"
  | "destinationAreaLabel"
  | "outletId"
  | "packageContent"
  | "packageHeightCm"
  | "packageLengthCm"
  | "packageQuantity"
  | "packageWeightGrams"
  | "packageWidthCm"
  | "paymentType"
  | "recipientAddress"
  | "recipientName"
  | "recipientPhone"
  | "senderAddress"
  | "senderName"
  | "senderPhone";

export type ShipmentDraftValidation =
  | { input: ShipmentDraftInput; ok: true }
  | { errors: Partial<Record<ShipmentDraftField, string>>; ok: false };

function readText(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export function normalizePartyPhone(value: string) {
  if (!/^[+0-9()\s-]+$/.test(value)) {
    return null;
  }

  const normalized = value.replace(/[()\s-]/g, "");
  const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  return /^\d{8,15}$/.test(digits) && normalized.length <= MAX_PHONE_LENGTH
    ? normalized
    : null;
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

export function validateShipmentDraft(formData: FormData): ShipmentDraftValidation {
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
    recipientAddress: readText(formData, "recipientAddress"),
    recipientName: readText(formData, "recipientName"),
    recipientPhone: readText(formData, "recipientPhone"),
    senderAddress: readText(formData, "senderAddress"),
    senderName: readText(formData, "senderName"),
    senderPhone: readText(formData, "senderPhone"),
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

  for (const field of ["senderName", "recipientName"] as const) {
    if (!raw[field] || raw[field].length > MAX_NAME_LENGTH) {
      errors[field] = "Nama wajib diisi dan maksimal 120 karakter.";
    }
  }

  for (const field of ["senderAddress", "recipientAddress"] as const) {
    if (!raw[field] || raw[field].length > MAX_ADDRESS_LENGTH) {
      errors[field] = "Alamat wajib diisi dan maksimal 500 karakter.";
    }
  }

  const senderPhone = normalizePartyPhone(raw.senderPhone);
  const recipientPhone = normalizePartyPhone(raw.recipientPhone);
  if (!senderPhone) errors.senderPhone = "Nomor telepon pengirim tidak valid.";
  if (!recipientPhone) errors.recipientPhone = "Nomor telepon penerima tidak valid.";

  if (!raw.packageContent || raw.packageContent.length > MAX_CONTENT_LENGTH) {
    errors.packageContent = "Isi paket wajib diisi dan maksimal 240 karakter.";
  }

  const packageWeightGrams = readWholeNumber(raw.packageWeightGrams);
  if (
    !Number.isSafeInteger(packageWeightGrams) ||
    packageWeightGrams < 1 ||
    packageWeightGrams > MAX_WEIGHT_GRAMS
  ) {
    errors.packageWeightGrams = "Berat paket harus 1–100.000 gram.";
  }

  const packageQuantity = readWholeNumber(raw.packageQuantity);
  if (
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
      if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DIMENSION_CM) {
        errors[field] = "Isi panjang, lebar, dan tinggi sekaligus, atau kosongkan ketiganya.";
      } else {
        dimensions[field] = value;
      }
    }
  }

  const declaredValueIdr = readRupiah(raw.declaredValue);
  if (
    !Number.isSafeInteger(declaredValueIdr) ||
    declaredValueIdr < 0 ||
    declaredValueIdr > MAX_VALUE_IDR
  ) {
    errors.declaredValue = "Nilai barang harus berupa rupiah bulat yang valid.";
  } else if (paymentType === "COD" && declaredValueIdr === 0) {
    errors.declaredValue = "Nilai barang COD harus lebih dari Rp0.";
  }

  if (paymentType !== "COD" && paymentType !== "NON_COD") {
    errors.paymentType = "Pilih metode pembayaran yang valid.";
  }

  if (Object.keys(errors).length > 0 || !senderPhone || !recipientPhone) {
    return { errors, ok: false };
  }

  return {
    input: {
      declaredValueIdr,
      destinationAreaId: raw.destinationAreaId,
      destinationAreaLabel: raw.destinationAreaLabel,
      isCod: paymentType === "COD",
      outletId: raw.outletId,
      packageContent: raw.packageContent,
      packageHeightCm: dimensions.packageHeightCm,
      packageLengthCm: dimensions.packageLengthCm,
      packageQuantity,
      packageWeightGrams,
      packageWidthCm: dimensions.packageWidthCm,
      recipientAddress: raw.recipientAddress,
      recipientName: raw.recipientName,
      recipientPhone,
      senderAddress: raw.senderAddress,
      senderName: raw.senderName,
      senderPhone,
    },
    ok: true,
  };
}
