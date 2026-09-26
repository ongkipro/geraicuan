"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import {
  authorizeManagedMengantarCredentialMutation,
  ManagedMengantarSecretDeniedError,
  ManagedMengantarSecretInvalidError,
  ManagedMengantarSecretRateLimitedError,
  ManagedMengantarSecretUnavailableError,
  replaceManagedMengantarApiKey,
  restorePlatformDefaultMengantarConnection,
} from "@/db/managed-secret-repository";
import {
  addOutletPickupPoint as addOutletPickupPointRow,
  PickupPointDefaultRequiredError,
  PickupPointInUseError,
  PickupPointDeniedError,
  PickupPointInvalidError,
  PickupPointUnavailableError,
  removeOutletPickupPoint as removeOutletPickupPointRow,
  saveOutletPickupPointNotes,
  setDefaultOutletPickupPoint as setDefaultOutletPickupPointRow,
} from "@/db/outlet-pickup-point-repository";
import {
  saveTenantShipmentPrefix,
  ShipmentPrefixDeniedError,
  ShipmentPrefixInvalidError,
  ShipmentPrefixLockedError,
} from "@/db/shipment-number-repository";
import { TenantContextDeniedError, withTenantContext } from "@/db/tenant-context";
import {
  removeTenantLogo,
  saveTenantBrandProfile,
  saveTenantContactWhatsapp,
  saveTenantCourierPreferences,
  saveTenantDefaultLabelSize,
  saveTenantLabelFields,
  saveTenantLogo,
  TenantContactInvalidError,
  TenantSettingsDeniedError,
  TenantSettingsInvalidError,
} from "@/db/tenant-settings-repository";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { characterClassError } from "@/lib/field-character-classes";
import {
  LOGO_MAX_BYTES,
  LOGO_REJECTION_COPY,
  parseDisabledCouriers,
  parseGeraiProfile,
  PICKUP_NOTE_LIMITS,
  validateLogoUpload,
  type GeraiProfileField,
  type PickupNotes,
} from "@/lib/gerai-settings";
import { parseLabelFieldsForm } from "@/lib/label-fields";
import { LABEL_SIZES, type LabelSize } from "@/lib/label-size";
import { normalizePartyPhone } from "@/lib/shipment-draft";
import { normalizeShipmentPrefixInput } from "@/lib/shipment-number";
import {
  assertPlatformDefaultMengantarCredentialsAvailable,
  MengantarConfigurationError,
  MengantarPlatformCredentialsRefusedError,
  resolveMengantarAccountCredentials,
} from "@/lib/mengantar-credentials";
import {
  fetchMengantarPickupOptions,
  MengantarLocationError,
  type MengantarPickupOption,
} from "@/lib/mengantar-locations";

/**
 * PR-60: every action here is store setup — pickup points, the tenant's own
 * Mengantar connection and the profile — which a store awaiting approval may do.
 */
const STORE_SETUP = { allowPendingApproval: true } as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OPAQUE_IDENTIFIER_LENGTH = 160;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

type PickupPointField = "outletId" | "pickupAddressId" | "confirmation";

export type PickupPointActionState = {
  errors?: Partial<Record<PickupPointField, string>>;
  message?: string;
  resultToken?: string;
  success?: boolean;
};

export type MengantarPickupOptionsActionState = {
  message?: string;
  options?: MengantarPickupOption[];
  success?: boolean;
};

type MengantarCredentialField = "apiKey" | "confirmation" | "outletId";

export type MengantarCredentialActionState = {
  errors?: Partial<Record<MengantarCredentialField, string>>;
  message?: string;
  resultToken?: string;
  success?: boolean;
};

function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function requireTenantAdminPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant", STORE_SETUP);
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }

  if (principal.scope !== "tenant") {
    redirect("/login/tenant");
  }
  if (principal.role !== "TENANT_ADMIN") {
    redirect("/app");
  }
  return principal;
}

function revalidateOutletConfigurationPaths() {
  revalidatePath("/app/pengaturan/outlet");
  revalidatePath("/app/pengaturan/pickup");
  revalidatePath("/app/pengaturan/koneksi");
  revalidatePath("/app");
  revalidatePath("/app/pengiriman/baru");
  // Cek tarif quotes from the outlet's origin area too, so a promoted pickup
  // point changes what it should answer.
  revalidatePath("/app/cek-tarif");
}

