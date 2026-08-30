import "server-only";

import { normalizePartyPhone } from "@/lib/shipment-draft";

const MAX_ADDRESS_LABEL_LENGTH = 60;
const MAX_AREA_LENGTH = 160;
const MAX_NAME_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 500;

export type ContactDirectoryInput = {
  address: string;
  addressLabel: string;
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
  | "contactName"
  | "contactPhone"
  | "roles";

export type ContactDirectoryValidation =
  | { input: ContactDirectoryInput; ok: true }
  | { errors: Partial<Record<ContactDirectoryField, string>>; ok: false };

function readText(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export function validateContactDirectory(formData: FormData): ContactDirectoryValidation {
  const address = readText(formData, "addressText");
  const addressLabel = readText(formData, "addressLabel");
  const areaId = readText(formData, "areaId");
  const areaLabel = readText(formData, "areaLabel");
  const name = readText(formData, "contactName");
  const phone = normalizePartyPhone(readText(formData, "contactPhone"));
  const isRecipient = formData.get("roleRecipient") === "on";
  const isSender = formData.get("roleSender") === "on";
  const errors: Partial<Record<ContactDirectoryField, string>> = {};

  if (!name || name.length > MAX_NAME_LENGTH) {
    errors.contactName = "Nama wajib diisi dan maksimal 120 karakter.";
  }
  if (!phone) errors.contactPhone = "Nomor telepon kontak tidak valid.";
  if (!isSender && !isRecipient) errors.roles = "Pilih minimal satu peran kontak.";
  if (!addressLabel || addressLabel.length > MAX_ADDRESS_LABEL_LENGTH) {
    errors.addressLabel = "Label alamat wajib diisi dan maksimal 60 karakter.";
  }
  if (!address || address.length > MAX_ADDRESS_LENGTH) {
    errors.addressText = "Alamat wajib diisi dan maksimal 500 karakter.";
  }
  if ((areaId && !areaLabel) || (!areaId && areaLabel)) {
    errors.areaLabel = "Isi nama area dan ID area sekaligus, atau kosongkan keduanya.";
  } else {
    if (areaId.length > MAX_AREA_LENGTH) errors.areaId = "Pilih area tujuan yang valid.";
    if (areaLabel.length > MAX_AREA_LENGTH) {
      errors.areaLabel = "Nama area wajib diisi dan maksimal 160 karakter.";
    }
  }

  if (Object.keys(errors).length > 0) return { errors, ok: false };
  return {
    input: {
      address,
      addressLabel,
      destinationAreaId: areaId || null,
      destinationAreaLabel: areaLabel || null,
      isRecipient,
      isSender,
      name,
      phone: phone!,
    },
    ok: true,
  };
}
