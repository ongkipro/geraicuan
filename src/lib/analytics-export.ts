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

/**
 * PR-55 Laporan pengiriman export: cell escaping with a formula-injection
 * guard, a BOM and CRLF. Header *and* body are read from `SHIPMENT_REPORT_COLUMNS`, each column
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