function credentialFailureState(
  message: string,
  errors?: MengantarCredentialActionState["errors"],
): MengantarCredentialActionState {
  return { errors, message, resultToken: randomUUID() };
}

async function fetchAuthorizedPickupOptions(
  principal: Awaited<ReturnType<typeof requireTenantAdminPrincipal>>,
  outletId: string,
) {
  const resolved = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => resolveMengantarAccountCredentials(tx, context, outletId),
    STORE_SETUP,
  );
  return {
    authority: resolved.authority,
    options: await fetchMengantarPickupOptions(resolved.credentials, resolved.source),
  };
}

export async function loadMengantarPickupOptions(
  outletId: string,
): Promise<MengantarPickupOptionsActionState> {
  const principal = await requireTenantAdminPrincipal();
  if (!UUID_PATTERN.test(outletId)) {
    return { message: "Outlet tidak valid." };
  }
  try {
    return {
      options: (await fetchAuthorizedPickupOptions(principal, outletId)).options,
      success: true,
    };
  } catch (error) {
    if (error instanceof MengantarPlatformCredentialsRefusedError) {
      return {
        message:
          "Hubungkan dulu akun Mengantar milik gerai di Pengaturan › Koneksi Mengantar. Daftar pickup diambil dari akun itu.",
      };
    }
    if (
      error instanceof MengantarConfigurationError
      || error instanceof MengantarLocationError
    ) {
      return {
        message:
          "Daftar pickup Mengantar belum dapat dimuat. Pilihan tersimpan tidak berubah.",
      };
    }
    return {
      message: "Daftar pickup Mengantar belum dapat dimuat. Coba lagi.",
    };
  }
}

export async function savePrivateMengantarCredential(
  _previousState: MengantarCredentialActionState,
  formData: FormData,
): Promise<MengantarCredentialActionState> {
  const principal = await requireTenantAdminPrincipal();
  const outletId = formString(formData, "outletId");
  if (!UUID_PATTERN.test(outletId)) {
    return credentialFailureState(
      "API key belum tersimpan.",
      { outletId: "Outlet tidak valid." },
    );
  }

  try {
    await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => authorizeManagedMengantarCredentialMutation(
        tx,
        context,
        outletId,
      ),
      STORE_SETUP,
    );
    await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => replaceManagedMengantarApiKey(
        tx,
        context,
        outletId,
        () => {
          const value = formData.get("apiKey");
          return typeof value === "string" ? value : "";
        },
      ),
      STORE_SETUP,
    );
  } catch (error) {
    if (error instanceof ManagedMengantarSecretInvalidError) {
      return credentialFailureState(
        "Periksa API key yang ditandai.",
        { apiKey: "API key wajib diisi dan tidak boleh melebihi 512 karakter." },
      );
    }
    if (error instanceof ManagedMengantarSecretRateLimitedError) {
      return credentialFailureState(
        "Terlalu banyak percobaan mengganti API key. Coba lagi beberapa menit lagi.",
      );
    }
    if (
      error instanceof ManagedMengantarSecretDeniedError
      || error instanceof ManagedMengantarSecretUnavailableError
    ) {
      return credentialFailureState("API key belum dapat disimpan.");
    }
    return credentialFailureState("API key belum dapat disimpan. Coba lagi.");
  }

  revalidateOutletConfigurationPaths();
  return {
    message: "Outlet ini memakai akun Mengantar sendiri. API key tidak ditampilkan lagi.",
    resultToken: randomUUID(),
    success: true,
  };
}

