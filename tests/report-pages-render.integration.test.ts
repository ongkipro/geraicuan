import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { paginateRows, printHistoryHref, printSequenceLabel } from "@/app/app/laporan/cetak-resi/print-history-logic";
import { PrintHistoryView, type PrintHistoryViewProps } from "@/app/app/laporan/cetak-resi/print-history-view";
import {
  activeFilterCount,
  courierPerformancePoints,
  reportAnalyticsView,
  reportCarry,
  reportExportHref,
} from "@/app/app/laporan/pengiriman/report-logic";
import { ShipmentReportView, type ShipmentReportViewProps } from "@/app/app/laporan/pengiriman/report-view";
import { pageWindow } from "@/app/app/laporan/_components/report-pagination";
import type { ShipmentReportRow } from "@/db/shipment-report-repository";
import type { PrintHistoryRow } from "@/db/label-print-repository";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import { parseAreaRegion } from "@/lib/label-format";
import { formatRate, groupRegions, groupRoutes, returnRate, UNKNOWN_REGION_LABEL } from "@/lib/shipment-report-analytics";

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

const areaRows = [
  { areaLabel: "PANAKKUKANG, PANAKKUKANG, KOTA MAKASSAR, SULAWESI SELATAN, 90231", deliveredCount: 3, outletId: "o-1", outletName: "Gudang Jakarta Barat", returnedCount: 1, shipmentCount: 5 },
  { areaLabel: "Panaikang, Panakkukang, Kota Makassar, Sulawesi Selatan, 90231", deliveredCount: 1, outletId: "o-2", outletName: "Kios Tanah Abang", returnedCount: 1, shipmentCount: 2 },
  { areaLabel: "Kebon Jeruk, Kebon Jeruk, Kota Jakarta Barat, DKI Jakarta, 11530", deliveredCount: 0, outletId: "o-1", outletName: "Gudang Jakarta Barat", returnedCount: 0, shipmentCount: 3 },
  { areaLabel: "Kecamatan 9, Kota 9", deliveredCount: 0, outletId: "o-1", outletName: "Gudang Jakarta Barat", returnedCount: 0, shipmentCount: 1 },
  ...Array.from({ length: 11 }, (_, index) => ({
    areaLabel: `Area ${index}, Distrik ${index}, Kota Contoh ${index}, Provinsi Contoh ${index}, 1000${index % 10}`,
    deliveredCount: 0, outletId: "o-1", outletName: "Gudang Jakarta Barat", returnedCount: 0, shipmentCount: 1,
  })),
];
const analyticsRange = parseAnalyticsRange({ rentang: "kustom", dari: "2026-09-20", sampai: "2026-09-25", tz: "Asia/Jakarta" }, new Date("2026-09-26T00:00:00Z"));
const analytics = reportAnalyticsView(analyticsRange, {
  areas: areaRows,
  kpis: { codDisbursementEstimateIdr: 201_762, codOrderCount: 3, codValueIdr: 666_480, deliveredCount: 4, failedCount: 1, inProgressCount: 20, returnedCount: 2, shipmentCount: 27 },
  trend: [{ codCount: 2, codValueIdr: 444_320, key: "2026-09-22", nonCodCount: 1 }, { codCount: 1, codValueIdr: 222_160, key: "2026-09-25", nonCodCount: 0 }],
});

