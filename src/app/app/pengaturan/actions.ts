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
  OutletConnectionModeUnavailableError,
  OutletSettingsDeniedError,
  OutletSettingsInvalidError,
  updateOutletReadiness,
} from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import {
  assertPlatformDefaultMengantarCredentialsComplete,
  MengantarConfigurationError,
} from "@/lib/mengantar-credentials";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OPAQUE_IDENTIFIER_LENGTH = 160;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

type OutletSettingsField =
  | "outletId"
  | "defaultPickupAddressId"
  | "defaultOriginAreaId"
  | "connectionMode";

export type OutletSettingsActionState = {
  errors?: Partial<Record<OutletSettingsField, string>>;
  message?: string;
  resultToken?: string;
  success?: boolean;
  values?: {
    defaultPickupAddressId: string;
    defaultOriginAreaId: string;
    connectionMode: "platform_default" | "private";
  };
};

type MengantarCredentialField = "apiKey" | "confirmation" | "outletId";

export type MengantarCredentialActionState = {
  errors?: Partial<Record<MengantarCredentialField, string>>;
  message?: string;
  resultToken?: string;
  success?: boolean;
};

function formString(formData: FormData, name: OutletSettingsField) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validateOpaqueIdentifier(
  value: string,
  label: string,
  field: OutletSettingsField,
  errors: Partial<Record<OutletSettingsField, string>>,
) {
  if (!value) {
    errors[field] = `${label} wajib diisi.`;
  } else if (
    value.length > MAX_OPAQUE_IDENTIFIER_LENGTH
    || CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    errors[field] = `${label} tidak valid.`;
  }
}

function safeReturnedIdentifier(value: string) {
  return value.length <= MAX_OPAQUE_IDENTIFIER_LENGTH
    && !CONTROL_CHARACTER_PATTERN.test(value)
    ? value
    : "";
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
  revalidatePath("/app/pengaturan");
  revalidatePath("/app");
  revalidatePath("/app/pengiriman/baru");
  revalidatePath("/app/impor");
}

function credentialFailureState(
  message: string,
  errors?: MengantarCredentialActionState["errors"],
): MengantarCredentialActionState {
  return { errors, message, resultToken: randomUUID() };
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

export async function saveOutletSettings(
  _previousState: OutletSettingsActionState,
  formData: FormData,
): Promise<OutletSettingsActionState> {
  const principal = await requireTenantAdminPrincipal();
  const outletId = formString(formData, "outletId");
  const defaultPickupAddressId = formString(
    formData,
    "defaultPickupAddressId",
  );
  const defaultOriginAreaId = formString(formData, "defaultOriginAreaId");
  const connectionModeValue = formString(formData, "connectionMode");
  const values = {
    defaultPickupAddressId: safeReturnedIdentifier(defaultPickupAddressId),
    defaultOriginAreaId: safeReturnedIdentifier(defaultOriginAreaId),
    connectionMode:
      connectionModeValue === "private" ? "private" as const : "platform_default" as const,
  };
  const errors: Partial<Record<OutletSettingsField, string>> = {};

  if (!UUID_PATTERN.test(outletId)) {
    errors.outletId = "Outlet tidak valid.";
  }
  validateOpaqueIdentifier(
    defaultPickupAddressId,
    "ID alamat pickup",
    "defaultPickupAddressId",
    errors,
  );
  validateOpaqueIdentifier(
    defaultOriginAreaId,
    "ID area asal",
    "defaultOriginAreaId",
    errors,
  );
  if (connectionModeValue !== "platform_default" && connectionModeValue !== "private") {
    errors.connectionMode = "Sumber koneksi tidak valid.";
  }
  if (Object.keys(errors).length > 0) {
    return {
      errors,
      message: "Periksa kembali pengaturan yang ditandai.",
      resultToken: randomUUID(),
      values,
    };
  }

  try {
    await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => updateOutletReadiness(tx, context, {
        outletId,
        defaultPickupAddressId,
        defaultOriginAreaId,
        connectionMode: connectionModeValue as "platform_default" | "private",
      }),
    );
  } catch (error) {
    if (error instanceof OutletConnectionModeUnavailableError) {
      return {
        errors: {
          connectionMode:
            "Koneksi privat aktif tidak dapat dialihkan ke default platform dari halaman ini.",
        },
        message: "Pengaturan belum disimpan.",
        resultToken: randomUUID(),
        values,
      };
    }
    if (
      error instanceof OutletSettingsDeniedError
      || error instanceof OutletSettingsInvalidError
    ) {
      return {
        message: "Pengaturan outlet tidak dapat diubah.",
        resultToken: randomUUID(),
        values,
      };
    }
    return {
      message: "Pengaturan belum dapat disimpan. Coba lagi.",
      resultToken: randomUUID(),
      values,
    };
  }

  revalidateOutletConfigurationPaths();
  return {
    message: "Pengaturan pickup outlet tersimpan. Status kesiapan terbaru ditampilkan pada kartu outlet.",
    resultToken: randomUUID(),
    success: true,
    values,
  };
}