export async function switchMengantarToPlatformDefault(
  _previousState: MengantarCredentialActionState,
  formData: FormData,
): Promise<MengantarCredentialActionState> {
  const principal = await requireTenantAdminPrincipal();
  const outletId = formString(formData, "outletId");
  const confirmation = formData.get("confirmation");
  const errors: MengantarCredentialActionState["errors"] = {};
  if (!UUID_PATTERN.test(outletId)) {
    errors.outletId = "Outlet tidak valid.";
  }
  if (confirmation !== "restore-platform-default") {
    errors.confirmation = "Konfirmasi pengalihan koneksi diperlukan.";
  }
  if (Object.keys(errors).length > 0) {
    return credentialFailureState("Koneksi Mengantar belum dialihkan.", errors);
  }

  try {
    await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => authorizeManagedMengantarCredentialMutation(
        tx,
        context,
        outletId,
      ),
      STORE_SETUP,
    );
    await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => restorePlatformDefaultMengantarConnection(
        tx,
        context,
        outletId,
        assertPlatformDefaultMengantarCredentialsAvailable,
      ),
      STORE_SETUP,
    );
  } catch (error) {
    if (error instanceof ManagedMengantarSecretRateLimitedError) {
      return credentialFailureState(
        "Terlalu banyak percobaan perubahan koneksi. Coba lagi beberapa menit lagi.",
      );
    }
    if (error instanceof MengantarPlatformCredentialsRefusedError) {
      return credentialFailureState(
        "Gerai ini wajib memakai akun Mengantar sendiri, jadi koneksi bawaan GeraiCUAN tidak tersedia. API key outlet tetap dipakai.",
      );
    }
    if (error instanceof MengantarConfigurationError) {
      return credentialFailureState(
        "Koneksi bawaan GeraiCUAN belum siap. Outlet tetap memakai akun Mengantar sendiri.",
      );
    }
    if (
      error instanceof ManagedMengantarSecretDeniedError
      || error instanceof ManagedMengantarSecretInvalidError
      || error instanceof ManagedMengantarSecretUnavailableError
    ) {
      return credentialFailureState("Koneksi Mengantar belum dapat dialihkan.");
    }
    return credentialFailureState("Koneksi Mengantar belum dapat dialihkan. Coba lagi.");
  }

  revalidateOutletConfigurationPaths();
  return {
    message: "Outlet ini sekarang memakai koneksi bawaan GeraiCUAN.",
    resultToken: randomUUID(),
    success: true,
  };
}

function pickupFailureState(
  message: string,
  errors?: PickupPointActionState["errors"],
): PickupPointActionState {
  return { errors, message, resultToken: randomUUID() };
}

/**
 * Maps the repository's refusals to Indonesian operator copy. Every branch is a
 * refusal: no pickup point is written unless the repository accepted it.
 */
function pickupErrorState(error: unknown): PickupPointActionState {
  if (error instanceof PickupPointUnavailableError) {
    return pickupFailureState(
      "Titik pickup itu bukan milik outlet ini. Muat ulang halaman lalu coba lagi.",
      { pickupAddressId: "Pilihan sudah berubah. Pilih ulang alamat pickup." },
    );
  }
  if (error instanceof PickupPointDefaultRequiredError) {
    return pickupFailureState(
      "Tetapkan titik pickup lain sebagai utama sebelum menghapus yang utama.",
    );
  }
  if (error instanceof PickupPointInUseError) {
    return pickupFailureState(
      `Titik pickup ini masih dipakai ${error.shipmentCount} kiriman yang belum terbit resi. `
      + "Terbitkan atau batalkan kiriman itu dulu.",
    );
  }
  if (
    error instanceof PickupPointDeniedError
    || error instanceof PickupPointInvalidError
    || error instanceof TenantContextDeniedError
  ) {
    return pickupFailureState("Titik pickup tidak dapat diubah.");
  }
  return pickupFailureState("Titik pickup belum dapat diubah. Coba lagi.");
}

function readPickupRequest(formData: FormData) {
  const outletId = formString(formData, "outletId");
  const pickupAddressId = formString(formData, "pickupAddressId");
  const errors: PickupPointActionState["errors"] = {};
  if (!UUID_PATTERN.test(outletId)) errors.outletId = "Outlet tidak valid.";
  if (
    !pickupAddressId
    || pickupAddressId.length > MAX_OPAQUE_IDENTIFIER_LENGTH
    || CONTROL_CHARACTER_PATTERN.test(pickupAddressId)
  ) {
    errors.pickupAddressId = "Pilih alamat pickup terlebih dahulu.";
  }
  return { errors, outletId, pickupAddressId };
}

/**
 * Adds one of the outlet's Mengantar pickup addresses as a pickup point. The
 * label and the derived origin area are taken from the provider's own current
 * list, never from the browser: the form only names which address was chosen.
 */
