/**
 * T-241: an optional peran/kategori on a contact (ref pengirim.html "Peran / Kategori Pengirim",
 * penerima.html tags). A small fixed list stored as its code in `contacts.category`
 * (`contacts_category_valid` CHECK, migration 0064); `null` is "Tanpa kategori". No "server-only":
 * the create/edit forms and the list badges read the labels too.
 */
export const CONTACT_CATEGORIES = [
  "PIC_UTAMA",
  "STAF_GUDANG",
  "DROPSHIPPER",
  "PENGRAJIN",
  "OPERASIONAL_CABANG",
  "ADMIN_PENGIRIMAN",
  "RESELLER",
  "PELANGGAN_TETAP",
  "PEMBELI_BARU",
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  ADMIN_PENGIRIMAN: "Admin Pengiriman",
  DROPSHIPPER: "Dropshipper",
  OPERASIONAL_CABANG: "Operasional Cabang",
  PELANGGAN_TETAP: "Pelanggan tetap",
  PEMBELI_BARU: "Pembeli baru",
  PENGRAJIN: "Pengrajin",
  PIC_UTAMA: "PIC Utama",
  RESELLER: "Reseller",
  STAF_GUDANG: "Staf Gudang",
};

export function isContactCategory(value: unknown): value is ContactCategory {
  return typeof value === "string" && (CONTACT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The posted `category` field: empty is "Tanpa kategori" (`null`); an unknown code is invalid
 * (`undefined`), so a tampered form is refused rather than silently cleared.
 */
export function parseContactCategory(value: FormDataEntryValue | null): ContactCategory | null | undefined {
  if (value === null || value === "") return null;
  return isContactCategory(value) ? value : undefined;
}

export function contactCategoryLabel(category: string | null) {
  return isContactCategory(category) ? CONTACT_CATEGORY_LABELS[category] : null;
}
