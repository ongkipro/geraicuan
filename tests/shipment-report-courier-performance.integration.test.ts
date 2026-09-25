import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CourierPerformanceSection } from "@/app/app/laporan/pengiriman/courier-performance";
import type { ShipmentReportRow } from "@/db/shipment-report-repository";
import { buildAnalyticsDecisionContext } from "@/lib/analytics-decision-context";
import { serializeShipmentReportCsv } from "@/lib/analytics-export";
import { parseAnalyticsRange } from "@/lib/analytics-range";

vi.mock("@/app/app/laporan/pengiriman/courier-issue-rate-chart", () => ({
  CourierIssueRateChart: ({ data }: { data: { courier: string; label: string }[] }) =>
    createElement("div", { "data-chart": "courier", "data-order": data.map((point) => point.courier).join(",") }),
}));

const render = (rows: Parameters<typeof CourierPerformanceSection>[0]["rows"]) =>
  renderToStaticMarkup(createElement(CourierPerformanceSection, { periodLabel: "1–7 Sep 2026", rows, timezoneLabel: "WIB (UTC+07:00)" }));

// T-204: spec 19 M-3 "Performa kurir" moved from the retired Analitik page into Laporan pengiriman.
describe("Laporan pengiriman courier performance (T-204)", () => {
  it("never ranks a low-volume courier above a higher-volume one by rate alone", () => {
    // The repository order puts a 5/5 low-volume courier above an 8/10 courier by rate.
    const html = render([
      { courier: "SAP", issuedCount: 5, resolvedSubmissionCount: 5 },
      { courier: "JNE", issuedCount: 8, resolvedSubmissionCount: 10 },
    ]);
    expect(html.indexOf('data-chart="courier"')).toBeLessThan(html.indexOf("<details"));
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|>)/);
    const disclosure = /<details[^>]*data-report-detail="couriers"[\s\S]*?<\/details>/.exec(html)?.[0] ?? "";
    expect(disclosure).toMatch(/Lihat detail performa kurir <span[^>]*>\(2\)<\/span>/);
    expect(disclosure.match(/<tbody[\s\S]*?<\/tbody>/)?.[0].match(/<tr /g)?.length).toBe(2);
    expect(html.replace(disclosure, "")).not.toContain("<table");
    expect(disclosure).toContain("Volume rendah (n = 5)");
    expect(disclosure.match(/Volume rendah/g)).toHaveLength(1);
    expect(disclosure.indexOf(">JNE<")).toBeGreaterThan(-1);
    expect(disclosure.indexOf(">JNE<")).toBeLessThan(disclosure.indexOf(">SAP<"));
    expect(html).toContain('data-order="JNE,SAP"');
  });

  it("degrades to its own alert on a failed read and states an empty filter", () => {
    const failed = render(null);
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Performa kurir tidak dapat dimuat");
    expect(failed).not.toContain("<details");
    const empty = render([]);
    expect(empty).toContain("Belum ada pengajuan yang dijawab Mengantar pada filter ini.");
    expect(empty).not.toContain('data-chart="courier"');
  });
});

describe("kept helpers whose only page-level tests went with Analitik", () => {
  it("keeps calendar dates and normalizes an obsolete timezone in the dashboard decision context", () => {
    const range = parseAnalyticsRange(
      { rentang: "kustom", khusus: "1", dari: "2026-07-01", sampai: "2026-07-07", tz: "Asia/Jayapura" },
      new Date("2026-08-30T12:00:00Z"),
    );
    const context = buildAnalyticsDecisionContext(range);
    expect(context.persistedQuery).toBe("rentang=kustom&tz=Asia%2FJakarta&dari=2026-07-01&sampai=2026-07-07");
    expect(context.previousRange).toMatchObject({
      timezone: "Asia/Jakarta",
      startDate: "2026-06-24",
      lastIncludedDate: "2026-06-30",
      spanDays: 7,
    });
  });

  it("neutralises spreadsheet formulas and control characters in the report CSV", () => {
    const row: ShipmentReportRow = {
      codDisbursementEstimateIdr: null,
      codFeeIdr: null,
      courier: "JNE",
      createdAt: new Date("2026-09-03T03:00:00Z"),
      destinationAreaLabel: "=HYPERLINK(\"http://example.invalid\")",
      isCod: false,
      issuedAt: null,
      outletName: "Outlet",
      paymentMethod: "NON_COD",
      printCount: 0,
      providerService: "+FORMULA\nbaris",
      publicReference: "GC-10121",
      shipmentId: "00000000-0000-4000-8000-000000020501",
      shippingCostIdr: 13_000,
      status: "ISSUED",
    };
    const csv = serializeShipmentReportCsv([row]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\"'=HYPERLINK(\"\"http://example.invalid\"\")\"");
    expect(csv).toContain("\"'+FORMULA baris\"");
    expect(csv.trimEnd().split("\r\n")).toHaveLength(2);
  });
});