export async function addOutletPickupPoint(
  _previousState: PickupPointActionState,
  formData: FormData,
): Promise<PickupPointActionState> {
  const principal = await requireTenantAdminPrincipal();
  const { errors, outletId, pickupAddressId } = readPickupRequest(formData);
  if (Object.keys(errors).length > 0) {
    return pickupFailureState("Titik pickup belum ditambahkan.", errors);
  }

  let canonical: MengantarPickupOption;
  try {
    const { options } = await fetchAuthorizedPickupOptions(principal, outletId);
    const selected = options.find((option) => option.pickupAddressId === pickupAddressId);
    if (!selected) {
      return pickupFailureState("Titik pickup belum ditambahkan.", {
        pickupAddressId: "Pilihan sudah berubah di Mengantar. Cari dan pilih ulang.",
      });
    }
    canonical = selected;
  } catch (error) {
    if (
      error instanceof MengantarConfigurationError
      || error instanceof MengantarLocationError
    ) {
      return pickupFailureState(
        "Alamat pickup belum dapat diverifikasi ke Mengantar. Daftar tersimpan tidak berubah.",
      );
    }
    return pickupFailureState("Alamat pickup belum dapat diverifikasi. Coba lagi.");
  }

  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      addOutletPickupPointRow(tx, context, {
        outletId,
        originAreaId: canonical.originAreaId,
        originAreaLabel: canonical.originLabel,
        pickupAddressId: canonical.pickupAddressId,
        pickupAddressLabel: canonical.pickupLabel,
      }), STORE_SETUP);
  } catch (error) {
    return pickupErrorState(error);
  }

  revalidateOutletConfigurationPaths();
  return {
    message: "Titik pickup tersimpan untuk outlet ini.",
    resultToken: randomUUID(),
    success: true,
  };
}

export async function setDefaultOutletPickupPoint(
  _previousState: PickupPointActionState,
  formData: FormData,
): Promise<PickupPointActionState> {
  const principal = await requireTenantAdminPrincipal();
  const { errors, outletId, pickupAddressId } = readPickupRequest(formData);
  if (Object.keys(errors).length > 0) {
    return pickupFailureState("Titik utama belum diubah.", errors);
  }

  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      setDefaultOutletPickupPointRow(tx, context, outletId, pickupAddressId), STORE_SETUP);
  } catch (error) {
    return pickupErrorState(error);
  }

  revalidateOutletConfigurationPaths();
  return {
    message: "Titik pickup utama outlet ini diperbarui.",
    resultToken: randomUUID(),
    success: true,
  };
}

export async function removeOutletPickupPoint(
  _previousState: PickupPointActionState,
  formData: FormData,
): Promise<PickupPointActionState> {
  const principal = await requireTenantAdminPrincipal();
  const { errors, outletId, pickupAddressId } = readPickupRequest(formData);
  if (formData.get("confirmation") !== "remove-pickup-point") {
    errors.confirmation = "Konfirmasi penghapusan titik pickup diperlukan.";
  }
  if (Object.keys(errors).length > 0) {
    return pickupFailureState("Titik pickup belum dihapus.", errors);
  }

  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      removeOutletPickupPointRow(tx, context, outletId, pickupAddressId), STORE_SETUP);
  } catch (error) {
    return pickupErrorState(error);
  }

  revalidateOutletConfigurationPaths();
  return {
    message: "Titik pickup dihapus dari outlet ini.",
    resultToken: randomUUID(),
    success: true,
  };
}

export type ShipmentPrefixActionState = {
  error?: string;
  savedPrefix?: string;
  resultToken?: string;
};

