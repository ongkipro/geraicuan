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
  setDefaultOutletPickupPoint as setDefaultOutletPickupPointRow,
} from "@/db/outlet-pickup-point-repository";
import {
  saveTenantShipmentPrefix,
  ShipmentPrefixDeniedError,
  ShipmentPrefixInvalidError,
  ShipmentPrefixLockedError,
} from "@/db/shipment-number-repository";
import { TenantContextDeniedError, withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { normalizeShipmentPrefixInput } from "@/lib/shipment-number";
import {
  assertPlatformDefaultMengantarCredentialsComplete,
  MengantarConfigurationError,
  resolveMengantarAccountCredentials,
} from "@/lib/mengantar-credentials";
import {
  fetchMengantarPickupOptions,
  MengantarLocationError,
  type MengantarPickupOption,
} from "@/lib/mengantar-locations";

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
    principal = await requireCmsScope("tenant");
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
  revalidatePath("/app/impor");
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
      "Kredensial Mengantar belum disimpan.",
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
    );
  } catch (error) {
    if (error instanceof ManagedMengantarSecretInvalidError) {
      return credentialFailureState(
        "Periksa kembali kredensial yang ditandai.",
        { apiKey: "API key wajib diisi dan tidak boleh melebihi 512 karakter." },
      );
    }
    if (error instanceof ManagedMengantarSecretRateLimitedError) {
      return credentialFailureState(
        "Terlalu banyak percobaan perubahan kredensial. Coba lagi beberapa menit lagi.",
      );
    }
    if (
      error instanceof ManagedMengantarSecretDeniedError
      || error instanceof ManagedMengantarSecretUnavailableError
    ) {
      return credentialFailureState("Kredensial Mengantar belum dapat disimpan.");
    }
    return credentialFailureState("Kredensial Mengantar belum dapat disimpan. Coba lagi.");
  }

  revalidateOutletConfigurationPaths();
  return {
    message: "Kredensial privat Mengantar tersimpan dengan aman.",
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
    );
    await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => restorePlatformDefaultMengantarConnection(
        tx,
        context,
        outletId,
        assertPlatformDefaultMengantarCredentialsComplete,
      ),
    );
  } catch (error) {
    if (error instanceof ManagedMengantarSecretRateLimitedError) {
      return credentialFailureState(
        "Terlalu banyak percobaan perubahan koneksi. Coba lagi beberapa menit lagi.",
      );
    }
    if (error instanceof MengantarConfigurationError) {
      return credentialFailureState(
        "Default platform belum lengkap. Koneksi privat tetap dipertahankan.",
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
    message: "Outlet sekarang memakai default platform Mengantar.",
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
      }));
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
      setDefaultOutletPickupPointRow(tx, context, outletId, pickupAddressId));
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
      removeOutletPickupPointRow(tx, context, outletId, pickupAddressId));
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
    return { error: "Awalan harus 2–5 huruf besar atau angka, tanpa spasi.", resultToken: randomUUID() };
  }
  if (typeof attemptId !== "string" || !UUID_PATTERN.test(attemptId) || formData.get("confirmation") !== "locked") {
    return { error: "Konfirmasi penguncian awalan diperlukan. Muat ulang halaman lalu coba lagi.", resultToken: randomUUID() };
  }
  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      saveTenantShipmentPrefix(tx, context, prefix, attemptId));
  } catch (error) {
    if (error instanceof ShipmentPrefixLockedError) {
      return { error: "Awalan sudah terkunci dan tidak dapat diubah. Hubungi Super Admin bila ada kesalahan.", resultToken: randomUUID() };
    }
    if (error instanceof ShipmentPrefixInvalidError) {
      return { error: "Awalan harus 2–5 huruf besar atau angka, tanpa spasi.", resultToken: randomUUID() };
    }
    if (error instanceof ShipmentPrefixDeniedError || error instanceof TenantContextDeniedError) {
      return { error: "Hanya Tenant Admin yang dapat mengatur awalan nomor kiriman.", resultToken: randomUUID() };
    }
    return { error: "Awalan belum dapat disimpan. Coba lagi.", resultToken: randomUUID() };
  }
  // Every screen that shows a shipment number must pick up the new prefix.
  revalidatePath("/app", "layout");
  return { savedPrefix: prefix, resultToken: randomUUID() };
}
