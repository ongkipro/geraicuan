/**
 * T-177 (owner decision 2026-09-17, "Laporan saja"): GeraiCUAN reports shipping
 * and the COD fee, never merchandise revenue, goods value, COGS or margin.
 * D-3b is withdrawn and T-91 resolves as a withdrawal; this file proves the
 * removal on the rendered surfaces, the read-model types and the exports.
 * Sibling guards: `analytics-repository` (the KPI read model's exact keys),
 * `shipment-draft` (a posted COGS is neither parsed nor stored),
 * `dashboard-period-page` and `report-pages-render` (whole-page renders).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/actions", () => ({
  saveShipmentDraft: vi.fn(),
  searchRecipientShipmentContacts: vi.fn(),
  searchSenderShipmentContacts: vi.fn(),
  selectShipmentContact: vi.fn(),
}));
vi.mock("@/app/app/estimate-actions", () => ({ loadShipmentEstimate: vi.fn() }));
vi.mock("@/app/app/location-actions", () => ({ searchMengantarDestinationAreas: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AnalyticsFinancialRegion } from "@/app/app/analitik/analytics-regions";
import { ShipmentDraftForm } from "@/app/app/shipment-draft-form";
import type { ShipmentKpiComparison, ShipmentKpis } from "@/db/analytics-repository";
import type { ShipmentReportCourierTotal, ShipmentReportRow } from "@/db/shipment-report-repository";
import type { TenantDashboardPeriodMetrics } from "@/db/tenant-dashboard-repository";
import { serializeAnalyticsCsv, serializeShipmentReportCsv } from "@/lib/analytics-export";
import type { ShipmentDraftInput } from "@/lib/shipment-draft";
import { SHIPMENT_REPORT_COLUMNS } from "@/lib/shipment-report";

/** Words that name a merchandise figure in Indonesian or English UI copy. */
const MERCHANDISE_FIGURE = /margin|laba|profit|keuntungan|omset|omzet|cogs|\bhpp\b|pokok cod|nilai barang|pendapatan|revenue/i;

const visible = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

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

const kpis: ShipmentKpis = {
  codDisbursementEstimateIdr: 202_000,
  codServiceFeeIdr: 6_450,
  codVatIdr: 710,
  createdCount: 3,
  issuedCount: 2,
  providerShippingIdr: 25_000,
  resolvedSubmissionCount: 2,
};
const comparison: ShipmentKpiComparison = {
  backlogSnapshot: { asOf: new Date("2026-09-15T01:00:00Z"), awaitingPaymentCount: 0, needsActionCount: 0 },
  current: kpis,
  eventGeneratedAt: new Date("2026-09-15T01:00:00Z"),
  previous: kpis,
};

describe("merchandise figures are withdrawn (T-177)", () => {
  it("renders the analytics money region as shipping, COD fee and Mengantar's disbursement only", async () => {
    const text = visible(renderToStaticMarkup(await AnalyticsFinancialRegion({ promise: Promise.resolve(comparison) })));

    expect(text).not.toMatch(MERCHANDISE_FIGURE);
    expect(text).toContain("Biaya kirim Mengantar");
    expect(text).toContain("Biaya COD");
    expect(text).toContain("Estimasi dana dicairkan Mengantar");
    // The COD fee card is the service fee plus its VAT.
    expect(text).toContain("Rp 7.160");
  });

  it("no longer asks the operator for a goods cost on Buat kiriman", () => {
    const markup = renderToStaticMarkup(createElement(ShipmentDraftForm, {
      autoFocusFirstField: false,
      outlets: [{ id: "00000000-0000-0000-0000-000000000027", name: "Outlet fixture", pickupPoints: [] }],
      submissionId: "00000000-0000-4000-8000-000000000177",
    }));

    expect(markup).not.toMatch(/name="cogsAmount"/);
    // "Nilai barang" stays: it is the declared value the courier insures and COD
    // is computed from, an input rather than a reported figure.
    expect(visible(markup)).not.toMatch(/margin|laba|profit|cogs|\bhpp\b|modal/i);
  });

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

    const [analyticsHeader] = serializeAnalyticsCsv([]).replace("﻿", "").split("\r\n");
    expect(analyticsHeader).not.toMatch(MERCHANDISE_FIGURE);
  });
});
