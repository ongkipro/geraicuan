import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SHIPMENT_REPORT_COLUMNS } from "@/lib/shipment-report";

/**
 * PR-55 render guards for the two Laporan pages.
 *
 * These assert on **rendered HTML**, not on source text: the browser does not
 * care how the JSX was written, so neither does this file.
 */

const options = {
  couriers: ["JNE", "SICEPAT"],
  outlets: [
    { id: "00000000-0000-5501-0000-000000000001", name: "Outlet Laporan A1" },
    { id: "00000000-0000-5501-0000-000000000002", name: "Outlet Laporan A2" },
  ],
};

const shipmentReport = {
  generatedAt: new Date("2026-09-12T05:00:00.000Z"),
  page: 1,
  pageSize: 50,
  rows: [
    {
      codDisbursementEstimateIdr: 202_000,
      codFeeIdr: 7_160,
      courier: "JNE",
      createdAt: new Date("2026-09-02T03:00:00.000Z"),
      destinationAreaLabel: "Kebon Jeruk, Jakarta Barat",
      isCod: true,
      issuedAt: new Date("2026-09-02T04:00:00.000Z"),
      outletName: "Outlet Laporan A1",
      printCount: 2,
      providerService: "JNE REG",
      publicReference: "GC-10001",
      shipmentId: "00000000-0000-5521-0000-000000000001",
      shippingCostIdr: 13_000,
      status: "ISSUED" as const,
    },
    {
      codDisbursementEstimateIdr: null,
      codFeeIdr: null,
      courier: null,
      createdAt: new Date("2026-09-05T03:00:00.000Z"),
      destinationAreaLabel: "Kelapa Gading, Jakarta Utara",
      isCod: false,
      issuedAt: null,
      outletName: "Outlet Laporan A2",
      printCount: 0,
      providerService: null,
      publicReference: "GC-10004",
      shipmentId: "00000000-0000-5521-0000-000000000004",
      shippingCostIdr: null,
      status: "DRAFT" as const,
    },
  ],
  totals: {
    byCourier: [
      { codDisbursementEstimateIdr: 202_000, codFeeIdr: 7_160, courier: "JNE", shipmentCount: 2, shippingCostIdr: 25_000 },
      { codDisbursementEstimateIdr: 0, codFeeIdr: 0, courier: null, shipmentCount: 1, shippingCostIdr: 0 },
    ],
    byLifecycle: [
      { shipmentCount: 2, status: "ISSUED" as const },
      { shipmentCount: 1, status: "DRAFT" as const },
    ],
    shipmentCount: 3,
  },
  totalPages: 1,
};

const printHistory = {
  generatedAt: new Date("2026-09-12T05:00:00.000Z"),
  rows: [
    {
      actorRole: "OPERATOR" as const,
      outcome: "PRINTED" as const,
      outletName: "Outlet Cetak A1",
      printEventId: "00000000-0000-5641-0000-000000000013",
      printedAt: new Date("2026-09-04T03:00:00.000Z"),
      publicReference: "GC-20001",
      reasonCode: null,
      reprintCount: 2,
      sequence: 3,
      shipmentId: "00000000-0000-5621-0000-000000000001",
    },
    {
      actorRole: "TENANT_ADMIN" as const,
      outcome: "BLOCKED" as const,
      outletName: "Outlet Cetak A2",
      printEventId: "00000000-0000-5641-0000-000000000031",
      printedAt: new Date("2026-09-07T03:00:00.000Z"),
      publicReference: "GC-20003",
      reasonCode: "AWAITING_UPSTREAM_PAYMENT",
      reprintCount: 0,
      sequence: null,
      shipmentId: "00000000-0000-5621-0000-000000000003",
    },
  ],
  totalCount: 2,
};

const fixture = {
  principal: {
    role: "TENANT_ADMIN" as "TENANT_ADMIN" | "OPERATOR",
    scope: "tenant" as const,
    tenantId: "00000000-0000-5500-0000-000000000001",
    userId: "report-render-user",
  },
  printHistory,
  shipmentReport,
};

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: () => null })) }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => { throw new Error(`NEXT_REDIRECT:${href}`); },
}));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => fixture.principal),
}));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (
    _db: unknown,
    userId: string,
    tenantId: string,
    work: (tx: unknown, context: unknown) => Promise<unknown>,
  ) => work({}, { role: fixture.principal.role, tenantId, userId })),
}));
vi.mock("@/db/analytics-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/analytics-repository")>()),
  loadAnalyticsFilterOptions: vi.fn(async () => options),
  // T-204: Performa kurir moved here from Analitik.
  loadCourierPerformance: vi.fn(async () => [
    { courier: "SAP", issuedCount: 2, resolvedSubmissionCount: 2 },
    { courier: "JNE", issuedCount: 9, resolvedSubmissionCount: 12 },
  ]),
}));
vi.mock("@/db/shipment-report-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/shipment-report-repository")>()),
  loadShipmentReportPage: vi.fn(async () => fixture.shipmentReport),
}));
vi.mock("@/db/label-print-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/label-print-repository")>()),
  loadPrintHistoryPage: vi.fn(async () => fixture.printHistory),
}));

