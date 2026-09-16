"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import {
  searchMengantarDestinationAreas,
  validateMengantarDestinationAreaSelection,
} from "@/app/app/location-actions";

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
import {
  lockMengantarAccountAuthority,
  MengantarConfigurationError,
  sameMengantarAccountAuthority,
} from "@/lib/mengantar-credentials";

type ConfirmableBulkPreviewRow = {
  confirmationToken: string;
  declaredValueIdr: number;
  destinationAreaLabel: string;
  destinationQuery: string;
  isCod: boolean;
  packageWeightGrams: number;
  recipientName: string;
  row: number;
};

type ConfirmableBulkPreview = Omit<BulkShipmentPreview, "validRows"> & {
  submissionId: string;
  validRows: ConfirmableBulkPreviewRow[];
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

function comparableLocation(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("id-ID");
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

  const result = await previewBulkShipmentCsv(
    file,
    outletId,
    async (query) => {
      const search = await searchMengantarDestinationAreas(outletId, query);
      if (!search.success) {
        return {
          message: search.message ?? "Lokasi tujuan belum dapat dicocokkan.",
          status: search.error ?? "unavailable",
        };
      }
      if (search.options.length === 0) {
        return {
          message: "Lokasi tidak ditemukan. Tambahkan detail wilayah lalu unggah ulang.",
          status: "no_result",
        };
      }
      const exact = search.options.filter((option) => (
        comparableLocation(option.areaLabel) === comparableLocation(query)
      ));
      const option = exact.length === 1
        ? exact[0]
        : search.options.length === 1
          ? search.options[0]
          : undefined;
      if (!option) {
        return {
          candidateLabels: search.options.slice(0, 3).map((candidate) => candidate.areaLabel),
          message: "Lokasi masih ambigu. Tambahkan detail wilayah lalu unggah ulang.",
          status: "ambiguous",
        };
      }
      return { option, status: "resolved" };
    },
  );
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
        confirmationToken: createBulkImportEnvelope(
          envelopeContext,
          submissionId,
          row.row,
          row.input,
          row.destinationQuery,
        ),
        declaredValueIdr: row.input.declaredValueIdr,
        destinationAreaLabel: row.input.destinationAreaLabel,
        destinationQuery: row.destinationQuery,
        isCod: row.input.isCod,
        packageWeightGrams: row.input.packageWeightGrams,
        recipientName: row.input.recipientName,
        row: row.row,
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

  const validatedAuthorities = new Map<string, Awaited<ReturnType<typeof validateMengantarDestinationAreaSelection>>>();
  for (const selected of selection.inputs) {
    const key = [
      selected.input.outletId,
      selected.destinationQuery,
      selected.input.destinationAreaId,
      selected.input.destinationAreaLabel,
    ].join("\u0000");
    if (validatedAuthorities.has(key)) continue;
    const validation = await validateMengantarDestinationAreaSelection(
      selected.input.outletId,
      selected.destinationQuery,
      selected.input.destinationAreaId,
      selected.input.destinationAreaLabel,
    );
    if (!validation.success || !validation.authority) {
      return {
        errors: [{
          field: "lokasi_tujuan",
          message: validation.message ?? "Lokasi tujuan berubah. Unggah ulang CSV.",
          row: selected.row,
        }],
        message: "Tidak ada draf yang dibuat.",
      };
    }
    validatedAuthorities.set(key, validation);
  }

  try {
    await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
      for (const { destinationQuery, input, row, submissionId } of selection.inputs) {
        const key = [
          input.outletId,
          destinationQuery,
          input.destinationAreaId,
          input.destinationAreaLabel,
        ].join("\u0000");
        const authority = validatedAuthorities.get(key)?.authority;
        const current = await lockMengantarAccountAuthority(tx, context, input.outletId);
        if (!authority || !sameMengantarAccountAuthority(authority, current)) {
          throw new MengantarConfigurationError();
        }
        await createShipmentDraft(
          tx,
          context,
          // The row's destination area was re-checked against this outlet's
          // Mengantar account above before any draft is written.
          { ...input, destinationAreaVerified: true },
          deriveBulkRowSubmissionId(submissionId, row),
        );
      }
    });
  } catch (error) {
    if (error instanceof MengantarConfigurationError) {
      return { message: "Koneksi Mengantar berubah. Tidak ada draf yang dibuat; unggah ulang CSV." };
    }
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
