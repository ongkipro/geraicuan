import "server-only";

import { parseContactCategory, type ContactCategory } from "@/lib/contact-category";
import { characterClassError, normalizeFieldText, partyNameClass } from "@/lib/field-character-classes";
import { normalizePartyPhone } from "@/lib/shipment-draft";

const MAX_ADDRESS_LABEL_LENGTH = 60;
const MAX_AREA_LENGTH = 160;
const MAX_NAME_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 500;

export type ContactDirectoryInput = {
  address: string;
  addressLabel: string;
  /** T-241: optional peran/kategori; omitted by callers that predate it (stored as NULL). */
  category?: ContactCategory | null;
  destinationAreaId: string | null;
  destinationAreaLabel: string | null;
  isRecipient: boolean;
  isSender: boolean;
  name: string;
  phone: string;
};

export type ContactDirectoryField =
  | "addressLabel"
  | "addressText"
  | "areaId"
  | "areaLabel"
  | "category"
  | "contactName"
  | "contactPhone"
  | "roles";

export type ContactDirectoryValidation =
  | { input: ContactDirectoryInput; ok: true }
  | { errors: Partial<Record<ContactDirectoryField, string>>; ok: false };

function readText(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? normalizeFieldText(value) : "";
}

/**
 * T-196: name and phone checks shared by contact create and contact edit. The
 * name rule follows the roles: a sender (alone or with the recipient role) may
 * carry digits; a recipient-only contact is a person's name.
 */
export function contactIdentityErrors(name: string, rawPhone: string, roles: { isSender: boolean }) {
  const errors: Partial<Record<"contactName" | "contactPhone", string>> = {};
  if (!name || name.length > MAX_NAME_LENGTH) {
    errors.contactName = "Nama wajib diisi dan maksimal 120 karakter.";
  } else {
    const message = characterClassError(partyNameClass(roles), "Nama kontak", name);
    if (message) errors.contactName = message;
  }
  const phoneClass = characterClassError("PHONE", "Nomor telepon kontak", rawPhone);
  if (phoneClass) errors.contactPhone = phoneClass;
  else if (!normalizePartyPhone(rawPhone)) errors.contactPhone = "Nomor telepon kontak tidak valid.";
  return errors;
}

/** T-196: address label and address text checks shared by contact create and address edits. */
export function contactAddressErrors(addressLabel: string, address: string) {
  const errors: Partial<Record<"addressLabel" | "addressText", string>> = {};
  if (!addressLabel || addressLabel.length > MAX_ADDRESS_LABEL_LENGTH) {
    errors.addressLabel = "Label alamat wajib diisi dan maksimal 60 karakter.";
  } else {
    const message = characterClassError("BUSINESS_NAME", "Label alamat", addressLabel);
    if (message) errors.addressLabel = message;
  }
  if (!address || address.length > MAX_ADDRESS_LENGTH) {
    errors.addressText = "Alamat wajib diisi dan maksimal 500 karakter.";
  } else {
    const message = characterClassError("ADDRESS", "Alamat", address);
    if (message) errors.addressText = message;
  }
  return errors;
}

export function validateContactDirectory(formData: FormData): ContactDirectoryValidation {
  const address = readText(formData, "addressText");
  const addressLabel = readText(formData, "addressLabel");
  const areaId = readText(formData, "areaId");
  const areaLabel = readText(formData, "areaLabel");
  const name = readText(formData, "contactName");
  const rawPhone = readText(formData, "contactPhone");
  const phone = normalizePartyPhone(rawPhone);
  const isRecipient = formData.get("roleRecipient") === "on";
  const isSender = formData.get("roleSender") === "on";
  const category = parseContactCategory(formData.get("category"));
  const errors: Partial<Record<ContactDirectoryField, string>> = {
    ...contactIdentityErrors(name, rawPhone, { isSender }),
  };
  if (category === undefined) errors.category = "Pilih kategori dari daftar.";

  if (!isSender && !isRecipient) errors.roles = "Pilih minimal satu peran kontak.";
  Object.assign(errors, contactAddressErrors(addressLabel, address));
  if ((areaId && !areaLabel) || (!areaId && areaLabel)) {
    errors.areaLabel = "Cari dan pilih ulang area tujuan, atau kosongkan pilihan area.";
  } else {
    if (areaId.length > MAX_AREA_LENGTH) errors.areaId = "Pilih area tujuan yang valid.";
    if (areaLabel.length > MAX_AREA_LENGTH) {
      errors.areaLabel = "Nama area wajib diisi dan maksimal 160 karakter.";
    }
  }

  if (Object.keys(errors).length > 0 || !phone) return { errors, ok: false };
  return {
    input: {
      address,
      addressLabel,
      category: category ?? null,
      destinationAreaId: areaId || null,
      destinationAreaLabel: areaLabel || null,
      isRecipient,
      isSender,
      name,
      phone,
    },
    ok: true,
  };
}
