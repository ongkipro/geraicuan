import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { paginateRows, printHistoryHref, printSequenceLabel } from "@/app/app/laporan/cetak-resi/print-history-logic";
import { PrintHistoryView, type PrintHistoryViewProps } from "@/app/app/laporan/cetak-resi/print-history-view";
import {
  activeFilterCount,
  courierPerformancePoints,
  reportCarry,
  reportExportHref,
} from "@/app/app/laporan/pengiriman/report-logic";
import { ShipmentReportView, type ShipmentReportViewProps } from "@/app/app/laporan/pengiriman/report-view";
import { pageWindow } from "@/app/app/laporan/_components/report-pagination";
import type { ShipmentReportRow } from "@/db/shipment-report-repository";
import type { PrintHistoryRow } from "@/db/label-print-repository";

/**
 * T-216 (UI v3): Laporan pengiriman and Riwayat cetak resi — pure logic and key markup of the
 * presentational views. No database; the pages only load data and hand it to these views.
 */

function reportRow(index: number, overrides: Partial<ShipmentReportRow> = {}): ShipmentReportRow {
  return {
    codDisbursementEstimateIdr: 95_000,
    codFeeIdr: 2_979,
    courier: "JNE",
    createdAt: new Date("2026-09-25T02:15:00Z"),
    destinationAreaLabel: "PANAKKUKANG, PANAKKUKANG, KOTA MAKASSAR, SULAWESI SELATAN, 90231",
    isCod: true,
    issuedAt: new Date("2026-09-25T02:20:00Z"),
    outletName: "Gudang Jakarta Barat",
    paymentMethod: "COD",
    printCount: 0,
    providerService: "JNEREG",
    publicReference: `GC-${10000 + index}`,
    shipmentId: `shipment-${index}`,
    shippingCostIdr: 21_000,
    status: "ISSUED",
    ...overrides,
  };
}

const range = { endDate: "2026-09-25", periodLabel: "27 Agu 2026 – 25 Sep 2026", presetId: "30-hari" as const, startDate: "2026-08-27" };

function reportProps(overrides: Partial<ShipmentReportViewProps> = {}): ShipmentReportViewProps {
  const carry = { kurir: "JNE", rentang: "30-hari", tz: "Asia/Jakarta" };
  return {
    activeCount: 1,
    carry,
    data: {
      generatedAt: new Date(),
      page: 1,
      pageSize: 20,
      rows: [reportRow(1), reportRow(2, { codDisbursementEstimateIdr: null, codFeeIdr: null, courier: null, isCod: false, paymentMethod: "NON_COD", providerService: null, shippingCostIdr: null, status: "DRAFT" })],
      totals: {
        byCourier: [{ codDisbursementEstimateIdr: 95_000, codFeeIdr: 2_979, courier: "JNE", shipmentCount: 1, shippingCostIdr: 21_000 }],
        byLifecycle: [{ shipmentCount: 1, status: "ISSUED" }, { shipmentCount: 1, status: "DRAFT" }],
        shipmentCount: 45,
      },
      totalPages: 3,
    },
    exportHref: reportExportHref(carry),
    filterRejected: false,
    filters: { courier: "JNE", lifecycleStatus: null, outletId: null },
    issues: [],
    options: { couriers: [{ label: "JNE", value: "JNE" }], outlets: [], statuses: [] },
    performance: [],
    range,
    ...overrides,
  };
}

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const filledButtons = (html: string) => (html.match(/data-slot="button"[^>]*data-variant="default"|data-variant="default"[^>]*data-slot="button"/g) ?? []).length;
const tableHeaders = (html: string, label: string) => {
  const start = html.indexOf(`<table data-slot="table" class="w-full caption-bottom text-sm tabular-nums" aria-label="${label}"`);
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(([, body]) => body.replace(/<[^>]+>/g, ""));
};