const { default: ShipmentReportPage } = await import("@/app/app/laporan/pengiriman/page");
const { default: PrintHistoryPage } = await import("@/app/app/laporan/cetak-resi/page");

function renderReport(searchParams: Record<string, string> = {}) {
  return ShipmentReportPage({ searchParams: Promise.resolve(searchParams) })
    .then((element) => renderToStaticMarkup(element as never));
}

function renderHistory(searchParams: Record<string, string> = {}) {
  return PrintHistoryPage({ searchParams: Promise.resolve(searchParams) })
    .then((element) => renderToStaticMarkup(element as never));
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Laporan pengiriman presentation", () => {
  beforeEach(() => {
    fixture.principal.role = "TENANT_ADMIN";
    fixture.shipmentReport = shipmentReport;
  });

  it("renders every PR-55 column once, in the documented order", async () => {
    const html = await renderReport();
    const headers = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);

    // The row table is the last one on the page; its headers are exactly the
    // documented columns, in the documented order and nothing besides.
    const rowHeaders = headers.slice(-SHIPMENT_REPORT_COLUMNS.length);
    expect(rowHeaders).toEqual(SHIPMENT_REPORT_COLUMNS.map((column) => column.label));
    // 5 per-courier total + 2 per-status + 4 courier performance (T-204) headers precede it.
    expect(headers.length).toBe(SHIPMENT_REPORT_COLUMNS.length + 11);
  });

  it("shows courier performance on the page's own period and filters (T-204)", async () => {
    const { loadCourierPerformance } = await import("@/db/analytics-repository");
    vi.mocked(loadCourierPerformance).mockClear();
    const html = await renderReport({ rentang: "30-hari", kurir: "JNE" });
    expect(html).toContain('id="shipment-report-courier-performance-title"');
    expect(html).toContain('aria-label="Tabel performa kurir"');
    const table = html.slice(html.indexOf('aria-label="Tabel performa kurir"'));
    expect(table.indexOf(">JNE<")).toBeLessThan(table.indexOf(">SAP<"));
    expect(table).toContain("Volume rendah (n = 2)");
    expect(loadCourierPerformance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: fixture.principal.tenantId }),
      expect.objectContaining({ presetId: "30-hari" }),
      expect.objectContaining({ courier: "JNE" }),
    );
  });

  it("states the per-courier and per-lifecycle totals of the filtered set", async () => {
    const visible = text(await renderReport());

    expect(visible).toContain("Total per kurir");
    expect(visible).toContain("Total per status");
    expect(visible).toContain("Belum ada kurir");
    expect(visible).toContain("3 kiriman");
    // T-206: the "whole filtered set, not this page" explanation moved into the
    // "?" popover beside the heading (reduced on-screen text). Popover content is
    // not server-rendered, so pin the trigger here and the sentence in the source.
    const html = await renderReport();
    expect(html).toMatch(/<button[^>]*aria-label="Penjelasan ringkasan periode"/);
    expect(readFileSync(join(process.cwd(), "src/app/app/laporan/pengiriman/page.tsx"), "utf8"))
      .toMatch(/bukan hanya halaman ini/);
    // T-177: shipping, COD fee and Mengantar's disbursement — no merchandise figure.
    expect(visible).not.toMatch(/margin|laba|profit|keuntungan|omset|omzet|cogs|\bhpp\b|pokok cod|nilai barang|pendapatan|revenue/i);
    expect(visible).toContain("Biaya kirim Mengantar");
    expect(visible).toContain("Biaya COD");
    expect(visible).toContain("Estimasi dana dicairkan Mengantar");
    expect(visible).toContain("Rp 202.000");
  });

  it("offers an export that carries the same filters the table is showing", async () => {
    const html = await renderReport({
      rentang: "kustom",
      dari: "2026-09-01",
      sampai: "2026-09-10",
      outlet: options.outlets[1]!.id,
      kurir: "JNE",
      halaman: "2",
    });
    const exportHref = html.match(/href="([^"]*export\.csv[^"]*)"/)?.[1] ?? "";

    expect(exportHref).toContain("rentang=kustom");
    expect(exportHref).toContain("dari=2026-09-01");
    expect(exportHref).toContain("sampai=2026-09-10");
    expect(exportHref).toContain(`outlet=${options.outlets[1]!.id}`);
    expect(exportHref).toContain("kurir=JNE");
    // The export is the filtered set, never one page of it.
    expect(exportHref).not.toContain("halaman");
  });

  it("separates the empty period from the empty filter, and hides the export when there is nothing to export", async () => {
    fixture.shipmentReport = {
      ...shipmentReport,
      rows: [],
      totals: { byCourier: [], byLifecycle: [], shipmentCount: 0 },
    };

    const unfiltered = text(await renderReport());
    expect(unfiltered).toContain("Belum ada kiriman pada periode ini.");
    expect(unfiltered).not.toContain("Ekspor CSV");

    const filtered = text(await renderReport({ kurir: "JNE" }));
    expect(filtered).toContain("Tidak ada kiriman yang cocok dengan filter ini.");
  });

  it("sends an operator away rather than rendering a Tenant Admin record", async () => {
    fixture.principal.role = "OPERATOR";
    await expect(renderReport()).rejects.toThrow("NEXT_REDIRECT:/app");
  });
});

