import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/** T-214 (UI v3 Dasbor): pure dashboard rules and key markup. No database. */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const { courierTotals, kpiDelta, mergeRecentShipments, recentNextStep } = await import("@/app/app/_dashboard/dashboard-logic");
const { CourierRecapTable, OutcomeTable, RecentList } = await import("@/app/app/_dashboard/sections");
const { SetupSteps, setupSteps } = await import("@/app/app/_dashboard/setup-steps");

type Row = Parameters<typeof RecentList>[0]["rows"][number];
const row = (id: string, status: Row["status"], minutesAgo: number, awb: string | null = null): Row => ({
  awb,
  destinationAreaLabel: "Panakkukang, Kota Makassar, Sulawesi Selatan, 90231",
  outletName: "Outlet Solo",
  publicReference: `GC-${id}`,
  recipientName: `Penerima ${id}`,
  shipmentId: `00000000-0000-4000-8000-0000000${id}`,
  status,
  updatedAt: new Date(Date.UTC(2026, 8, 25, 10, 0) - minutesAgo * 60_000),
});

describe("recent shipments", () => {
  it("lists each shipment once, exceptions first, then other next steps, then the rest, capped at six", () => {
    const actionable = [row("10001", "DRAFT", 1), row("10002", "FAILED", 30), row("10003", "AWAITING_UPSTREAM_PAYMENT", 5)];
    const recent = [row("10001", "DRAFT", 1), row("10004", "DELIVERED", 0), row("10005", "ISSUED", 2), row("10006", "ESTIMATED", 3), row("10007", "IN_TRANSIT", 4)];
    const merged = mergeRecentShipments(actionable, recent, "TENANT_ADMIN");
    expect(merged.map((r) => r.publicReference)).toEqual(["GC-10003", "GC-10002", "GC-10001", "GC-10006", "GC-10004", "GC-10005"]);
  });

  it("gives every row a link and sends payment recovery to the admin only", () => {
    const unpaid = row("10003", "AWAITING_UPSTREAM_PAYMENT", 0);
    expect(recentNextStep(unpaid, "TENANT_ADMIN")).toEqual({ actionable: true, href: "/app/pengiriman/10003#pemulihan-pembayaran", label: "Pulihkan pembayaran" });
    expect(recentNextStep(unpaid, "OPERATOR").label).toBe("Lihat panduan");
    // T-236: an Operator cannot reconcile, so the row does not promise it.
    const unknown = row("10008", "SUBMISSION_UNKNOWN", 0);
    expect(recentNextStep(unknown, "TENANT_ADMIN").label).toBe("Periksa rekonsiliasi");
    expect(recentNextStep(unknown, "OPERATOR").label).toBe("Lihat panduan");
    expect(recentNextStep(row("10001", "DRAFT", 0), "OPERATOR").href).toBe("/app/pengiriman/baru?draft=00000000-0000-4000-8000-000000010001");
    expect(recentNextStep(row("10004", "DELIVERED", 0), "OPERATOR")).toMatchObject({ actionable: false, label: "Lihat detail" });
  });

  it("renders number link, status badge, recipient · district, resi and the next step", () => {
    const html = renderToStaticMarkup(createElement(RecentList, { multipleOutlets: false, role: "OPERATOR", rows: [row("10005", "ISSUED", 0, "JNE8890211")] }));
    expect(html).toContain('href="/app/pengiriman/10005"');
    expect(html).toContain("Resi terbit");
    expect(html).toContain("Penerima 10005 · Panakkukang, Kota Makassar");
    expect(html).toContain("JNE8890211");
    expect(html).toContain("Lihat detail");
    expect(html).not.toContain("Outlet Solo");
  });
});

describe("KPI delta and courier totals", () => {
  it("has no percentage when the previous period was zero", () => {
    expect(kpiDelta(12, 0)).toEqual({ change: 12, percent: null });
    expect(kpiDelta(5, 10)).toEqual({ change: -5, percent: -50 });
  });

  it("keeps a hidden (operator) cost null instead of Rp 0", () => {
    expect(courierTotals([{ deliveredCount: 1, returnedCount: 0, shipmentCount: 2, shippingCostIdr: null }]).shippingCostIdr).toBeNull();
    expect(courierTotals([
      { deliveredCount: 1, returnedCount: 0, shipmentCount: 2, shippingCostIdr: 1000 },
      { deliveredCount: 0, returnedCount: 1, shipmentCount: 1, shippingCostIdr: 500 },
    ])).toEqual({ deliveredCount: 1, returnedCount: 1, shipmentCount: 3, shippingCostIdr: 1500 });
  });
});

describe("dashboard tables", () => {
  const recapRows = [
    { courier: "JNE", deliveredCount: 2, returnedCount: 0, shipmentCount: 3, shippingCostIdr: 45000 },
    { courier: "JT", deliveredCount: 7, returnedCount: 0, shipmentCount: 9, shippingCostIdr: 162000 },
    { courier: "SAP", deliveredCount: 0, returnedCount: 0, shipmentCount: 0, shippingCostIdr: 0 },
  ];

  it("shows the courier cost column and its total to the admin only, busiest courier first, unused couriers left out", () => {
    const admin = renderToStaticMarkup(createElement(CourierRecapTable, { recap: { generatedAt: new Date(), rows: recapRows, shippingCostVisible: true } }));
    expect(admin).toContain("Biaya kirim");
    expect(admin).toContain('data-slot="courier-cost-total"');
    expect(admin).toMatch(/Rp\s207\.000/ /* money keeps its non-breaking space (audit 2026-09-26) */);
    expect(admin.indexOf("J&amp;T")).toBeLessThan(admin.indexOf("JNE"));
    expect(admin).not.toContain(">SAP<");
    const operator = renderToStaticMarkup(createElement(CourierRecapTable, {
      recap: { generatedAt: new Date(), rows: recapRows.map((r) => ({ ...r, shippingCostIdr: null })), shippingCostVisible: false },
    }));
    expect(operator).not.toContain("Biaya kirim");
    expect(operator).not.toContain("Rp");
  });

  it("names the four outcomes with a dot each", () => {
    const counts = { codCount: 1, nonCodCount: 2, totalCount: 3 };
    const html = renderToStaticMarkup(createElement(OutcomeTable, {
      outcome: { basis: { lastObservedAt: null, observationVisible: false } as never, cohortCount: 12, delivered: counts, failed: counts, generatedAt: new Date(), inProgress: counts, returned: counts },
    }));
    for (const label of ["Terkirim", "Retur", "Gagal", "Masih berjalan"]) expect(html).toContain(label);
    expect(html.match(/data-slot="outcome-dot"/g)).toHaveLength(4);
  });
});

describe("setup steps of a gerai awaiting approval", () => {
  it("marks progress and gives the admin one filled primary on the first open step", () => {
    expect(setupSteps({ hasOwnConnection: true, hasPickupPoint: false, isTenantAdmin: true }).map((s) => s.state)).toEqual(["done", "done", "todo", "waiting"]);
    const admin = renderToStaticMarkup(createElement(SetupSteps, { progress: { hasOwnConnection: false, hasPickupPoint: false, isTenantAdmin: true } }));
    expect(admin.match(/data-variant="default"/g)).toHaveLength(1);
    expect(admin.match(/data-variant="outline"/g)).toHaveLength(1);
    expect(admin).toContain('href="/app/pengaturan/koneksi"');
    const operator = renderToStaticMarkup(createElement(SetupSteps, { progress: { hasOwnConnection: false, hasPickupPoint: false, isTenantAdmin: false } }));
    expect(operator).not.toContain("/app/pengaturan/");
  });
});