export async function saveShipmentPrefix(
  _previous: ShipmentPrefixActionState,
  formData: FormData,
): Promise<ShipmentPrefixActionState> {
  const principal = await requireTenantAdminPrincipal();
  const rawPrefix = formData.get("prefix");
  const attemptId = formData.get("attemptId");
  const prefix = typeof rawPrefix === "string" ? normalizeShipmentPrefixInput(rawPrefix) : null;
  if (!prefix) {
    return { error: "Awalan harus 2–3 huruf atau angka tanpa spasi, misalnya PHI atau A29.", resultToken: randomUUID() };
  }
  if (typeof attemptId !== "string" || !UUID_PATTERN.test(attemptId) || formData.get("confirmation") !== "locked") {
    return { error: "Konfirmasi penguncian awalan diperlukan. Muat ulang halaman lalu coba lagi.", resultToken: randomUUID() };
  }
  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      saveTenantShipmentPrefix(tx, context, prefix, attemptId), STORE_SETUP);
  } catch (error) {
    if (error instanceof ShipmentPrefixLockedError) {
      return { error: "Awalan sudah terkunci dan tidak dapat diubah. Hubungi admin platform bila ada kesalahan.", resultToken: randomUUID() };
    }
    if (error instanceof ShipmentPrefixInvalidError) {
      return { error: "Awalan harus 2–3 huruf atau angka tanpa spasi, misalnya PHI atau A29.", resultToken: randomUUID() };
    }
    if (error instanceof ShipmentPrefixDeniedError || error instanceof TenantContextDeniedError) {
      return { error: "Hanya pemilik gerai yang dapat mengatur awalan nomor kiriman.", resultToken: randomUUID() };
    }
    return { error: "Awalan belum dapat disimpan. Coba lagi.", resultToken: randomUUID() };
  }
  // Every screen that shows a shipment number must pick up the new prefix.
  revalidatePath("/app", "layout");
  return { savedPrefix: prefix, resultToken: randomUUID() };
}

export type TenantContactActionState = {
  error?: string;
  resultToken?: string;
  savedWhatsapp?: string;
};

const WHATSAPP_ERROR = "Isi nomor WhatsApp Indonesia yang benar, misalnya 0812 3456 7890.";

/**
 * T-233: the gerai WhatsApp printed on the nota and offered as the label sender. Same
 * normaliser as registration (`normalizePartyPhone`); the database function re-checks the
 * format, the Tenant Admin role and the tenant, and audits the change.
 */
export async function saveTenantContact(
  _previous: TenantContactActionState,
  formData: FormData,
): Promise<TenantContactActionState> {
  const principal = await requireTenantAdminPrincipal();
  const raw = formString(formData, "whatsapp");
  const classError = characterClassError("PHONE", "Nomor WhatsApp", raw);
  const whatsapp = classError ? null : normalizePartyPhone(raw);
  if (!whatsapp) return { error: classError ?? WHATSAPP_ERROR, resultToken: randomUUID() };
  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      saveTenantContactWhatsapp(tx, context, whatsapp), STORE_SETUP);
  } catch (error) {
    if (error instanceof TenantContactInvalidError) return { error: WHATSAPP_ERROR, resultToken: randomUUID() };
    if (error instanceof TenantSettingsDeniedError || error instanceof TenantContextDeniedError) {
      return { error: "Hanya pemilik gerai yang dapat mengubah WhatsApp gerai.", resultToken: randomUUID() };
    }
    return { error: "WhatsApp gerai belum dapat disimpan. Coba lagi.", resultToken: randomUUID() };
  }
  revalidatePath("/app/pengaturan");
  revalidatePath("/app/pengaturan/label");
  revalidatePath("/app/pengiriman/baru");
  return { resultToken: randomUUID(), savedWhatsapp: whatsapp };
}

export type LabelSettingsActionState = {
  error?: string;
  resultToken?: string;
  saved?: boolean;
};

/** T-229 / PR-86: both sizes' label fields in one save; every later label print applies them. */
export async function saveLabelSettings(
  _previous: LabelSettingsActionState,
  formData: FormData,
): Promise<LabelSettingsActionState> {
  const principal = await requireTenantAdminPrincipal();
  const fields = parseLabelFieldsForm(formData, Object.keys(LABEL_SIZES) as LabelSize[]);
  // T-243: the default size travels with the editor's form; a form without it leaves it as is.
  const defaultSize = formData.get("defaultSize");
  if (!fields || (defaultSize !== null && defaultSize !== "10x15" && defaultSize !== "10x10")) {
    return { error: "Pilihan informasi label tidak lengkap. Muat ulang halaman lalu coba lagi.", resultToken: randomUUID() };
  }
  try {
    await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
      await saveTenantLabelFields(tx, context, fields);
      // T-243: the size the label page and the batch dialog preselect.
      if (defaultSize === "10x15" || defaultSize === "10x10") await saveTenantDefaultLabelSize(tx, context, defaultSize);
    }, STORE_SETUP);
  } catch (error) {
    if (error instanceof TenantSettingsDeniedError || error instanceof TenantContextDeniedError) {
      return { error: "Hanya pemilik gerai yang dapat mengubah informasi label.", resultToken: randomUUID() };
    }
    return { error: "Informasi label belum dapat disimpan. Coba lagi.", resultToken: randomUUID() };
  }
  revalidatePath("/app/pengaturan/label");
  revalidatePath("/app/label", "layout");
  return { resultToken: randomUUID(), saved: true };
}