function reportProps(overrides: Partial<ShipmentReportViewProps> = {}): ShipmentReportViewProps {
  const carry = { kurir: "JNE", rentang: "30-hari", tz: "Asia/Jakarta" };
  return {
    activeCount: 1,
    analytics,
    carry,
    data: {
      generatedAt: new Date(),
      page: 1,
      pageSize: 20,
      rows: [reportRow(1), reportRow(2, { codDisbursementEstimateIdr: null, codFeeIdr: null, courier: null, isCod: false, paymentMethod: "NON_COD", providerService: null, shippingCostIdr: null, status: "DRAFT" })],
      totals: {
        byCourier: [{ codDisbursementEstimateIdr: 95_000, codFeeIdr: 2_979, courier: "JNE", deliveredCount: 6, returnedCount: 2, shipmentCount: 10, shippingCostIdr: 21_000 }],
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
  const start = html.search(new RegExp(`<table data-slot="table" class="[^"]*" aria-label="${label}"`));
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

describe("Laporan pengiriman analytics logic (T-235)", () => {
  it("reads city and province from the end of an area label, unknown when it cannot", () => {
    expect(parseAreaRegion("PANAKKUKANG, PANAKKUKANG, KOTA MAKASSAR, SULAWESI SELATAN, 90231")).toEqual({
      city: { key: "KOTA MAKASSAR", name: "Kota Makassar" },
      province: { key: "SULAWESI SELATAN", name: "Sulawesi Selatan" },
    });
    // A comma inside the subdistrict never shifts the result; no postal code is fine.
    expect(parseAreaRegion("20 Ilir D. I, Ilir Timur I, Kota Palembang, Sumatera Selatan, 30128")?.city.name).toBe("Kota Palembang");
    expect(parseAreaRegion("Kel, A, B, Kec, Kota  Bandung , Jawa Barat")?.city.key).toBe("KOTA BANDUNG");
    expect(parseAreaRegion("DKI JAKARTA, x, KOTA JAKARTA BARAT, DKI JAKARTA")?.province.name).toBe("DKI Jakarta");
    for (const label of ["Kecamatan 4, Kota 4", "Kota Bandung, 40191", "", " , , 12345", null]) {
      expect(parseAreaRegion(label), String(label)).toBeNull();
    }
  });

  it("groups wilayah casing-blind, unknown last, and sums to the cohort; routes skip the unknown", () => {
    const { cities, provinces } = groupRegions(areaRows);
    expect(provinces[0]).toMatchObject({ deliveredCount: 4, name: "Sulawesi Selatan", returnedCount: 2, shipmentCount: 7 });
    expect(provinces.at(-1)?.name).toBe(UNKNOWN_REGION_LABEL);
    expect(provinces.reduce((sum, row) => sum + row.shipmentCount, 0)).toBe(22);
    expect(cities.reduce((sum, row) => sum + row.shipmentCount, 0)).toBe(22);
    expect(cities[0]).toMatchObject({ name: "Kota Makassar", province: "Sulawesi Selatan", shipmentCount: 7 });
    const routes = groupRoutes(areaRows);
    expect(routes).toHaveLength(5);
    expect(routes[0]).toMatchObject({ city: "Kota Makassar", outletName: "Gudang Jakarta Barat", shipmentCount: 5 });
    expect(routes.some((route) => route.city === UNKNOWN_REGION_LABEL)).toBe(false);
  });

  it("formats rates with one decimal and a dash without a denominator", () => {
    expect(formatRate(returnRate({ deliveredCount: 2, returnedCount: 1 }))).toBe("33,3%");
    expect(formatRate(returnRate({ deliveredCount: 0, returnedCount: 0 }))).toBe("—");
  });

  it("fills every day of the range so a quiet day is a zero, not a gap", () => {
    expect(analytics.trend.map((point) => [point.cod, point.nonCod])).toEqual([[0, 0], [0, 0], [2, 1], [0, 0], [0, 0], [1, 0]]);
    expect(analytics.granularity).toBe("harian");
  });
});

describe("Laporan pengiriman view", () => {
  it("renders the report with an outline export, seven list columns and pagination that keeps the filters", () => {
    const html = render(createElement(ShipmentReportView, reportProps()));
    expect(filledButtons(html)).toBe(0);
    expect(html).toContain('href="/app/laporan/pengiriman/export.csv?kurir=JNE&amp;rentang=30-hari&amp;tz=Asia%2FJakarta"');
    expect(tableHeaders(html, "Daftar kiriman")).toEqual(["Nomor", "Dibuat", "Penerima", "Kurir/Layanan", "Status", "Pembayaran", "Biaya Mengantar"]);
    expect(tableHeaders(html, "Total per kurir")).toEqual(["Kurir", "Kiriman", "% terkirim", "% retur", "Ongkir Mengantar", "Biaya COD", "Estimasi cair"]);
    // JNE: 6 of 10 delivered; 2 of 8 finished returned. The logo alone names the courier.
    expect(html).toContain("60,0%");
    expect(html).toContain("25,0%");
    expect(html).toContain('alt="JNE"');
    // Area as "Kecamatan, Kota" without the postal code or province.
    expect(html).toContain("Panakkukang, Kota Makassar");
    expect(html).not.toContain("90231");
    expect(html).toContain("Menampilkan 1–20 dari 45 kiriman");
    expect(html).toContain('href="/app/laporan/pengiriman?kurir=JNE&amp;rentang=30-hari&amp;tz=Asia%2FJakarta&amp;halaman=2"');
    // No slop lines from the old report.
    for (const slop of ["baris", "Geser", "diurutkan"]) expect(html).not.toContain(slop);
    expect(html).toContain('data-slot="record-list"');
  });

  it("renders the T-235 KPI strip, trend, status distribution, wilayah and routes", () => {
    const html = render(createElement(ShipmentReportView, reportProps()));
    for (const title of ["Ringkasan", "Total kiriman", "Terkirim", "Retur", "Masih berjalan", "Nilai COD", "Estimasi cair", "Tren harian", "Distribusi status", "Wilayah tujuan", "Rute teratas"]) {
      expect(html, title).toContain(title);
    }
    // Terkirim 4 of 27; Retur 2 of 6 finished (4 + 2).
    expect(html).toContain("14,8% dari 27 kiriman");
    expect(html).toContain("33,3% dari 6 selesai");
    expect(html).toMatch(/Rp\s666\.480/);
    // Tabs are real tabs: a labelled tablist, keyboard-reachable triggers.
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Tampilan tren"');
    expect(html).toContain("Nilai COD per hari");
    expect(html).toContain('aria-label="Kelompok wilayah"');
    expect(html).toContain("Per kota");
    // Trend data table: every day of the range, newest first.
    expect(tableHeaders(html, "Data tren")).toEqual(["Tanggal", "COD", "Non-COD", "Nilai COD"]);
    expect(html).toContain("Lihat tabel data tren");
    // Status distribution replaces the old table, keeping badge, count and share.
    expect(html).not.toContain("Total per status");
    expect(html).toContain('aria-label="Distribusi status"');
    expect(html).toMatch(/data-status="ISSUED"[\s\S]*?50,0%/);
    // Wilayah: top 10 visible, the rest behind the disclosure, unknown named.
    expect(tableHeaders(html, "Kiriman per provinsi")).toEqual(["Wilayah", "Kiriman", "Terkirim", "Retur", "% retur"]);
    expect(html).toContain("Tampilkan semua (14 provinsi)");
    expect(html).toContain(UNKNOWN_REGION_LABEL);
    expect(html).toContain("Sulawesi Selatan");
    // Routes: outlet → city.
    expect(tableHeaders(html, "Rute teratas")).toEqual(["Rute", "Kiriman", "% terkirim", "% retur"]);
    expect(html).toContain("Kota Makassar");
    expect(filledButtons(html)).toBe(0);
  });

  it("keeps the totals and the list when the analytics read failed", () => {
    const html = render(createElement(ShipmentReportView, reportProps({ analytics: null })));
    expect(html).toContain("Ringkasan dan analitik tidak dapat dimuat");
    expect(html).toContain("Total per kurir");
    expect(html).toContain("Daftar kiriman");
    expect(html).not.toContain("Wilayah tujuan");
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
