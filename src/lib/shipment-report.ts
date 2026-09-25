/**
 * PR-55 Laporan pengiriman column contract.
 *
 * One list, read by the table header, by the CSV serializer and by the test
 * that binds every column to `docs/spec/19`, so a column can never exist on the
 * page, in the export and in the metrics contract under three different names.
 */
// Type-only, so nothing from the repository's `server-only` module graph is
// emitted into a bundle; `client-bundle-boundary` still holds.
import type { ShipmentReportRow } from "@/db/shipment-report-repository";

export type ShipmentReportColumn = {
  /** Column header in the CSV file. */
  csvHeader: string;
  /** Column header on the page. */
  label: string;
  /** Metric ID or stated raw field in `docs/spec/19`. */
  metricId: string;
  /** The row's value for this column, so header and body cannot disagree. */
  value: (row: ShipmentReportRow) => string | number | null;
};

export const SHIPMENT_REPORT_COLUMNS = [
  { csvHeader: "nomor_kiriman", label: "Nomor kiriman", metricId: "RPT-SHP-REFERENCE", value: (row) => row.publicReference },
  { csvHeader: "dibuat_wib", label: "Dibuat", metricId: "RPT-SHP-CREATED-AT", value: (row) => row.createdAt.toISOString() },
  { csvHeader: "resi_terbit_wib", label: "Resi terbit", metricId: "RPT-SHP-ISSUED-AT", value: (row) => row.issuedAt?.toISOString() ?? null },
  { csvHeader: "area_penerima", label: "Area penerima", metricId: "RPT-SHP-DESTINATION-AREA", value: (row) => row.destinationAreaLabel },
  { csvHeader: "kurir", label: "Kurir", metricId: "RPT-SHP-COURIER", value: (row) => row.courier },
  { csvHeader: "layanan", label: "Layanan", metricId: "RPT-SHP-SERVICE", value: (row) => row.providerService },
  { csvHeader: "lifecycle", label: "Status", metricId: "RPT-SHP-LIFECYCLE", value: (row) => row.status },
  { csvHeader: "pembayaran", label: "Pembayaran", metricId: "RPT-SHP-PAYMENT-MODE", value: (row) => row.paymentMethod },
  { csvHeader: "biaya_kirim_mengantar_idr", label: "Biaya kirim Mengantar (IDR)", metricId: "RPT-SHP-SHIPPING-COST-IDR", value: (row) => row.shippingCostIdr },
  { csvHeader: "biaya_cod_idr", label: "Biaya COD (IDR)", metricId: "RPT-SHP-COD-FEE-IDR", value: (row) => row.codFeeIdr },
  { csvHeader: "estimasi_dana_cair_mengantar_idr", label: "Estimasi dana dicairkan Mengantar (IDR)", metricId: "RPT-SHP-COD-DISBURSEMENT-EST-IDR", value: (row) => row.codDisbursementEstimateIdr },
  { csvHeader: "status_cetak", label: "Status cetak", metricId: "RPT-SHP-PRINT-STATE", value: (row) => row.printCount > 0 ? `SUDAH_DICETAK_${row.printCount}X` : "BELUM_DICETAK" },
] as const satisfies readonly ShipmentReportColumn[];

/**
 * The analytics export ceiling (PR-38), reused rather than restated: an export
 * above it is refused with the row count, never silently truncated.
 */
export const SHIPMENT_REPORT_EXPORT_MAX_ROWS = 10_000;

export const SHIPMENT_REPORT_PAGE_SIZE = 50;

export function shipmentReportHref(
  page: number,
  carry: Readonly<Record<string, string>>,
) {
  const params = new URLSearchParams(carry);
  params.delete("halaman");
  if (page > 1) params.set("halaman", String(page));
  const query = params.toString();
  return query ? `/app/laporan/pengiriman?${query}` : "/app/laporan/pengiriman";
}