// ------------------------------------------------------------------ T-243

/** Every page that prints or previews the brand (label, batch, invoice, Informasi label). */
function revalidateBrandPaths() {
  revalidatePath("/app/pengaturan");
  revalidatePath("/app/pengaturan/label");
  revalidatePath("/app/label", "layout");
  revalidatePath("/app/invoice", "layout");
}

export type GeraiProfileActionState = {
  error?: string;
  fieldErrors?: Partial<Record<GeraiProfileField, string>>;
  resultToken?: string;
  saved?: boolean;
};

/** Profil gerai & brand: catatan resi, kategori usaha, email CS, website (all optional). */
export async function saveGeraiProfile(
  _previous: GeraiProfileActionState,
  formData: FormData,
): Promise<GeraiProfileActionState> {
  const principal = await requireTenantAdminPrincipal();
  const raw = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const parsed = parseGeraiProfile({
    businessCategory: raw("businessCategory"),
    csEmail: raw("csEmail"),
    labelNote: raw("labelNote"),
    website: raw("website"),
  });
  if (!parsed.ok) {
    return { error: "Periksa isian yang ditandai.", fieldErrors: parsed.errors, resultToken: randomUUID() };
  }
  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      saveTenantBrandProfile(tx, context, parsed.value), STORE_SETUP);
  } catch (error) {
    if (error instanceof TenantSettingsDeniedError || error instanceof TenantContextDeniedError) {
      return { error: "Hanya pemilik gerai yang dapat mengubah profil gerai.", resultToken: randomUUID() };
    }
    return { error: "Profil gerai belum dapat disimpan. Coba lagi.", resultToken: randomUUID() };
  }
  revalidateBrandPaths();
  return { resultToken: randomUUID(), saved: true };
}

export type GeraiLogoActionState = {
  error?: string;
  resultToken?: string;
  saved?: "uploaded" | "removed";
};

/**
 * The gerai logo: PNG, JPEG or WebP by magic bytes, <= 200 KB, <= 1000 x 1000 px, never
 * SVG. The size is checked before the bytes are read; the repository checks them again.
 */
export async function uploadGeraiLogo(
  _previous: GeraiLogoActionState,
  formData: FormData,
): Promise<GeraiLogoActionState> {
  const principal = await requireTenantAdminPrincipal();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: LOGO_REJECTION_COPY.EMPTY, resultToken: randomUUID() };
  }
  if (file.size > LOGO_MAX_BYTES) return { error: LOGO_REJECTION_COPY.TOO_LARGE, resultToken: randomUUID() };
  const upload = { bytes: new Uint8Array(await file.arrayBuffer()), declaredType: file.type, name: file.name };
  const checked = validateLogoUpload(upload);
  if (!checked.ok) return { error: LOGO_REJECTION_COPY[checked.reason], resultToken: randomUUID() };
  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      saveTenantLogo(tx, context, upload), STORE_SETUP);
  } catch (error) {
    if (error instanceof TenantSettingsInvalidError) return { error: LOGO_REJECTION_COPY.UNSUPPORTED, resultToken: randomUUID() };
    if (error instanceof TenantSettingsDeniedError || error instanceof TenantContextDeniedError) {
      return { error: "Hanya pemilik gerai yang dapat mengganti logo.", resultToken: randomUUID() };
    }
    return { error: "Logo belum dapat disimpan. Coba lagi.", resultToken: randomUUID() };
  }
  revalidateBrandPaths();
  return { resultToken: randomUUID(), saved: "uploaded" };
}

