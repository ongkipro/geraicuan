import type { ShipmentRow } from "@/db/analytics-repository";

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
    "shipment_id",
    "created_at_utc",
    "issued_at_utc",
    "outlet",
    "courier",
    "service",
    "lifecycle",
    "awb",
    "is_cod",
    "cod_amount_idr",
  ];
  const body = rows.map((row) => [
    row.shipmentId,
    row.createdAt.toISOString(),
    row.issuedAt?.toISOString() ?? null,
    row.outletName,
    row.courier,
    row.providerService,
    row.status,
    row.cnoteNo,
    row.isCod,
    row.providerCodAmountIdr,
  ]);
  return `\uFEFF${[header, ...body]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}\r\n`;
}