describe("Laporan pengiriman logic", () => {
  it("carries the filters, never the page, into the CSV link", () => {
    const carry = reportCarry(new URLSearchParams("rentang=7-hari&tz=Asia%2FJakarta&outlet=o-1&kurir=JNE&status=ISSUED&halaman=3"));
    expect(carry).toEqual({ kurir: "JNE", outlet: "o-1", rentang: "7-hari", status: "ISSUED", tz: "Asia/Jakarta" });
    expect(reportExportHref(carry)).toBe("/app/laporan/pengiriman/export.csv?rentang=7-hari&tz=Asia%2FJakarta&outlet=o-1&kurir=JNE&status=ISSUED");
  });

  it("counts only filters that differ from the default", () => {
    expect(activeFilterCount({ courier: null, lifecycleStatus: null, outletId: null, presetId: "30-hari" })).toBe(0);
    expect(activeFilterCount({ courier: "JNE", lifecycleStatus: "ISSUED", outletId: "o", presetId: "7-hari" })).toBe(4);
  });

  it("ranks low-volume couriers last and always shows the denominator", () => {
    const points = courierPerformancePoints([
      { courier: "SAP", issuedCount: 5, resolvedSubmissionCount: 5 },
      { courier: "JNE", issuedCount: 8, resolvedSubmissionCount: 10 },
      { courier: "JT", issuedCount: 0, resolvedSubmissionCount: 0 },
    ]);
    expect(points.map((point) => [point.courier, point.label, point.lowVolume])).toEqual([
      ["JNE", "80% · 8/10", false],
      ["SAP", "100% · 5/5", true],
    ]);
  });
});

describe("Laporan pengiriman view", () => {
  it("renders the report with an outline export, seven list columns and pagination that keeps the filters", () => {
    const html = render(createElement(ShipmentReportView, reportProps()));
    expect(filledButtons(html)).toBe(0);
    expect(html).toContain('href="/app/laporan/pengiriman/export.csv?kurir=JNE&amp;rentang=30-hari&amp;tz=Asia%2FJakarta"');
    expect(tableHeaders(html, "Daftar kiriman")).toEqual(["Nomor", "Dibuat", "Penerima", "Kurir/Layanan", "Status", "Pembayaran", "Biaya Mengantar"]);
    expect(tableHeaders(html, "Total per kurir")).toEqual(["Kurir", "Kiriman", "Ongkir Mengantar", "Biaya COD", "Estimasi cair"]);
    // Area as "Kecamatan, Kota" without the postal code or province.
    expect(html).toContain("Panakkukang, Kota Makassar");
    expect(html).not.toContain("90231");
    expect(html).toContain("Menampilkan 1–20 dari 45 kiriman");
    expect(html).toContain('href="/app/laporan/pengiriman?kurir=JNE&amp;rentang=30-hari&amp;tz=Asia%2FJakarta&amp;halaman=2"');
    // No slop lines from the old report.
    for (const slop of ["baris", "Geser", "diurutkan"]) expect(html).not.toContain(slop);
    expect(html).toContain('data-slot="record-list"');
  });

  it("degrades only the performance card when its read failed", () => {
    const html = render(createElement(ShipmentReportView, reportProps({ performance: null })));
    expect(html).toContain("Performa kurir tidak dapat dimuat");
    expect(html).toContain("Daftar kiriman");
  });

  it("shows the system-empty state with one primary and hides the export", () => {
    const props = reportProps({ activeCount: 0 });
    props.data = { ...props.data, rows: [], totals: { byCourier: [], byLifecycle: [], shipmentCount: 0 }, totalPages: 1 };
    const html = render(createElement(ShipmentReportView, props));
    expect(html).toContain("Belum ada kiriman pada periode ini");
    expect(html).not.toContain("Ekspor CSV");
    expect(filledButtons(html)).toBe(1);
  });

  it("shows the filtered-empty state with Hapus filter", () => {
    const props = reportProps();
    props.data = { ...props.data, rows: [], totals: { byCourier: [], byLifecycle: [], shipmentCount: 0 }, totalPages: 1 };
    const html = render(createElement(ShipmentReportView, props));
    expect(html).toContain("Tidak ada kiriman yang cocok dengan filter ini");
    expect(filledButtons(html)).toBe(0);
  });
});

