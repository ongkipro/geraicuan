import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { paginateRows, printHistoryHref, printSequenceLabel } from "@/app/app/laporan/cetak-resi/print-history-logic";
import { PrintHistoryView, type PrintHistoryViewProps } from "@/app/app/laporan/cetak-resi/print-history-view";
import { reportStatusGroups } from "@/app/app/laporan/pengiriman/analytics-sections";
import {
  activeFilterCount,
  courierPerformancePoints,
  reportAnalyticsView,
  reportCarry,
  reportExportHref,
  reportTrendTotals,
} from "@/app/app/laporan/pengiriman/report-logic";
import { ShipmentReportView, type ShipmentReportViewProps } from "@/app/app/laporan/pengiriman/report-view";
import { pageWindow } from "@/app/app/laporan/_components/report-pagination";
import type { ShipmentReportRow } from "@/db/shipment-report-repository";
import type { PrintHistoryRow } from "@/db/label-print-repository";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import { shipmentStatuses } from "@/lib/domain-enums";
import { parseAreaRegion } from "@/lib/label-format";
import { formatRate, groupRegions, groupRoutes, lowVolumeNote, returnRate, UNKNOWN_REGION_LABEL } from "@/lib/shipment-report-analytics";

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

  it("ranks low-volume couriers last and keeps each rate's base (SHP-ISSUED / SHP-OUTCOMES)", () => {
    const points = courierPerformancePoints([
      { courier: "SAP", issuedCount: 5, resolvedSubmissionCount: 5 },
      { courier: "JNE", issuedCount: 8, resolvedSubmissionCount: 10 },
      { courier: "JT", issuedCount: 0, resolvedSubmissionCount: 0 },
    ]);
    expect(points.map((point) => [point.courier, point.rate, point.issuedCount, point.resolvedCount, point.lowVolume])).toEqual([
      ["JNE", 80, 8, 10, false],
      ["SAP", 100, 5, 5, true],
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
    // T-89 (spec 19 M-0): exactly one decimal, half away from zero at an exact .x5 (Intl "halfExpand"):
    // 1/16 = 6,25% → 6,3%; 3/16 = 18,75% → 18,8%; 1/8 = 12,5% stays 12,5%; 0 → "0,0%".
    expect([1 / 16, 3 / 16, 1 / 8, 0, 2 / 3].map((share) => formatRate(share * 100))).toEqual(["6,3%", "18,8%", "12,5%", "0,0%", "66,7%"]);
  });

  it("groups every status into exactly one Ringkasan outcome bucket, in lifecycle order (T-254)", () => {
    const totals = shipmentStatuses.map((status, index) => ({ shipmentCount: index + 1, status }));
    const groups = reportStatusGroups(totals);
    expect(groups.map((group) => group.label)).toEqual(["Terkirim", "Retur", "Gagal", "Masih berjalan"]);
    const placed = groups.flatMap((group) => group.statuses.map((row) => row.status));
    expect([...placed].sort()).toEqual([...shipmentStatuses].sort());
    expect(groups.map((group) => group.statuses.map((row) => row.status))).toEqual([
      ["DELIVERED"],
      ["RTS_QUEUED", "RTS_IN_TRANSIT", "RTS_RECEIVED"],
      ["FAILED", "CANCELLED"],
      shipmentStatuses.filter((status) => !["DELIVERED", "RTS_QUEUED", "RTS_IN_TRANSIT", "RTS_RECEIVED", "FAILED", "CANCELLED"].includes(status)),
    ]);
    for (const group of groups) expect(group.count).toBe(group.statuses.reduce((sum, row) => sum + row.count, 0));
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(totals.reduce((sum, row) => sum + row.shipmentCount, 0));
    // A zero status is left out of its group; an empty group has count 0.
    expect(reportStatusGroups([{ shipmentCount: 3, status: "DELIVERED" }]).map((group) => [group.key, group.count, group.statuses.length]))
      .toEqual([["delivered", 3, 1], ["returned", 0, 0], ["failed", 0, 0], ["in-progress", 0, 0]]);
  });

  it("totals the trend legend over every bucket (T-254)", () => {
    expect(reportTrendTotals(analytics.trend)).toEqual({ cod: 3, codValue: 666_480, nonCod: 1 });
    expect(reportTrendTotals([])).toEqual({ cod: 0, codValue: 0, nonCod: 0 });
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
    expect(tableHeaders(html, "Total per kurir")).toEqual(["Kurir", "Kiriman", "% terkirim", "% retur", "Ongkir dibayar ke Mengantar", "Biaya COD (termasuk PPN)", "Estimasi cair"]);
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
    for (const title of ["Ringkasan", "Total kiriman", "Terkirim", "Retur", "Gagal", "Masih berjalan", "Nilai COD", "Estimasi cair", "Tren harian", "Distribusi status", "Wilayah tujuan", "Rute teratas"]) {
      expect(html, title).toContain(title);
    }
    // Terkirim 4 of 27; Retur 2 of 6 finished (4 + 2).
    expect(html).toContain("14,8% dari 27 kiriman");
    // T-265: the base is named ("terkirim + retur"), never the ambiguous "selesai".
    expect(html).toContain("33,3% dari 6 terkirim + retur");
    expect(html).not.toMatch(/dari \d+ selesai/);
    expect(html).toMatch(/Rp\s666\.480/);
    // T-251: two panels, no decorative icon chips; each figure is a <dd> after its <dt> label.
    const summary = html.slice(html.indexOf('aria-label="Ringkasan laporan"'), html.indexOf("Tren harian"));
    expect(summary).toContain('aria-label="Volume kiriman"');
    expect(summary).toContain('aria-label="Uang COD"');
    expect(summary).not.toContain("size-10");
    expect(summary).not.toContain("<a ");
    expect(summary).not.toMatch(/pendapatan/i);
    for (const [label, value] of [["Total kiriman", "27"], ["Terkirim", "4"], ["Retur", "2"], ["Gagal", "1"], ["Masih berjalan", "20"]]) {
      expect(summary, label).toMatch(new RegExp(`${label}</dt><dd[^>]*>${value}</dd>`));
    }
    expect(summary).toMatch(/Nilai COD<\/dt><dd[^>]*>Rp\s666\.480<\/dd><dd[^>]*>Ditagih kurir dari 3 kiriman COD<\/dd>/);
    // Spec 10 §4.15: the info "Estimasi" badge (icon + word, as in every Rincian uang) on the note line.
    expect(summary).toMatch(/Estimasi cair<\/dt><dd[^>]*>Rp\s201\.762<\/dd><dd[^>]*><span[^>]*data-slot="badge"[^>]*data-tone="info"[^>]*><svg[\s\S]*?<\/svg>Estimasi<\/span>Perkiraan, bukan dana diterima<\/dd>/);
    // The four outcome cells, in order, sum to the total (RPT-SHP-OUTCOME-COMPOSITION).
    const outcomes = [...summary.matchAll(/data-kpi="(delivered|returned|failed|in-progress)"[\s\S]*?<\/dt><dd[^>]*>(\d+)<\/dd>/g)];
    expect(outcomes.map((match) => [match[1], Number(match[2])])).toEqual([["delivered", 4], ["returned", 2], ["failed", 1], ["in-progress", 20]]);
    expect(outcomes.reduce((sum, match) => sum + Number(match[2]), 0)).toBe(27);
    expect(summary).toContain("berjumlah 27 kiriman");
    // T-262: Distribusi status is the one composition display. The Ringkasan draws no share bar of
    // its own (it repeated Distribusi's four groups): no segment and no width-sized element.
    expect(summary).not.toMatch(/data-segment=|style="[^"]*width:/);
    expect(html.match(/<ul aria-label="Distribusi status"/g)).toHaveLength(1);
    // Tabs are real tabs: a labelled tablist, keyboard-reachable triggers.
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Tampilan tren"');
    expect(html).toContain("Nilai COD per hari");
    expect(html).toContain('aria-label="Kelompok wilayah"');
    expect(html).toContain("Per kota");
    // Trend data table: every day of the range, newest first.
    expect(tableHeaders(html, "Data tren")).toEqual(["Tanggal (WIB)", "COD", "Non-COD", "Nilai COD"]);
    expect(html).toContain("Lihat tabel data tren");
    // T-254: the legend carries each series' period total (RPT-SHP-TREND-TOTALS): COD 2 + 1, Non-COD 1.
    const legends = [...html.matchAll(/<dl aria-label="Total periode ini"[^>]*>([\s\S]*?)<\/dl>/g)].map(([, body]) =>
      [...body.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)].map(([, dt, dd]) => [dt.replace(/<[^>]+>/g, ""), dd]));
    // Only the active tab renders on the server; the Nilai COD legend (Rp 666.480) mounts on its tab.
    expect(legends).toEqual([[["COD", "3 kiriman"], ["Non-COD", "1 kiriman"]]]);
    // Status distribution (T-254): the lifecycle counts grouped into the Ringkasan buckets. The
    // fixture's ISSUED and DRAFT are both "Masih berjalan"; each status keeps its badge and count,
    // in lifecycle order inside the group; the share bar shows the part of the 45-shipment cohort.
    expect(html).not.toContain("Total per status");
    const distribution = html.slice(html.indexOf('<ul aria-label="Distribusi status"'), html.indexOf('<p class="sr-only">', html.indexOf('<ul aria-label="Distribusi status"')));
    expect([...distribution.matchAll(/data-outcome="([a-z-]+)"/g)].map((match) => match[1])).toEqual(["in-progress"]);
    expect(distribution).toMatch(/Masih berjalan[\s\S]*?data-metric-id="RPT-SHP-LIFECYCLE-GROUP"><span class="font-semibold">2<\/span> <span[^>]*>kiriman<\/span>/);
    expect([...distribution.matchAll(/data-status="([A-Z_]+)"[\s\S]*?data-slot="badge"[\s\S]*?data-metric-id="RPT-SHP-LIFECYCLE-COUNT"><span class="font-semibold">(\d+)<\/span>/g)].map((match) => match.slice(1)))
      .toEqual([["DRAFT", "1"], ["ISSUED", "1"]]);
    // T-273 (critique P1): one Retur percentage per page. Ringkasan's 33,3% of 6 terkirim + retur
    // sat above Distribusi's Retur share of all shipments (30,8% vs 13,0% on the dev tenant). The
    // distribution now writes no percentage at all, and every "% retur" on the page uses the
    // Ringkasan base (RPT-SHP-RETURN-RATE: retur ÷ terkirim + retur).
    expect(distribution.replace(/<[^>]+>/g, "")).not.toMatch(/%/);
    const rates = [...summary.replace(/<[^>]+>/g, "").matchAll(/(\d+(?:,\d)?%)(?=(.{0,30}))/g)];
    expect(rates.map(([, rate, after]) => `${rate}${after}`.match(/^[\d,]+% dari \d+ (kiriman|terkirim \+ retur)/)?.[1])).toEqual(["kiriman", "terkirim + retur"]);

    expect(distribution).toContain("<details");
    // Wilayah: top 10 visible, the rest behind the disclosure, unknown named. T-254: the volume bar
    // sits in the table (no separate chart), and below md each wilayah is a record, not a squeezed table.
    const wilayah = html.slice(html.indexOf(">Wilayah tujuan<"), html.indexOf(">Rute teratas<"));
    expect(wilayah).toContain('data-slot="table"');
    expect(wilayah).not.toMatch(/recharts|data-slot="chart"/);
    expect(html).toMatch(/<ul aria-label="Kiriman per provinsi" class="[^"]*md:hidden"/);
    expect(html).toMatch(/<ul aria-label="Rute teratas" class="[^"]*md:hidden"/);
    expect(tableHeaders(html, "Kiriman per provinsi")).toEqual(["Wilayah", "Kiriman", "Terkirim", "Retur", "% retur"]);
    expect(html).toContain("Tampilkan semua (14 provinsi)");
    expect(html).toContain(UNKNOWN_REGION_LABEL);
    expect(html).toContain("Sulawesi Selatan");
    // Routes: outlet → city.
    expect(tableHeaders(html, "Rute teratas")).toEqual(["Rute", "Kiriman", "% terkirim", "% retur"]);
    expect(html).toContain("Kota Makassar");
    expect(filledButtons(html)).toBe(0);
  });

  it("marks courier, wilayah and route rates under 10 shipments as low volume and keeps the number (spec 19 M-0)", () => {
    expect(lowVolumeNote({ shipmentCount: 9 })).toBe("Volume rendah (n = 9)");
    expect(lowVolumeNote({ shipmentCount: 10 })).toBeNull();
    const base = reportProps();
    const html = render(createElement(ShipmentReportView, reportProps({
      data: {
        ...base.data,
        totals: {
          ...base.data.totals,
          byCourier: [
            ...base.data.totals.byCourier,
            { codDisbursementEstimateIdr: 0, codFeeIdr: 0, courier: "SICEPAT", deliveredCount: 2, returnedCount: 1, shipmentCount: 3, shippingCostIdr: 9_000 },
          ],
        },
      },
    })));
    const section = (label: string) => {
      const start = html.search(new RegExp(`<table data-slot="table" class="[^"]*" aria-label="${label}"`));
      return html.slice(start, html.indexOf("</table>", start));
    };
    // Courier: JNE (10) has no note; SiCepat (3) keeps 66,7% / 33,3% and carries the note, on both layouts.
    const courierTable = section("Total per kurir");
    expect(courierTable).toContain("66,7%");
    expect(courierTable).toContain("Volume rendah (n = 3)");
    expect(courierTable.match(/data-low-volume/g)).toHaveLength(1);
    expect(html.match(/Volume rendah \(n = 3\)/g)?.length).toBeGreaterThanOrEqual(2);
    // Wilayah: Sulawesi Selatan has 7 shipments (5 + 2): note, rate kept (2 of 6 finished).
    const provinces = section("Kiriman per provinsi");
    expect(provinces).toMatch(/Sulawesi Selatan[\s\S]*?Volume rendah \(n = 7\)[\s\S]*?33,3%/);
    // Route Gudang Jakarta Barat → Kota Makassar has 5.
    expect(section("Rute teratas")).toMatch(/Kota Makassar[\s\S]*?Volume rendah \(n = 5\)/);
    // The note is muted text, not a badge or alert.
    expect(html).toMatch(/<span class="block text-xs whitespace-nowrap text-muted-foreground" data-low-volume="">Volume rendah/);
  });

  it("keeps the totals and the list when the analytics read failed", () => {
    const html = render(createElement(ShipmentReportView, reportProps({ analytics: null })));
    expect(html).toContain("Ringkasan dan analitik tidak dapat dimuat");
    expect(html).toContain("Total per kurir");
    expect(html).toContain("Daftar kiriman");
    expect(html).not.toContain("Wilayah tujuan");
  });

  it("degrades only the issuance-rate card when its read failed", () => {
    const html = render(createElement(ShipmentReportView, reportProps({ performance: null })));
    expect(html).toContain("Tingkat penerbitan resi tidak dapat dimuat");
    expect(html).toContain("Daftar kiriman");
  });

  // T-273 (critique P1): "Performa kurir" was the issuance rate under another name, its order
  // unreadable (a 100% low-volume courier drawn under an 80% one) and its base only in sr text.
  it("names the courier card for SHP-ISSUE-RATE, sorts it highest first per group and writes its base", () => {
    const points = courierPerformancePoints([
      { courier: "SAP", issuedCount: 5, resolvedSubmissionCount: 5 },
      { courier: "JNE", issuedCount: 8, resolvedSubmissionCount: 10 },
      { courier: "LION", issuedCount: 19, resolvedSubmissionCount: 20 },
      { courier: "POS", issuedCount: 1, resolvedSubmissionCount: 4 },
    ]);
    const html = render(createElement(ShipmentReportView, reportProps({ performance: points })));
    expect(html).not.toContain("Performa kurir");
    expect(html).toContain(">Tingkat penerbitan resi per kurir<");
    const start = html.search(/<table data-slot="table" class="[^"]*" aria-label="Tingkat penerbitan resi per kurir"/);
    const table = html.slice(start, html.indexOf("</table>", start));
    expect(tableHeaders(html, "Tingkat penerbitan resi per kurir")).toEqual(["Kurir", "Tingkat penerbitan", "Resi diterbitkan", "Dijawab", "Volume rendah (kurang dari 10 jawaban)"]);
    // Rows in order with their rate (one decimal, spec 19 M-0) and base: enough volume first,
    // highest first; then the low-volume heading and its own rows, highest first.
    const rows = [...table.matchAll(/<tr[^>]*data-slot="table-row"[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) => row.replace(/<[^>]+>/g, "|").split("|").filter(Boolean).join(" "));
    expect(rows.slice(1)).toEqual([
      "Lion Parcel 95,0% 19 20",
      "JNE 80,0% 8 10",
      "Volume rendah (kurang dari 10 jawaban)",
      "SAP 100,0% 5 5",
      "POS Indonesia 25,0% 1 4",
    ]);
    const rates = [...table.matchAll(/data-metric-id="SHP-ISSUE-RATE">([\d,]+)%/g)].map((match) => Number(match[1].replace(",", ".")));
    expect(rates.slice(0, 2)).toEqual([...rates.slice(0, 2)].sort((a, b) => b - a));
    expect(rates.slice(2)).toEqual([...rates.slice(2)].sort((a, b) => b - a));
    // The base, in words, above the rows: 33 of 39 answered submissions.
    expect(html).toMatch(/data-slot="metric-base"><span data-metric-id="SHP-ISSUED">33 resi diterbitkan<\/span> dari <span data-metric-id="SHP-OUTCOMES">39 pengajuan yang sudah dijawab Mengantar<\/span>/);
    // Rendered on the server as the table: no Recharts in this card.
    expect(table).not.toMatch(/recharts|data-slot="chart"/);
    // The phone list keeps the same order and the same groups.
    expect([...html.matchAll(/<ul aria-label="(Tingkat penerbitan resi per kurir|Volume rendah \(kurang dari 10 jawaban\))"[\s\S]*?<\/ul>/g)]
      .map(([list]) => [...list.matchAll(/<span class="font-medium">([^<]+)<\/span>/g)].map((match) => match[1])))
      .toEqual([["Lion Parcel", "JNE"], ["SAP", "POS Indonesia"]]);
  });

  // T-273: every figure carries its spec 19 metric ID, and every ID it carries is defined there.
  it("tags every Laporan figure with a spec 19 metric ID that the contract defines", () => {
    const html = render(createElement(ShipmentReportView, reportProps({
      performance: courierPerformancePoints([{ courier: "JNE", issuedCount: 8, resolvedSubmissionCount: 10 }]),
    })));
    const spec = readFileSync("docs/spec/19-METRICS-ANALYTICS-CONTRACT.md", "utf8");
    const defined = new Set([...spec.matchAll(/^\| ([A-Z][A-Z0-9-]+(?: \/ [A-Z][A-Z0-9-]+)*) \|/gm)].flatMap((match) => match[1].split(" / ")));
    const used = new Set([...html.matchAll(/data-metric-id="([^"]+)"/g)].flatMap((match) => match[1].split(" ")));
    for (const id of used) expect(defined, id).toContain(id);
    for (const id of [
      "RPT-SHP-KPI-TOTAL", "RPT-SHP-DELIVERED", "RPT-SHP-DELIVERED-SHARE", "RPT-SHP-RETURNED", "RPT-SHP-RETURN-RATE", "RPT-SHP-FAILED",
      "RPT-SHP-IN-PROGRESS", "RPT-SHP-COD-VALUE-TOTAL", "RPT-SHP-COD-DISBURSEMENT-EST-TOTAL", "RPT-SHP-TREND-TOTALS", "RPT-SHP-TREND-COD",
      "RPT-SHP-TREND-NONCOD", "RPT-SHP-TREND-COD-VALUE", "RPT-SHP-LIFECYCLE-GROUP", "RPT-SHP-COURIER-COUNT", "RPT-SHP-COURIER-DELIVERED-RATE",
      "RPT-SHP-COURIER-RETURN-RATE", "RPT-SHP-COURIER-SHIPPING-COST-IDR", "RPT-SHP-COURIER-COD-FEE-IDR", "RPT-SHP-COURIER-COD-DISBURSEMENT-EST-IDR",
      "SHP-ISSUE-RATE", "SHP-ISSUED", "SHP-OUTCOMES", "RPT-SHP-REGION-PROVINCE", "RPT-SHP-ROUTE-COUNT", "RPT-SHP-ROWS",
    ]) expect(used, id).toContain(id);
  });

  // T-273 (optimize): Recharts is not in the server HTML; a skeleton of the chart's own box is,
  // and the trend's numbers (legend totals, data table) stay server-rendered.
  it("renders a same-size skeleton in place of the trend chart, with the trend numbers still in the HTML", () => {
    const html = render(createElement(ShipmentReportView, reportProps()));
    expect(html).not.toMatch(/recharts-/);
    expect(html).toMatch(/class="[^"]*\bh-56 w-full\b[^"]*"[^>]*data-slot="chart-skeleton"|data-slot="chart-skeleton"[^>]*class="[^"]*\bh-56 w-full\b/);
    expect(tableHeaders(html, "Data tren")).toEqual(["Tanggal (WIB)", "COD", "Non-COD", "Nilai COD"]);
    expect(readFileSync("src/app/app/laporan/pengiriman/analytics-sections.tsx", "utf8")).not.toMatch(/from "@\/app\/app\/laporan\/pengiriman\/report-trend-chart"/);
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
