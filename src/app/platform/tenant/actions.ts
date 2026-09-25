"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { resolvePlatformAccess } from "@/app/platform/platform-access";
import { db } from "@/db/client";
import { characterClassError, normalizeFieldText } from "@/lib/field-character-classes";
import {
  executeTenantLifecycle,
  TenantLifecycleAttemptConflictError,
  TenantLifecycleDeniedError,
  TenantLifecycleInputError,
  type TenantLifecycleAction,
} from "@/db/tenant-lifecycle";

export type PlatformTenantLifecycleState = {
  errors?: {
    attemptId?: string;
    confirmation?: string;
    confirmationName?: string;
    tenantId?: string;
    tenantName?: string;
  };
  outcome?: "success" | "invalid" | "denied" | "error";
  message?: string;
  nextAttemptId?: string;
  resultToken?: string;
  tenant?: { id: string; name: string; status: string };
  values?: { name?: string; expectedName?: string };
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function lifecycleAction(value: string | undefined): TenantLifecycleAction | null {
  return value === "create" || value === "suspend" || value === "reactivate"
    ? value
    : null;
}

export async function submitPlatformTenantLifecycle(
  _previous: PlatformTenantLifecycleState,
  formData: FormData,
): Promise<PlatformTenantLifecycleState> {
  const access = await resolvePlatformAccess();
  if (access.status !== "authorized") {
    return {
      outcome: "denied",
      message: "Akses Super Admin diperlukan.",
      resultToken: randomUUID(),
    };
  }

  const action = lifecycleAction(formString(formData, "lifecycleAction"));
  const confirmation = formString(formData, "confirmation");
  const attemptId = formString(formData, "attemptId");
  const tenantId = formString(formData, "tenantId")?.trim();
  const rawName = formString(formData, "tenantName");
  const name = rawName === undefined ? undefined : normalizeFieldText(rawName);
  const expectedName = formString(formData, "confirmationName")?.trim();
  const values = action === "create" ? { name } : { expectedName };
  if (!action) {
    return {
      errors: { confirmation: "Tindakan siklus tenant tidak valid." },
      outcome: "invalid",
      message: "Periksa kembali tindakan yang dipilih.",
      nextAttemptId: UUID_PATTERN.test(attemptId ?? "") ? attemptId : randomUUID(),
      resultToken: randomUUID(),
      values,
    };
  }
  const errors: NonNullable<PlatformTenantLifecycleState["errors"]> = {};
  if (!attemptId || !UUID_PATTERN.test(attemptId)) {
    errors.attemptId = "Identitas permintaan tidak valid. Muat ulang formulir.";
  }
  if (confirmation !== "confirmed") {
    errors.confirmation = "Konfirmasi eksplisit diperlukan sebelum status tenant diubah.";
  }
  if (action === "create") {
    if (!name) errors.tenantName = "Nama tenant wajib diisi.";
    else if (name.length > 120 || characterClassError("BUSINESS_NAME", "Nama tenant", name)) {
      errors.tenantName = "Nama tenant maksimal 120 karakter dan tidak boleh memuat karakter kontrol.";
    }
  } else {
    if (!tenantId || !UUID_PATTERN.test(tenantId)) {
      errors.tenantId = "Identitas tenant tidak valid. Muat ulang halaman.";
    }
    if (!expectedName) errors.confirmationName = "Ketik nama tenant untuk mengonfirmasi.";
    else if (expectedName.length > 120 || /[\u0000-\u001f\u007f]/u.test(expectedName)) {
      errors.confirmationName = "Nama konfirmasi maksimal 120 karakter dan tidak boleh memuat karakter kontrol.";
    }
  }
  if (Object.keys(errors).length > 0) {
    return {
      errors,
      outcome: "invalid",
      message: "Periksa field yang ditandai lalu kirim ulang.",
      nextAttemptId: UUID_PATTERN.test(attemptId ?? "") ? attemptId : randomUUID(),
      resultToken: randomUUID(),
      values,
    };
  }
  const input = action === "create"
    ? { attemptId, name }
    : { attemptId, tenantId, expectedName };

  try {
    const tenant = await executeTenantLifecycle(
      db,
      access.principal,
      action,
      input,
    );

    revalidatePath("/platform/tenant");
    revalidatePath(`/platform/tenant/${tenant.id}`);
    revalidatePath("/platform/audit");
    const resultName = action === "create" ? name! : expectedName!;
    return {
      outcome: "success",
      message: action === "create"
        ? `Tenant ${resultName} berhasil dibuat.`
        : action === "suspend"
          ? `Tenant ${resultName} berhasil ditangguhkan.`
          : `Tenant ${resultName} berhasil diaktifkan kembali.`,
      nextAttemptId: randomUUID(),
      resultToken: randomUUID(),
      tenant: { id: tenant.id, name: resultName, status: tenant.status },
    };
  } catch (error) {
    if (error instanceof TenantLifecycleDeniedError) {
      return {
        errors: action === "create"
          ? { confirmation: "Tenant tidak dapat dibuat." }
          : { confirmationName: "Nama tenant tidak cocok atau status sudah berubah." },
        outcome: "denied",
        message: "Tenant tidak ditemukan, status berubah, atau nama konfirmasi tidak cocok.",
        nextAttemptId: randomUUID(),
        resultToken: randomUUID(),
        values,
      };
    }
    if (
      error instanceof TenantLifecycleAttemptConflictError
      || error instanceof TenantLifecycleInputError
    ) {
      return {
        errors: error instanceof TenantLifecycleAttemptConflictError
          ? { attemptId: "Identitas permintaan sudah digunakan untuk perubahan lain." }
          : { confirmation: "Data perubahan tenant tidak valid." },
        outcome: "invalid",
        message: error instanceof TenantLifecycleAttemptConflictError
          ? "Permintaan ini sudah dipakai untuk perubahan lain. Periksa kembali lalu kirim ulang."
          : "Data perubahan tenant tidak valid.",
        nextAttemptId: randomUUID(),
        resultToken: randomUUID(),
        values,
      };
    }
    return {
      outcome: "error",
      message: "Perubahan tenant gagal. Muat ulang halaman lalu coba kembali.",
      nextAttemptId: attemptId,
      resultToken: randomUUID(),
      values,
    };
  }
}