function printRow(index: number, overrides: Partial<PrintHistoryRow> = {}): PrintHistoryRow {
  return {
    actorRole: "OPERATOR",
    outcome: "PRINTED",
    outletName: "Gudang Jakarta Barat",
    printEventId: `event-${index}`,
    printedAt: new Date("2026-09-25T04:45:00Z"),
    publicReference: `GC-${10000 + index}`,
    reasonCode: null,
    reprintCount: 0,
    sequence: 1,
    shipmentId: `shipment-${index}`,
    ...overrides,
  };
}

function printProps(overrides: Partial<PrintHistoryViewProps> = {}): PrintHistoryViewProps {
  return {
    activeCount: 0,
    carry: { rentang: "30-hari", tz: "Asia/Jakarta" },
    issues: [],
    loadedCount: 2,
    outletId: null,
    outlets: [],
    page: 1,
    range,
    rows: [printRow(1, { sequence: 2 }), printRow(2, { actorRole: "TENANT_ADMIN", outcome: "BLOCKED", reasonCode: "NOT_ISSUED", sequence: null })],
    totalCount: 2,
    totalPages: 1,
    ...overrides,
  };
}

describe("Riwayat cetak resi", () => {
  it("labels the print order and paginates the loaded rows", () => {
    expect([printSequenceLabel(1), printSequenceLabel(3), printSequenceLabel(null)]).toEqual(["Cetak pertama", "Cetak ulang #3", "—"]);
    const rows = Array.from({ length: 45 }, (_, index) => index);
    expect(paginateRows(rows, 3)).toEqual({ page: 3, rows: [40, 41, 42, 43, 44], totalPages: 3 });
    expect(paginateRows(rows, 9).page).toBe(3);
    expect(paginateRows([], 1)).toEqual({ page: 1, rows: [], totalPages: 1 });
    expect(pageWindow(3, 20, 45)).toEqual({ from: 41, to: 45 });
    expect(printHistoryHref(2, { outlet: "o-1", rentang: "7-hari" })).toBe("/app/laporan/cetak-resi?outlet=o-1&rentang=7-hari&halaman=2");
  });

  it("renders the card table with the six columns, the outcome and the reprint action", () => {
    const html = render(createElement(PrintHistoryView, printProps()));
    expect(tableHeaders(html, "Daftar aktivitas cetak")).toEqual(["Nomor", "Waktu", "Peran", "Hasil", "Urutan", "Tindakan"]);
    expect(html).toContain("Berhasil dicetak");
    expect(html).toContain("Ditolak sistem");
    expect(html).toContain("Nomor resi belum terbit");
    expect(html).toContain("Cetak ulang #2");
    expect(html).toContain('href="/app/label/10001"');
    expect(html).toContain("Coba lagi");
    expect(html).toContain("Menampilkan 1–2 dari 2 catatan");
    expect(filledButtons(html)).toBe(0);
    expect(html).not.toContain("realtime");
  });

  it("says when only the newest rows are listed", () => {
    const html = render(createElement(PrintHistoryView, printProps({ loadedCount: 200, totalCount: 350, totalPages: 10 })));
    expect(html).toContain("Menampilkan 1–20 dari 200 catatan terbaru (total 350)");
  });

  it("renders the empty and filtered-empty states without a filled primary", () => {
    const empty = render(createElement(PrintHistoryView, printProps({ loadedCount: 0, rows: [], totalCount: 0 })));
    expect(empty).toContain("Belum ada cetak resi pada periode ini");
    expect(filledButtons(empty)).toBe(0);
    const filtered = render(createElement(PrintHistoryView, printProps({ activeCount: 1, loadedCount: 0, rows: [], totalCount: 0 })));
    expect(filtered).toContain("Hapus filter");
  });
});
