import { describe, expect, it } from "vitest";

import type { ShipmentReportRow } from "@/db/shipment-report-repository";
import { buildAnalyticsDecisionContext } from "@/lib/analytics-decision-context";
import { serializeShipmentReportCsv } from "@/lib/analytics-export";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import {
  courierIssueRate,
  isLowVolumeCourier,
  lowVolumeLabel,
  orderCouriersForRanking,
} from "@/lib/courier-volume";

// T-204: spec 19 M-3 "Performa kurir" ranking rules (presentation-independent).
describe("Laporan pengiriman courier performance (T-204)", () => {
  it("never ranks a low-volume courier above a higher-volume one by rate alone", () => {
    // The repository order puts a 5/5 low-volume courier above an 8/10 courier by rate.
    const rows = [
      { courier: "SAP", issuedCount: 5, resolvedSubmissionCount: 5 },
      { courier: "JNE", issuedCount: 8, resolvedSubmissionCount: 10 },
    ];
    expect(orderCouriersForRanking(rows).map((row) => row.courier)).toEqual(["JNE", "SAP"]);
    expect(rows.map(isLowVolumeCourier)).toEqual([true, false]);
    expect(courierIssueRate(rows[0]!)).toBe(100);
    expect(courierIssueRate(rows[1]!)).toBe(80);
    expect(lowVolumeLabel(rows[0]!)).toBe("Volume rendah (n = 5)");
  });

  it("gives a courier with no resolved outcomes a zero rate instead of dividing by zero", () => {
    expect(courierIssueRate({ courier: "JNE", issuedCount: 0, resolvedSubmissionCount: 0 })).toBe(0);
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
