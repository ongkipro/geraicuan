import "server-only";

import { createHash } from "node:crypto";

import { parse } from "csv-parse/sync";
import { BULK_TEMPLATE_HEADERS } from "@/lib/bulk-shipment-intake-contract";
import {
  validateShipmentDraft,
  type ShipmentDraftField,
  type ShipmentDraftInput,
} from "@/lib/shipment-draft";
import {
  MengantarLocationQueryError,
  normalizeMengantarAreaQuery,
  type MengantarDestinationAreaOption,
} from "@/lib/mengantar-locations";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_RECORD_BYTES = 8 * 1024;
const MAX_ROWS = 100;
export const MAX_BULK_DESTINATION_QUERIES = 10;
// T-54 intentionally permits one location lookup per tenant actor at a time.
const DESTINATION_RESOLUTION_CONCURRENCY = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELD_TO_HEADER: Record<ShipmentDraftField, (typeof BULK_TEMPLATE_HEADERS)[number]> = {
  declaredValue: "nilai_barang",
  destinationAreaId: "lokasi_tujuan",
  destinationAreaLabel: "lokasi_tujuan",
  // PR-47 operational fields have no bulk column either; `toFormData` never
  // sets them, so these entries only keep the record exhaustive. Give each its
  // own header before adding a column, otherwise a bad cell reports its error
  // against the header borrowed here.
  recipientAddressLandmark: "alamat_penerima",
  shippingInstruction: "isi_paket",
  // Bulk import has no pickup-point column: every imported draft leaves from
  // the outlet default, so `toFormData` never sets it either.
  pickupAddressId: "nama_pengirim",
  outletId: "nama_pengirim",
  packageContent: "isi_paket",
  packageHeightCm: "tinggi_cm",
  packageLengthCm: "panjang_cm",
  packageQuantity: "jumlah_paket",
  packageWeightGrams: "berat_gram",
  packageWidthCm: "lebar_cm",
  paymentType: "metode_pembayaran",
  recipientAddress: "alamat_penerima",
  recipientName: "nama_penerima",
  recipientPhone: "telepon_penerima",
  senderAddress: "alamat_pengirim",
  senderName: "nama_pengirim",
  senderPhone: "telepon_pengirim",
};

const FIELD_TO_FORM_NAME: Record<(typeof BULK_TEMPLATE_HEADERS)[number], string> = {
  alamat_penerima: "recipientAddress",
  alamat_pengirim: "senderAddress",
  berat_gram: "packageWeightGrams",
  isi_paket: "packageContent",
  jumlah_paket: "packageQuantity",
  lebar_cm: "packageWidthCm",
  metode_pembayaran: "paymentType",
  nama_penerima: "recipientName",
  nama_pengirim: "senderName",
  nilai_barang: "declaredValue",
  lokasi_tujuan: "destinationAreaLabel",
  panjang_cm: "packageLengthCm",
  telepon_penerima: "recipientPhone",
  telepon_pengirim: "senderPhone",
  tinggi_cm: "packageHeightCm",
};

type BulkFileErrorCode =
  | "file"
  | "header"
  | "row_limit"
  | "syntax";

export type BulkFileError = {
  code: BulkFileErrorCode;
  field: "csv" | "outletId";
  message: string;
};
export type BulkRowError = {
  candidateLabels?: string[];
  code?: BulkDestinationResolutionErrorCode;
  field: (typeof BULK_TEMPLATE_HEADERS)[number];
  message: string;
  query?: string;
  row: number;
};
export type BulkValidRow = {
  destinationQuery: string;
  input: ShipmentDraftInput;
  row: number;
};
export type BulkShipmentPreview = {
  errors: BulkRowError[];
  totalRows: number;
  uniqueDestinationQueries: number;
  validRows: BulkValidRow[];
};

export type BulkDestinationResolutionErrorCode =
  | "ambiguous"
  | "busy"
  | "invalid_query"
  | "no_result"
  | "rate_limited"
  | "stale_authority"
  | "unavailable";

export type BulkDestinationResolution =
  | { option: MengantarDestinationAreaOption; status: "resolved" }
  | {
      candidateLabels?: string[];
      message: string;
      status: BulkDestinationResolutionErrorCode;
    };

export type BulkDestinationResolver = (
  query: string,
) => Promise<BulkDestinationResolution>;

