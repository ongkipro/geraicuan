/**
 * T-177 (owner decision 2026-09-17, "Laporan saja"): GeraiCUAN reports shipping
 * and the COD fee, never merchandise revenue, goods value, COGS or margin.
 * D-3b is withdrawn and T-91 resolves as a withdrawal; this file proves the
 * removal on the read-model types, the draft input type and the exports.
 * Sibling guards: `analytics-repository` (the KPI read model's exact keys),
 * `shipment-draft` (a posted COGS is neither parsed nor stored).
 */
import { describe, expect, it } from "vitest";

import type { ShipmentKpis } from "@/db/analytics-repository";
import type { ShipmentReportCourierTotal, ShipmentReportRow } from "@/db/shipment-report-repository";
import type { TenantDashboardPeriodMetrics } from "@/db/tenant-dashboard-repository";
import { serializeShipmentReportCsv } from "@/lib/analytics-export";
import type { ShipmentDraftInput } from "@/lib/shipment-draft";
import { SHIPMENT_REPORT_COLUMNS } from "@/lib/shipment-report";

/** Words that name a merchandise figure in Indonesian or English UI copy. */
const MERCHANDISE_FIGURE = /margin|laba|profit|keuntungan|omset|omzet|cogs|\bhpp\b|pokok cod|nilai barang|pendapatan|revenue/i;

// Type-level removal: each line fails `tsc --noEmit` if the field comes back.
export function withdrawnFieldsStayWithdrawn(
  kpis: ShipmentKpis,
  dashboard: TenantDashboardPeriodMetrics,
  row: ShipmentReportRow,
  total: ShipmentReportCourierTotal,
  draft: ShipmentDraftInput,
) {
  // @ts-expect-error T-177 withdrew net margin.
  void kpis.netMarginIdr;
  // @ts-expect-error T-177 withdrew COGS.
  void kpis.cogsIdr;
  // @ts-expect-error T-177 withdrew the COD principal (goods value) KPI.
  void kpis.codPrincipalIdr;
  // @ts-expect-error T-177 withdrew the dashboard goods-value sum.
  void dashboard.codDeclaredValueIdr;
  // @ts-expect-error T-177 withdrew the dashboard goods-value sum.
  void dashboard.nonCodDeclaredValueIdr;
  // @ts-expect-error T-177 replaced the report's COD amount with fee and disbursement.
  void row.providerCodAmountIdr;
  // @ts-expect-error T-177 replaced the per-courier COD amount total.
  void total.codAmountIdr;
  // @ts-expect-error T-177 withdrew the COGS input.
  void draft.cogsAmountIdr;
}

describe("merchandise figures are withdrawn (T-177)", () => {
  it("exports shipping, COD fee and disbursement columns and no merchandise column", () => {
    const row: ShipmentReportRow = {
      codDisbursementEstimateIdr: 202_000,
      codFeeIdr: 7_160,
      courier: "JNE",
      createdAt: new Date("2026-09-03T03:00:00Z"),
      destinationAreaLabel: "Kebon Jeruk, Jakarta Barat",
      isCod: true,
      issuedAt: new Date("2026-09-03T04:00:00Z"),
      outletName: "Outlet",
      paymentMethod: "COD",
      printCount: 1,
      providerService: "JNE REG",
      publicReference: "GC-10002",
      shipmentId: "00000000-0000-5521-0000-000000000002",
      shippingCostIdr: 13_000,
      status: "DELIVERED",
    };
    const [header, body] = serializeShipmentReportCsv([row]).replace("﻿", "").split("\r\n");

    expect(header).not.toMatch(MERCHANDISE_FIGURE);
    expect(header).not.toMatch(/"cod_idr"|nilai_cod|goods|barang/);
    expect(header).toContain('"biaya_kirim_mengantar_idr","biaya_cod_idr","estimasi_dana_cair_mengantar_idr"');
    expect(body).toContain('"13000","7160","202000"');
    expect(SHIPMENT_REPORT_COLUMNS.map((column) => column.label).join(" ")).not.toMatch(MERCHANDISE_FIGURE);
  });
});