export async function removeGeraiLogo(
  _previous: GeraiLogoActionState,
  formData: FormData,
): Promise<GeraiLogoActionState> {
  const principal = await requireTenantAdminPrincipal();
  if (formData.get("confirmation") !== "remove-logo") {
    return { error: "Konfirmasi penghapusan logo diperlukan.", resultToken: randomUUID() };
  }
  try {
    await withTenantContext(db, principal.userId, principal.tenantId, removeTenantLogo, STORE_SETUP);
  } catch (error) {
    if (error instanceof TenantSettingsDeniedError || error instanceof TenantContextDeniedError) {
      return { error: "Hanya pemilik gerai yang dapat menghapus logo.", resultToken: randomUUID() };
    }
    return { error: "Logo belum dapat dihapus. Coba lagi.", resultToken: randomUUID() };
  }
  revalidateBrandPaths();
  return { resultToken: randomUUID(), saved: "removed" };
}

export type CourierPreferencesActionState = {
  error?: string;
  resultToken?: string;
  saved?: boolean;
};

/** Mitra kurir: which couriers Cek tarif and Buat kiriman offer; at least one stays on. */
export async function saveCourierPreferences(
  _previous: CourierPreferencesActionState,
  formData: FormData,
): Promise<CourierPreferencesActionState> {
  const principal = await requireTenantAdminPrincipal();
  const disabled = parseDisabledCouriers(formData);
  if (!disabled) {
    return { error: "Pilihan kurir tidak lengkap. Muat ulang halaman lalu coba lagi.", resultToken: randomUUID() };
  }
  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      saveTenantCourierPreferences(tx, context, disabled), STORE_SETUP);
  } catch (error) {
    if (error instanceof TenantSettingsInvalidError) {
      return { error: "Aktifkan minimal satu kurir.", resultToken: randomUUID() };
    }
    if (error instanceof TenantSettingsDeniedError || error instanceof TenantContextDeniedError) {
      return { error: "Hanya pemilik gerai yang dapat mengatur mitra kurir.", resultToken: randomUUID() };
    }
    return { error: "Pilihan kurir belum dapat disimpan. Coba lagi.", resultToken: randomUUID() };
  }
  revalidatePath("/app/pengaturan/kurir");
  revalidatePath("/app/cek-tarif");
  revalidatePath("/app/pengiriman", "layout");
  return { resultToken: randomUUID(), saved: true };
}

export type PickupNotesActionState = {
  errors?: Partial<Record<keyof PickupNotes, string>>;
  message?: string;
  resultToken?: string;
  success?: boolean;
};

/** Titik pickup: internal notes on one pickup point; never sent to Mengantar. */
export async function savePickupPointNotes(
  _previous: PickupNotesActionState,
  formData: FormData,
): Promise<PickupNotesActionState> {
  const principal = await requireTenantAdminPrincipal();
  const { errors: requestErrors, outletId, pickupAddressId } = readPickupRequest(formData);
  if (Object.keys(requestErrors).length > 0) {
    return { message: "Titik pickup tidak valid. Muat ulang halaman.", resultToken: randomUUID() };
  }
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
  };
  const errors: NonNullable<PickupNotesActionState["errors"]> = {};
  const notes: PickupNotes = { accessNote: null, picName: null, picPhone: null, schedule: null };
  for (const key of ["picName", "schedule", "accessNote"] as const) {
    const value = text(key);
    if (CONTROL_CHARACTER_PATTERN.test(value)) errors[key] = "Hapus karakter yang tidak didukung.";
    else if (value.length > PICKUP_NOTE_LIMITS[key]) errors[key] = `Maksimal ${PICKUP_NOTE_LIMITS[key]} karakter.`;
    else notes[key] = value === "" ? null : value;
  }
  const phone = text("picPhone");
  if (phone !== "") {
    const classError = characterClassError("PHONE", "Nomor PIC", phone);
    const normalized = classError ? null : normalizePartyPhone(phone);
    if (!normalized) errors.picPhone = classError ?? "Isi nomor Indonesia yang benar, misalnya 0812 3456 7890.";
    else notes.picPhone = normalized;
  }
  if (Object.keys(errors).length > 0) {
    return { errors, message: "Periksa isian yang ditandai.", resultToken: randomUUID() };
  }
  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      saveOutletPickupPointNotes(tx, context, outletId, pickupAddressId, notes), STORE_SETUP);
  } catch (error) {
    const failure = pickupErrorState(error);
    return { message: failure.message, resultToken: randomUUID() };
  }
  revalidatePath("/app/pengaturan/pickup");
  return { message: "Catatan titik pickup disimpan.", resultToken: randomUUID(), success: true };
}
