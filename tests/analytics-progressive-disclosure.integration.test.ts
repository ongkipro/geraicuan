import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsCourierRegion, AnalyticsFinancialRegion, AnalyticsReconciliationRegion, AnalyticsTrendRegion, type AnalyticsResolvedRegionProps } from "@/app/app/analitik/analytics-regions";
import type { ShipmentKpiComparison } from "@/db/analytics-repository";
import { parseAnalyticsRange } from "@/lib/analytics-range";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/app/analitik/shipment-trend-chart", () => ({ ShipmentTrendChart: () => createElement("div", { "data-chart": "trend" }) }));
vi.mock("@/app/app/analitik/courier-issue-rate-chart", () => ({ CourierIssueRateChart: () => createElement("div", { "data-chart": "courier" }) }));
const now = new Date("2026-09-15T01:00:00Z");
const context: AnalyticsResolvedRegionProps = {
  activeDimensionCount: 0, canonicalQuery: "rentang=30-hari", eventBasis: "created", periodLabel: "17 Agu – 15 Sep 2026", previousPeriodLabel: "18 Jul – 16 Agu 2026", range: parseAnalyticsRange({ rentang: "30-hari" }, now), role: "TENANT_ADMIN", timezoneLabel: "WIB (UTC+07:00)",
};
const kpis = { createdCount: 10, issuedCount: 8, resolvedSubmissionCount: 10, providerShippingIdr: 20000, codServiceFeeIdr: 1000, codVatIdr: 110, codDisbursementEstimateIdr: 78890 };
const comparison: ShipmentKpiComparison = { current: kpis, previous: kpis, eventGeneratedAt: now, backlogSnapshot: { asOf: now, awaitingPaymentCount: 0, needsActionCount: 0 } };

describe("analytics progressive disclosure", () => {
  it("keeps a populated chart visible and all daily rows inside a closed native disclosure", async () => {
    const html = renderToStaticMarkup(await AnalyticsTrendRegion({ context, promise: Promise.resolve({ generatedAt: now, points: [{ key: "2026-09-14", createdCount: 3, issuedCount: 2 }] }) }));
    expect(html.indexOf('data-chart="trend"')).toBeLessThan(html.indexOf("<details"));
    expect(html).toMatch(/<details[^>]*data-analytics-detail="trend"[^>]*>/);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|>)/);
    expect(html).toContain("30 hari");
    const disclosure = /<details[\s\S]*?<\/details>/.exec(html)?.[0] ?? "";
    expect(disclosure.match(/<tr /g)?.length).toBe(31);
    expect(html.replace(disclosure, "")).not.toContain("<tr ");
    expect(html).toContain('aria-label="Tabel tren kiriman"');
  });
  it("preserves low-volume qualifiers and counts in the expandable courier table", async () => {
    const html = renderToStaticMarkup(await AnalyticsCourierRegion({ context, promise: Promise.resolve([{ courier: "JNE", issuedCount: 8, resolvedSubmissionCount: 10 }, { courier: "SAP", issuedCount: 1, resolvedSubmissionCount: 1 }]) }));
    expect(html.indexOf('data-chart="courier"')).toBeLessThan(html.indexOf("<details"));
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|>)/);
    const disclosure = /<details[^>]*data-analytics-detail="couriers"[\s\S]*?<\/details>/.exec(html)?.[0] ?? "";
    expect(disclosure).toMatch(/Lihat detail performa kurir <span[^>]*>\(2\)<\/span>/);
    expect(disclosure.match(/<tbody[\s\S]*?<\/tbody>/)?.[0].match(/<tr /g)?.length).toBe(2);
    expect(html.replace(disclosure, "")).not.toContain("<table");
    expect(disclosure).toContain("Volume rendah");
    expect(disclosure).toContain("Outcome terselesaikan");
  });
  it("keeps shipping, the COD fee and the disbursement estimate visible with the fee split available on demand", async () => {
    const html = renderToStaticMarkup(await AnalyticsFinancialRegion({ promise: Promise.resolve(comparison) }));
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|>)/);
    const disclosure = /<details[\s\S]*?<\/details>/.exec(html)?.[0] ?? "";
    const outside = html.replace(disclosure, "");
    expect(outside).toContain("Biaya kirim Mengantar");
    expect(outside).toContain("Rp\u00a020.000");
    expect(outside).toContain("Biaya COD");
    expect(outside).toContain("Rp\u00a01.110");
    expect(outside).toContain("Estimasi dana dicairkan Mengantar");
    expect(outside).toContain("Rp\u00a078.890");
    for (const part of ["Biaya layanan COD", "PPN biaya layanan COD"]) {
      expect(outside).not.toContain(part);
      expect(disclosure).toContain(part);
    }
    expect(html).toContain("bukan dana yang sudah cair");
    expect(html).not.toContain("NaN");
  });
  it("keeps unresolved counts prominent even if their signed amounts cancel to zero", async () => {
    const html = renderToStaticMarkup(await AnalyticsReconciliationRegion({ promise: Promise.resolve({ varianceCount: 2, totalSignedVarianceIdr: 0 }) }));
    expect(html).toContain("text-destructive");
    expect(html).toContain("2 hasil rekonsiliasi");
    expect(html).toContain("Total selisih (+/−)");
    expect(html).toContain("tidak mengikuti filter");
    expect(html).not.toContain("<details");
    expect(html).toContain("Lihat rekonsiliasi");
    expect(html).toMatch(/<section aria-labelledby="analytics-reconciliation-heading"/);
    expect(html).toMatch(/<h2[^>]*id="analytics-reconciliation-heading"/);
    expect(html).not.toContain('role="alert"');
    const settled = renderToStaticMarkup(await AnalyticsReconciliationRegion({ promise: Promise.resolve({ varianceCount: 0, totalSignedVarianceIdr: 0 }) }));
    expect(settled).toContain("0 hasil rekonsiliasi");
    expect(settled).not.toContain("text-destructive");
  });
  it("shows failures and empty states without an extra disclosure gate", async () => {
    const error = renderToStaticMarkup(await AnalyticsTrendRegion({ context, promise: Promise.reject(new Error("synthetic")) }));
    expect(error).toContain("Tren tidak dapat dimuat");
    expect(error).not.toContain("<details");
    const empty = renderToStaticMarkup(await AnalyticsTrendRegion({ context, promise: Promise.resolve({ generatedAt: now, points: [] }) }));
    expect(empty).toContain("Tidak ada aktivitas untuk diplot");
    expect(empty).not.toContain("<details");
  });
  it("renders reconciliation directly after the summary in both the page and its loading state", () => {
    const expected = ["Summary", "Reconciliation", "Trend", "Courier", "Financial", "Shipment"];
    const order = (file: string, pattern: RegExp) => [...readFileSync(`src/app/app/analitik/${file}`, "utf8").matchAll(pattern)].map((m) => m[1]);
    expect(order("page.tsx", /<Analytics(\w+)Region\b/g)).toEqual(expected);
    expect(order("loading.tsx", /<Analytics(\w+)Skeleton\b/g)).toEqual(expected);
  });
});
