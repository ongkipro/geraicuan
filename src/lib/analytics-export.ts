import type { ShipmentRow } from "@/db/analytics-repository";
import type { ShipmentReportRow } from "@/db/shipment-report-repository";
import { SHIPMENT_REPORT_COLUMNS } from "@/lib/shipment-report";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const FORMULA_PREFIX = /^[=+\-@]/;

function csvCell(value: string | number | boolean | null) {
  let normalized = value === null ? "" : String(value);
  normalized = normalized.replace(CONTROL_CHARACTERS, " ");
  if (FORMULA_PREFIX.test(normalized.trimStart())) normalized = `'${normalized}`;
  return `"${normalized.replaceAll('"', '""')}"`;
}

export function serializeAnalyticsCsv(rows: ShipmentRow[]) {
  const header = [
    "shipment_reference",
    "created_at_utc",
    "issued_at_utc",
    "outlet",
    "courier",
    "service",
    "lifecycle",
    "awb",
    "is_cod",
    "cod_amount_idr",
    "payment_method",
  ];
  const body = rows.map((row) => [
    row.publicReference,
    row.createdAt.toISOString(),
    row.issuedAt?.toISOString() ?? null,
    row.outletName,
    row.courier,
    row.providerService,
    row.status,
    row.cnoteNo,
    row.isCod,
    row.providerCodAmountIdr,
    row.paymentMethod,
  ]);
  return `\uFEFF${[header, ...body]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}\r\n`;
}

/**
 * PR-55 Laporan pengiriman export, on the same contract as the analytics one:
 * the same cell escaping, the same formula-injection guard, the same BOM and
 * CRLF. Header *and* body are read from `SHIPMENT_REPORT_COLUMNS`, each column
 * carrying its own `value`. The body used to be a hand-positional array beside
 * a derived header, which claimed they could not drift while a column added in
 * the middle would have shifted every data cell one place and left the file
 * silently misaligned.
 */
export function serializeShipmentReportCsv(rows: ShipmentReportRow[]) {
  const header = SHIPMENT_REPORT_COLUMNS.map((column) => column.csvHeader);
  const body = rows.map((row) => SHIPMENT_REPORT_COLUMNS.map((column) => column.value(row)));
  return `\uFEFF${[header, ...body]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}\r\n`;
}
