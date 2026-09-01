"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import {
  createShipmentDraft,
  DraftSubmissionConflictError,
  OutletUnavailableError,
  requireConfiguredShipmentOutlet,
} from "@/db/shipment-draft-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import {
  type BulkFileError,
  type BulkRowError,
  type BulkShipmentPreview,
  type BulkValidRow,
  deriveBulkRowSubmissionId,
  previewBulkShipmentCsv,
} from "@/lib/bulk-shipment-intake";
import {
  BulkImportEnvelopeError,
  createBulkImportEnvelope,
  verifyBulkImportEnvelope,
} from "@/lib/bulk-import-envelope";
import {
  BulkImportRateLimitedError,
  enforceBulkImportRateLimit,
} from "@/lib/bulk-import-rate-limit";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

type ConfirmableBulkPreview = Omit<BulkShipmentPreview, "validRows"> & {
  submissionId: string;
  validRows: Array<BulkValidRow & { confirmationToken: string }>;
};

export type BulkUploadState = {
  fileError?: BulkFileError;
  preview?: ConfirmableBulkPreview;
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

async function consumeBulkPreviewAttempt(
  principal: Awaited<ReturnType<typeof requireBulkImportPrincipal>>,
) {
  await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    enforceBulkImportRateLimit(tx, context),
  );
}

export async function uploadBulkIntake(
  _previousState: BulkUploadState,
  formData: FormData,
): Promise<BulkUploadState> {
  const principal = await requireBulkImportPrincipal();
  try {
    await consumeBulkPreviewAttempt(principal);
  } catch (error) {
    if (error instanceof BulkImportRateLimitedError) {
      return {
        fileError: {
          code: "file",
          field: "csv",
          message: "Terlalu banyak percobaan impor. Coba lagi dalam beberapa menit.",
        },
      };
    }
    throw error;
  }

  const file = formData.get("csv");
  const outletId = formData.get("outletId");
  if (!(file instanceof File) || file.size === 0) {
    return { fileError: { code: "file", field: "csv", message: "Pilih berkas CSV." } };
  }
  if (typeof outletId !== "string" || !UUID_PATTERN.test(outletId)) {
    return { fileError: { code: "file", field: "outletId", message: "Pilih outlet asal." } };
  }

  try {
    await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
      requireConfiguredShipmentOutlet(tx, context, outletId),
    );
  } catch (error) {
    if (error instanceof OutletUnavailableError) {
      return { fileError: { code: "file", field: "outletId", message: "Pilih outlet asal." } };
    }
    throw error;
  }

  const result = await previewBulkShipmentCsv(file, outletId);
  if ("code" in result) {
    return { fileError: result };
  }
  const submissionId = randomUUID();
  const envelopeContext = { actorId: principal.userId, tenantId: principal.tenantId };
  return {
    preview: {
      ...result,
      submissionId,
      validRows: result.validRows.map((row) => ({
        ...row,
        confirmationToken: createBulkImportEnvelope(
          envelopeContext,
          submissionId,
          row.row,
          row.input,
        ),
      })),
    },
  };
}

function selectedInputsForPrincipal(
  formData: FormData,
  context: { actorId: string; tenantId: string },
): {
  errors: BulkRowError[];
  inputs: Array<ReturnType<typeof verifyBulkImportEnvelope>>;
} {
  const selected = formData.getAll("rowToken");
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
  const inputs: Array<ReturnType<typeof verifyBulkImportEnvelope>> = [];
  let submissionId: string | undefined;
  try {
    for (const selectedToken of selected) {
      if (typeof selectedToken !== "string") throw new BulkImportEnvelopeError();
      const payload = verifyBulkImportEnvelope(selectedToken, context);
      submissionId ??= payload.submissionId;
      if (payload.submissionId !== submissionId || seenRows.has(payload.row)) {
        throw new BulkImportEnvelopeError();
      }
      seenRows.add(payload.row);
      inputs.push(payload);
    }
  } catch (error) {
    if (error instanceof BulkImportEnvelopeError) {
      return {
        errors: [{ field: "nama_penerima", message: "Pilihan baris tidak valid atau kedaluwarsa. Unggah ulang CSV.", row: 0 }],
        inputs: [],
      };
    }
    throw error;
  }
  inputs.sort((left, right) => left.row - right.row);
  return { errors: [], inputs };
}

export async function createSelectedDrafts(
  _previousState: BulkConfirmState,
  formData: FormData,
): Promise<BulkConfirmState> {
  const principal = await requireBulkImportPrincipal();
  const selection = selectedInputsForPrincipal(formData, {
    actorId: principal.userId,
    tenantId: principal.tenantId,
  });
  if (selection.inputs.length === 0 && selection.errors.length === 0) {
    return { message: "Pilih minimal satu baris untuk dibuat." };
  }
  if (selection.errors.length > 0) {
    return { errors: selection.errors, message: "Tidak ada draf yang dibuat." };
  }

  try {
    await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
      for (const { input, row, submissionId } of selection.inputs) {
        await createShipmentDraft(
          tx,
          context,
          input,
          deriveBulkRowSubmissionId(submissionId, row),
        );
      }
    });
  } catch (error) {
    if (error instanceof OutletUnavailableError) {
      return { message: "Outlet asal tidak tersedia. Tidak ada draf yang dibuat." };
    }
    if (error instanceof DraftSubmissionConflictError) {
      return { message: "Sesi impor sudah berubah atau pernah digunakan. Tidak ada draf yang dibuat." };
    }
    throw error;
  }

  redirect("/app/pengiriman?status=DRAFT");
}