export function deriveBulkRowSubmissionId(submissionId: string, row: number) {
  const bytes = createHash("sha256")
    .update(`geraicuan:bulk:${submissionId}:${row}`)
    .digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

function fileError(code: BulkFileErrorCode, message: string): BulkFileError {
  return { code, field: "csv", message };
}

function isExpectedHeader(row: string[]) {
  return row.length === BULK_TEMPLATE_HEADERS.length && row.every(
    (cell, index) => cell === BULK_TEMPLATE_HEADERS[index],
  );
}

function toFormData(
  row: string[],
  outletId: string,
  destination: MengantarDestinationAreaOption,
) {
  const formData = new FormData();
  for (const [index, header] of BULK_TEMPLATE_HEADERS.entries()) {
    formData.set(FIELD_TO_FORM_NAME[header], row[index] ?? "");
  }
  formData.set("destinationAreaId", destination.areaId);
  formData.set("destinationAreaLabel", destination.areaLabel);
  formData.set("outletId", outletId);
  return formData;
}

async function resolveWithConcurrency(
  queries: readonly string[],
  resolveDestination: BulkDestinationResolver,
) {
  const results = new Map<string, BulkDestinationResolution>();
  let nextIndex = 0;
  await Promise.all(Array.from(
    { length: Math.min(DESTINATION_RESOLUTION_CONCURRENCY, queries.length) },
    async () => {
      while (nextIndex < queries.length) {
        const query = queries[nextIndex++]!;
        try {
          results.set(query, await resolveDestination(query));
        } catch {
          results.set(query, {
            message: "Lokasi Mengantar belum dapat dimuat. Coba unggah ulang.",
            status: "unavailable",
          });
        }
      }
    },
  ));
  return results;
}

export async function previewBulkShipmentCsv(
  file: File,
  outletId: string,
  resolveDestination: BulkDestinationResolver,
): Promise<BulkShipmentPreview | BulkFileError> {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return fileError("file", "Berkas harus CSV (.csv).");
  }
  if (file.type && file.type !== "text/csv" && file.type !== "text/plain") {
    return fileError("file", "Berkas harus CSV (.csv).");
  }
  if (file.size > MAX_FILE_BYTES) {
    return fileError("file", "Ukuran berkas maksimal 256 KB.");
  }
  if (!UUID_PATTERN.test(outletId)) {
    return fileError("file", "Pilih outlet asal.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return fileError("file", "Ukuran berkas maksimal 256 KB.");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fileError("syntax", "Berkas harus memakai UTF-8.");
  }
  if (text.includes("\0")) {
    return fileError("syntax", "Format CSV tidak valid.");
  }
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
  if (firstLine !== BULK_TEMPLATE_HEADERS.join(",")) {
    return fileError("header", "Judul kolom tidak sesuai template. Unduh template terbaru.");
  }


  let rows: string[][];
  try {
    rows = parse(text, {
      bom: true,
      delimiter: ",",
      escape: '"',
      max_record_size: MAX_RECORD_BYTES,
      quote: '"',
      record_delimiter: ["\r\n", "\n"],
      relax_column_count: false,
      relax_quotes: false,
      skip_empty_lines: false,
      skip_records_with_error: false,
    });
  } catch {
    return fileError("syntax", "Format CSV tidak valid. Periksa tanda kutip dan jumlah kolom.");
  }

  const [header, ...dataRows] = rows;
  if (!header || !isExpectedHeader(header)) {
    return fileError("header", "Judul kolom tidak sesuai template. Unduh template terbaru.");
  }
  if (dataRows.length === 0) {
    return fileError("file", "Berkas tidak berisi baris data.");
  }
  if (dataRows.length > MAX_ROWS) {
    return fileError("row_limit", "Maksimal 100 baris data per unggahan.");
  }

  const normalizedQueries = new Map<number, string>();
  const uniqueQueries = new Set<string>();
  for (const [index, row] of dataRows.entries()) {
    const query = row[BULK_TEMPLATE_HEADERS.indexOf("lokasi_tujuan")] ?? "";
    try {
      const normalized = normalizeMengantarAreaQuery(query);
      normalizedQueries.set(index, normalized);
      uniqueQueries.add(normalized);
    } catch (error) {
      if (!(error instanceof MengantarLocationQueryError)) throw error;
    }
  }
  if (uniqueQueries.size > MAX_BULK_DESTINATION_QUERIES) {
    return fileError(
      "row_limit",
      `Maksimal ${MAX_BULK_DESTINATION_QUERIES} lokasi tujuan unik per unggahan.`,
    );
  }
  const resolutions = await resolveWithConcurrency([...uniqueQueries], resolveDestination);

  const errors: BulkRowError[] = [];
  const validRows: BulkValidRow[] = [];
  for (const [index, row] of dataRows.entries()) {
    const rowNumber = index + 2;
    const query = normalizedQueries.get(index);
    const resolution = query ? resolutions.get(query) : undefined;
    const destination = resolution?.status === "resolved"
      ? resolution.option
      : { areaId: "unresolved", areaLabel: query || "unresolved" };
    const validation = validateShipmentDraft(toFormData(row, outletId, destination));
    if (!query) {
      errors.push({
        code: "invalid_query",
        field: "lokasi_tujuan",
        message: "Isi lokasi tujuan dengan 3 sampai 100 karakter.",
        row: rowNumber,
      });
    } else if (!resolution || resolution.status !== "resolved") {
      errors.push({
        candidateLabels: resolution?.candidateLabels,
        code: resolution?.status ?? "unavailable",
        field: "lokasi_tujuan",
        message: resolution?.message ?? "Lokasi tujuan belum dapat dicocokkan.",
        query,
        row: rowNumber,
      });
    }
    if (!validation.ok) {
      for (const [field, message] of Object.entries(validation.errors) as Array<[
        ShipmentDraftField,
        string,
      ]>) {
        if (field === "destinationAreaId" || field === "destinationAreaLabel") continue;
        errors.push({ field: FIELD_TO_HEADER[field], message, row: rowNumber });
      }
    }
    if (query && resolution?.status === "resolved" && validation.ok) {
      validRows.push({ destinationQuery: query, input: validation.input, row: rowNumber });
    }
  }

  return {
    errors,
    totalRows: dataRows.length,
    uniqueDestinationQueries: uniqueQueries.size,
    validRows,
  };
}
