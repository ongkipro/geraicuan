import "server-only";

import { characterClassError } from "@/lib/field-character-classes";
import {
  normalizeEmailInput,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/public-auth";
import { normalizePartyPhone } from "@/lib/shipment-draft";

/**
 * PR-59: the sign-up fields, validated on the server with Indonesian messages.
 * The database function validates the same shapes again.
 */
export type RegistrationField =
  | "email"
  | "ownerName"
  | "password"
  | "passwordConfirmation"
  | "storeName"
  | "terms"
  | "whatsapp";

export type RegistrationInput = {
  email: string;
  ownerName: string;
  password: string;
  storeName: string;
  whatsapp: string;
};

export type RegistrationValidation =
  | { input: RegistrationInput; ok: true }
  | { errors: Partial<Record<RegistrationField, string>>; ok: false };

/**
 * Control characters, and format characters (L5): bidi overrides, zero-width
 * joiners and the like, which make a name read differently from what it is to
 * the Super Admin who reviews it. `register_tenant_self_service` refuses the
 * same set.
 */
const CONTROL_OR_FORMAT_CHARACTERS = /[\p{Cc}\p{Cf}]/u;

function text(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function personOrStoreName(value: string) {
  const trimmed = value.trim().replace(/\s+/gu, " ");
  return trimmed.length >= 2 && trimmed.length <= 120 && !CONTROL_OR_FORMAT_CHARACTERS.test(trimmed)
    ? trimmed
    : null;
}

export function validateRegistration(formData: FormData): RegistrationValidation {
  const errors: Partial<Record<RegistrationField, string>> = {};

  const storeName = personOrStoreName(text(formData, "storeName"));
  // T-198: the server refuses emoji in a store name as the form does (T-199's
  // BUSINESS_NAME class); digits and punctuation stay allowed.
  const storeNameClass = storeName && characterClassError("BUSINESS_NAME", "Nama gerai", storeName);
  if (!storeName) errors.storeName = "Isi nama gerai, 2 sampai 120 karakter.";
  else if (storeNameClass) errors.storeName = storeNameClass;

  const ownerName = personOrStoreName(text(formData, "ownerName"));
  // T-196: an owner is a person, so digits and symbols are refused.
  const ownerNameClass = ownerName && characterClassError("PERSON_NAME", "Nama pemilik", ownerName);
  if (!ownerName) errors.ownerName = "Isi nama pemilik, 2 sampai 120 karakter.";
  else if (ownerNameClass) errors.ownerName = ownerNameClass;

  const email = normalizeEmailInput(formData.get("email"));
  if (!email) errors.email = "Isi alamat email yang benar, misalnya nama@gerai.com.";

  const rawWhatsapp = text(formData, "whatsapp").trim();
  const whatsapp = normalizePartyPhone(rawWhatsapp);
  const whatsappClass = characterClassError("PHONE", "Nomor WhatsApp", rawWhatsapp);
  if (whatsappClass) {
    errors.whatsapp = whatsappClass;
  } else if (!whatsapp) {
    errors.whatsapp = "Isi nomor WhatsApp Indonesia yang benar, misalnya 0812 3456 7890.";
  }

  const password = text(formData, "password");
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Kata sandi maksimal ${PASSWORD_MAX_LENGTH} karakter.`;
  }

  const confirmation = text(formData, "passwordConfirmation");
  if (!confirmation) {
    errors.passwordConfirmation = "Ulangi kata sandi.";
  } else if (confirmation !== password) {
    errors.passwordConfirmation = "Konfirmasi kata sandi belum sama.";
  }

  if (formData.get("terms") !== "setuju") {
    errors.terms = "Centang persetujuan syarat penggunaan untuk melanjutkan.";
  }

  if (
    Object.keys(errors).length > 0
    || !storeName
    || !ownerName
    || ownerNameClass
    || whatsappClass
    || !email
    || !whatsapp
  ) {
    return { errors, ok: false };
  }
  return { input: { email, ownerName, password, storeName, whatsapp }, ok: true };
}
