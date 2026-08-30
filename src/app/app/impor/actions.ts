"use server";

import { redirect } from "next/navigation";

import {
  createShipmentDraft,
  OutletUnavailableError,
  requireConfiguredShipmentOutlet,
} from "@/db/shipment-draft-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import {
  type BulkFileError,
  type BulkRowError,
  type BulkShipmentPreview,
  previewBulkShipmentCsv,
} from "@/lib/bulk-shipment-intake";
import { BULK_INPUT_FIELDS } from "@/lib/bulk-shipment-intake-contract";
import {
  BulkImportRateLimitedError,
  enforceBulkImportRateLimit,
} from "@/lib/bulk-import-rate-limit";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { validateShipmentDraft, type ShipmentDraftInput } from "@/lib/shipment-draft";

export type BulkUploadState = {
  fileError?: BulkFileError;
  preview?: BulkShipmentPreview;
};

export type BulkConfirmState = {
  errors?: BulkRowError[];
  message?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireBulkImportPrincipal() {
  try {
    const principal = await requireCmsScope("tenant");
    if (principal.scope !== "tenant") {
      redirect("/login/tenant");
    }
    return principal;
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }
}

async function authorizeBulkAttempt(outletId?: string) {
  const principal = await requireBulkImportPrincipal();
  await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    enforceBulkImportRateLimit(tx, context),
  );
  if (outletId) {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      requireConfiguredShipmentOutlet(tx, context, outletId),
    );
  }
  return principal;
}

export async function uploadBulkIntake(
  _previousState: BulkUploadState,
  formData: FormData,
): Promise<BulkUploadState> {
  const file = formData.get("csv");
  const outletId = formData.get("outletId");
  if (!(file instanceof File) || file.size === 0) {
    return { fileError: { code: "file", message: "Pilih berkas CSV." } };
  }
  if (typeof outletId !== "string" || !UUID_PATTERN.test(outletId)) {
    return { fileError: { code: "file", message: "Pilih outlet asal." } };
  }

  try {
    await authorizeBulkAttempt(outletId);
  } catch (error) {
    if (error instanceof BulkImportRateLimitedError) {
      return {
        fileError: {
          code: "file",
          message: "Terlalu banyak percobaan impor. Coba lagi dalam beberapa menit.",
        },
      };
    }
    if (error instanceof OutletUnavailableError) {
      return { fileError: { code: "file", message: "Pilih outlet asal." } };
    }
    throw error;
  }

  const result = await previewBulkShipmentCsv(file, outletId);
  if ("code" in result) {
    return { fileError: result };
  }
  return { preview: result };
}

function selectedInputs(formData: FormData): { errors: BulkRowError[]; inputs: ShipmentDraftInput[] } {
  const selected = formData.getAll("baris");
  if (selected.length === 0) {
    return { errors: [], inputs: [] };
  }
  if (selected.length > 100) {
    return {
      errors: [{ field: "nama_penerima", message: "Maksimal 100 baris dapat dibuat sekaligus.", row: 0 }],
      inputs: [],
    };
  }

  const seenRows = new Set<number>();
  const errors: BulkRowError[] = [];
  const inputs: ShipmentDraftInput[] = [];
  for (const selectedRow of selected) {
    const row = typeof selectedRow === "string" ? Number(selectedRow) : Number.NaN;
    if (!Number.isInteger(row) || row < 2 || row > 101 || seenRows.has(row)) {
      return {
        errors: [{ field: "nama_penerima", message: "Baris yang dipilih tidak valid.", row: 0 }],
        inputs: [],
      };
    }
    seenRows.add(row);

    const rowFormData = new FormData();
    for (const field of BULK_INPUT_FIELDS) {
      const value = formData.get(`r${row}.${field}`);
      if (typeof value !== "string") {
        errors.push({ field: "nama_penerima", message: "Data baris tidak lengkap.", row });
        continue;
      }
      rowFormData.set(field, value);
    }
    if (errors.some((error) => error.row === row)) {
      continue;
    }

    const validation = validateShipmentDraft(rowFormData);
    if (validation.ok) {
      inputs.push(validation.input);
      continue;
    }
    errors.push(
      ...Object.values(validation.errors).map((message) => ({
        field: "nama_penerima" as const,
        message,
        row,
      })),
    );
  }

  return { errors, inputs };
}

export async function createSelectedDrafts(
  _previousState: BulkConfirmState,
  formData: FormData,
): Promise<BulkConfirmState> {
  const selection = selectedInputs(formData);
  if (selection.inputs.length === 0 && selection.errors.length === 0) {
    return { message: "Pilih minimal satu baris untuk dibuat." };
  }
  if (selection.errors.length > 0) {
    return { errors: selection.errors, message: "Tidak ada draf yang dibuat." };
  }

  try {
    const principal = await authorizeBulkAttempt();
    await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
      for (const input of selection.inputs) {
        await createShipmentDraft(tx, context, input);
      }
    });
  } catch (error) {
    if (error instanceof BulkImportRateLimitedError) {
      return { message: "Terlalu banyak percobaan impor. Coba lagi dalam beberapa menit." };
    }
    if (error instanceof OutletUnavailableError) {
      return { message: "Outlet asal tidak tersedia. Tidak ada draf yang dibuat." };
    }
    throw error;
  }

  redirect(`/app/impor?dibuat=${selection.inputs.length}`);
}