describe("Riwayat cetak resi presentation", () => {
  beforeEach(() => {
    fixture.principal.role = "TENANT_ADMIN";
    fixture.printHistory = printHistory;
  });

  it("states the recorded outcome, reason, actor role, sequence and reprint count in words", async () => {
    const visible = text(await renderHistory());

    expect(visible).toContain("Berhasil dicetak");
    expect(visible).toContain("Ditolak sistem");
    expect(visible).toContain(SHIPMENT_STATUS_PRESENTATION.AWAITING_UPSTREAM_PAYMENT.label);
    expect(visible).toContain("Operator");
    expect(visible).toContain("Tenant Admin");
    expect(visible).toContain("#3");
    expect(visible).toContain("2×");
    // Raw enum values never reach the reader.
    expect(visible).not.toContain("AWAITING_UPSTREAM_PAYMENT");
    expect(visible).not.toContain("PRINTED");
    expect(visible).not.toContain("BLOCKED");
  });

  it("names the reprint count explicitly and says a first print is not a reprint", async () => {
    const visible = text(await renderHistory());

    expect(visible).toContain("Cetak ulang");
    expect(visible).toContain("1 kiriman pernah dicetak ulang");
    // T-206: the counting rule moved into the "?" popover beside the list heading
    // (reduced on-screen text); popover content is not server-rendered, so pin
    // the trigger in the page and the sentence in the source.
    expect(await renderHistory()).toMatch(/<button[^>]*aria-label="Penjelasan cetak ulang"/);
    expect(readFileSync(join(process.cwd(), "src/app/app/laporan/cetak-resi/page.tsx"), "utf8"))
      .toMatch(/cetak pertama bukan cetak ulang/i);
  });

  it("exposes no actor identity beyond the role the record stores", async () => {
    const visible = text(await renderHistory());

    expect(visible).not.toContain(fixture.principal.userId);
    expect(visible).not.toContain("••••");
    expect(visible).not.toMatch(/@example|@geraicuan/);
  });

  it("shows an empty state naming the period rather than an empty table", async () => {
    fixture.printHistory = { ...printHistory, rows: [], totalCount: 0 };
    const visible = text(await renderHistory());

    expect(visible).toContain("Belum ada permintaan cetak pada periode ini.");
    expect(visible).toContain("Buka cetak resi"); // V-8: sentence case
    expect(visible).not.toContain("Cetak ulang</th>");
  });

  it("sends an operator away rather than rendering the print audit record", async () => {
    fixture.principal.role = "OPERATOR";
    await expect(renderHistory()).rejects.toThrow("NEXT_REDIRECT:/app");
  });

  /**
   * AGENTS.md: every displayed number maps to one metric ID in `docs/spec/19`.
   * The column list carried an ID per column and nothing checked it existed, so
   * a column could ship — on the page *and* in the export — naming a metric the
   * contract never defines.
   */
  it("names a metric the contract actually defines, for every report column", () => {
    const contract = readFileSync(join(process.cwd(), "docs/spec/19-METRICS-ANALYTICS-CONTRACT.md"), "utf8");
    const missing = SHIPMENT_REPORT_COLUMNS
      .map((column) => column.metricId)
      .filter((metricId) => !contract.includes(metricId));

    expect(missing, `report columns naming a metric docs/spec/19 does not define: ${missing.join(", ")}`)
      .toEqual([]);
  });
});
