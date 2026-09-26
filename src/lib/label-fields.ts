import type { LabelSize } from "@/lib/label-size";

/**
 * T-229 / PR-86: the label fields a Tenant Admin may hide, per label size. The Mengantar
 * pickup identity is not in this list on purpose: it is never printable (PR-71).
 */
export const LABEL_FIELD_KEYS = [
  "senderAddress",
  "senderPhone",
  "recipientName",
  "recipientPhone",
  "recipientAddressDetail",
  "returnWarning",
  // T-243: the courier's print mark instead of its name (text when it has none), and the
  // gerai logo / catatan resi, printed only when the gerai has one (Profil gerai).
  "courierLogo",
  "geraiLogo",
  "labelNote",
] as const;

export type LabelFieldKey = (typeof LABEL_FIELD_KEYS)[number];
export type LabelFields = Record<LabelFieldKey, boolean>;
export type LabelFieldsBySize = Record<LabelSize, LabelFields>;

/** Everything on, no warning line; since T-243 the courier prints as its logo when it has one. */
export const DEFAULT_LABEL_FIELDS: LabelFields = {
  senderAddress: true,
  senderPhone: true,
  recipientName: true,
  recipientPhone: true,
  recipientAddressDetail: true,
  returnWarning: false,
  courierLogo: true,
  geraiLogo: true,
  labelNote: true,
};

export const DEFAULT_LABEL_FIELDS_BY_SIZE: LabelFieldsBySize = {
  "10x15": DEFAULT_LABEL_FIELDS,
  "10x10": DEFAULT_LABEL_FIELDS,
};

export const LABEL_FIELD_COPY: Record<LabelFieldKey, { label: string; description: string }> = {
  senderAddress: { label: "Alamat pengirim", description: "Alamat di baris pengirim." },
  senderPhone: { label: "No. telepon pengirim", description: "Nomor di baris pengirim." },
  recipientName: { label: "Nama penerima", description: "Nama di blok penerima." },
  recipientPhone: { label: "No. telepon penerima", description: "Nomor di blok penerima." },
  recipientAddressDetail: {
    label: "Detail alamat penerima",
    description: "Bila mati, hanya kota dan provinsi yang tercetak.",
  },
  returnWarning: {
    label: "Peringatan sebelum retur",
    description: "Baris bawah label meminta kurir konfirmasi ke pengirim sebelum retur; waktu terbit tidak dicetak.",
  },
  courierLogo: {
    label: "Logo kurir",
    description: "Logo hitam kurir menggantikan namanya di kiri atas; layanan tetap tercetak di sebelahnya.",
  },
  geraiLogo: {
    label: "Logo gerai",
    description: "Di kanan atas label, hitam-putih. Tidak menggeser resi, kurir, atau barcode.",
  },
  labelNote: {
    label: "Catatan resi",
    description: "Satu baris di bawah nama pengirim; alamat pengirim diringkas satu baris.",
  },
};

/** The line printed in the label footer when the warning is on. */
export const RETURN_WARNING_TEXT = "Sebelum retur, konfirmasi dulu ke pengirim";

/**
 * City and province from a Mengantar area label ("subdistrict, district, city, province, zip"),
 * counted from the end like `formatDistrictCity`, so a comma inside an earlier part never
 * shifts it. Printed instead of the street address when the address detail is off.
 */
export function formatCityProvince(areaLabel: string) {
  const parts = areaLabel.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 0 && /^\d{5}$/.test(parts[parts.length - 1])) parts.pop();
  return parts.length > 0 ? parts.slice(-2).join(", ") : "—";
}

/** Form name of one switch: `10x15.senderPhone`. */
export function labelFieldInputName(size: LabelSize, key: LabelFieldKey) {
  return `${size}.${key}`;
}

/**
 * Both sizes from the editor's form. Every field of both sizes must be present as "1" or
 * "0"; anything else is refused (null) rather than guessed, so a stale or forged form never
 * silently switches a field.
 */
export function parseLabelFieldsForm(formData: FormData, sizes: readonly LabelSize[]): LabelFieldsBySize | null {
  const result = {} as LabelFieldsBySize;
  for (const size of sizes) {
    const fields = {} as LabelFields;
    for (const key of LABEL_FIELD_KEYS) {
      const value = formData.get(labelFieldInputName(size, key));
      if (value !== "1" && value !== "0") return null;
      fields[key] = value === "1";
    }
    result[size] = fields;
  }
  return result;
}
