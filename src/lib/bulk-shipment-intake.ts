import "server-only";

import { parse } from "csv-parse/sync";
import { BULK_TEMPLATE_HEADERS } from "@/lib/bulk-shipment-intake-contract";


import {
  validateShipmentDraft,
  type ShipmentDraftField,
  type ShipmentDraftInput,
} from "@/lib/shipment-draft";



const MAX_FILE_BYTES = 256 * 1024;
const MAX_RECORD_BYTES = 8 * 1024;
const MAX_ROWS = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELD_TO_HEADER: Record<ShipmentDraftField, (typeof BULK_TEMPLATE_HEADERS)[number]> = {
  declaredValue: "nilai_barang",
  destinationAreaId: "id_area_tujuan",
  destinationAreaLabel: "area_tujuan",
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
  area_tujuan: "destinationAreaLabel",
  berat_gram: "packageWeightGrams",
  id_area_tujuan: "destinationAreaId",
  isi_paket: "packageContent",
  jumlah_paket: "packageQuantity",
  lebar_cm: "packageWidthCm",
  metode_pembayaran: "paymentType",
  nama_penerima: "recipientName",
  nama_pengirim: "senderName",
  nilai_barang: "declaredValue",
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

export type BulkFileError = { code: BulkFileErrorCode; message: string };
export type BulkRowError = {
  field: (typeof BULK_TEMPLATE_HEADERS)[number];
  message: string;
  row: number;
};
export type BulkValidRow = {
  input: ShipmentDraftInput;
  row: number;
};
export type BulkShipmentPreview = {
  errors: BulkRowError[];
  totalRows: number;
  validRows: BulkValidRow[];
};

function fileError(code: BulkFileErrorCode, message: string): BulkFileError {
  return { code, message };
}

function isExpectedHeader(row: string[]) {
  return row.length === BULK_TEMPLATE_HEADERS.length && row.every(
    (cell, index) => cell === BULK_TEMPLATE_HEADERS[index],
  );
}

function toFormData(row: string[], outletId: string) {
  const formData = new FormData();
  for (const [index, header] of BULK_TEMPLATE_HEADERS.entries()) {
    formData.set(FIELD_TO_FORM_NAME[header], row[index] ?? "");
  }
  formData.set("outletId", outletId);
  return formData;
}

export async function previewBulkShipmentCsv(
  file: File,
  outletId: string,
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

  const errors: BulkRowError[] = [];
  const validRows: BulkValidRow[] = [];
  for (const [index, row] of dataRows.entries()) {
    const rowNumber = index + 2;
    const validation = validateShipmentDraft(toFormData(row, outletId));
    if (validation.ok) {
      validRows.push({ input: validation.input, row: rowNumber });
      continue;
    }

    for (const [field, message] of Object.entries(validation.errors) as Array<[
      ShipmentDraftField,
      string,
    ]>) {
      errors.push({ field: FIELD_TO_HEADER[field], message, row: rowNumber });
    }
  }

  return { errors, totalRows: dataRows.length, validRows };
}
