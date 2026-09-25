import { renderToReadableStream } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import TenantDashboardPage from "@/app/app/page";
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";

const fixture = vi.hoisted(() => ({
  extraOutlet: false,
  outletReady: true,
  periodSummary: vi.fn(async () => ({
    current: {
      codCount: 7,
      createdCount: 12,
      issuedCount: 8,
      nonCodCount: 5,
    },
    generatedAt: new Date("2026-08-31T12:00:00.000Z"),
    previous: {
      codCount: 5,
      createdCount: 9,
      issuedCount: 6,
      nonCodCount: 4,
    },
  })),
  periodSupport: vi.fn(async () => ({
    rows: [{
      occurredAt: new Date("2026-08-31T08:00:00.000Z"),
      outletName: "Outlet dashboard",
      paymentMethod: "COD" as "COD" | "COD_ONGKIR" | "NON_COD",
      shipmentId: "00000000-0000-3602-0000-000000000001",
      publicReference: "GC-10001",
      status: "ISSUED" as const,
    }],
    totalCount: 1,
  })),
  periodTrend: vi.fn(async () => [
    { codCount: 7, key: "2026-08-31", nonCodCount: 5 },
  ]),
  role: "TENANT_ADMIN" as "TENANT_ADMIN" | "OPERATOR",
  shipments: vi.fn<(tx: unknown, context: unknown, input: { limit?: number; mode?: "actionable" | "recent" }) => Promise<Array<{
    awb: string | null;
    destinationAreaLabel: string;
    outletName: string;
    recipientName: string;
    shipmentId: string;
    publicReference: string;
    status: "AWAITING_UPSTREAM_PAYMENT" | "DRAFT" | "FAILED" | "ISSUED" | "SUBMISSION_UNKNOWN";
    updatedAt: Date;
  }>>>(async () => []),
  totalShipments: 18,
  auditScenario: null as string | null,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(
    fixture.auditScenario ? { "x-geraicuan-ui-audit": fixture.auditScenario } : {},
  )),
}));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, useRouter: () => ({ refresh: vi.fn() }) };
});
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({
    role: fixture.role,
    scope: "tenant" as const,
    tenantId: "00000000-0000-3600-0000-000000000001",
    userId: "dashboard-period-user-3201",
  })),
}));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (
    _db: unknown,
    userId: string,
    tenantId: string,
    work: (tx: unknown, context: unknown) => Promise<unknown>,
  ) => {
    return work(
      {},
      { role: fixture.role, tenantId, userId },
    );
  }),
}));
vi.mock("@/db/outlet-readiness-repository", () => ({
  listOutletReadinessSummary: vi.fn(async () => [{
    id: "00000000-0000-3601-0000-000000000001",
    name: "Outlet dashboard",
    ready: fixture.outletReady,
  }, ...(fixture.extraOutlet ? [{ id: "00000000-0000-3601-0000-000000000002", name: "Outlet cabang", ready: true }] : [])]),
}));
vi.mock("@/db/tenant-dashboard-repository", async (importOriginal) => ({
  TENANT_DASHBOARD_ACTIONABLE_STATUSES: (await importOriginal<typeof import("@/db/tenant-dashboard-repository")>()).TENANT_DASHBOARD_ACTIONABLE_STATUSES,
  loadTenantDashboardMetrics: vi.fn(async () => ({
    actionRequiredBreakdown: {
      awaitingUpstreamPayment: 1,
      failed: 1,
      submissionUnknown: 1,
    },
    finance: { reconciliationVarianceCount: 1 },
    generatedAt: new Date("2026-08-31T12:00:00.000Z"),
    role: fixture.role,
    summary: { actionRequired: 3, issuedToday: 8, readyToProgress: 4, total: fixture.totalShipments },
    workflowBreakdown: { draft: 2, estimated: 2, issuedToday: 8 },
  })),
  loadTenantDashboardPeriodSummary: fixture.periodSummary,
  loadTenantDashboardPeriodSupport: fixture.periodSupport,
  loadTenantDashboardPeriodTrend: fixture.periodTrend,
  loadTenantDashboardShipments: fixture.shipments,
}));

async function renderDashboard(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  const stream = await renderToReadableStream(
    await TenantDashboardPage({ searchParams: Promise.resolve(searchParams) }),
  );
  await stream.allReady;
  return new Response(stream).text();
}

describe("analytics-led tenant dashboard", () => {
  // The dashboard derives its period buckets from the current clock, so the
  // fixture dates below only stay inside the rendered range with a pinned Date.
  beforeAll(() => {
    vi.useFakeTimers({ now: new Date("2026-08-31T12:00:00.000Z"), toFake: ["Date"] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    fixture.extraOutlet = false;
    fixture.outletReady = true;
    fixture.role = "TENANT_ADMIN";
    fixture.totalShipments = 18;
    fixture.auditScenario = null;
    vi.unstubAllEnvs();
    fixture.periodSummary.mockClear();
    fixture.periodSupport.mockClear();
    fixture.periodTrend.mockClear();
    fixture.shipments.mockReset();
    fixture.shipments.mockResolvedValue([]);
  });

  it("defaults to the last seven days in WIB and separates COD/non-COD input from revenue", async () => {
    const html = await renderDashboard();

    expect(html).toContain("Ringkasan periode");
    // T-163: the period select became the one date-range control. The default
    // travels as the always-present hidden `rentang`, the trigger names the
    // resolved range, and the preset list marks the chosen one.
    expect(html).toMatch(/<summary[^>]*aria-expanded="false"[^>]*id="dashboard-range-trigger"/);
    expect(html).not.toMatch(/role="dialog"/);
    expect(html).toMatch(/id="dashboard-range-trigger"[\s\S]*?25 Agu 2026 – 31 Agu 2026/);
    // One checked native radio carries `rentang`; nothing mirrors it.
    const radios = html.match(/<input[^>]*type="radio"[^>]*name="rentang"[^>]*>/g) ?? [];
    expect(radios.filter((radio) => radio.includes('checked=""'))).toHaveLength(1);
    expect(radios.find((radio) => radio.includes('checked=""'))).toContain('value="7-hari"');
    expect(html).toContain("WIB (UTC+07:00)");
    expect(html).not.toMatch(/name="tz"/);
    expect(html).not.toContain("Tanggal &amp; zona waktu");
    expect(html).toContain("Kiriman dibuat");
    expect(html).toContain("Kiriman COD");
    expect(html).toContain("Kiriman non-COD");
    // T-177: no goods value, revenue or margin figure anywhere on the dashboard.
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/margin|laba|profit|keuntungan|omset|omzet|cogs|\bhpp\b|pokok cod|nilai barang|pendapatan|revenue/i);
    expect(html).toContain("Resi terbit");
    expect(html).toContain("support=created");
    expect(html).toContain("support=cod");
    expect(html).toContain("support=non-cod");
    expect(html).toContain("support=issued");
    // Each KPI card is one drill-down link whose name keeps the value and the
    // purpose, and whose description (the period comparison) stays announced.
    const codLink = html.match(/<a[^>]*aria-label="Kiriman COD: 7\. Lihat kiriman"[^>]*>/)?.[0];
    expect(codLink).toContain("support=cod");
    const describedBy = codLink?.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toMatch(new RegExp(`id="${describedBy}"[^>]*>(?:(?!</a>).)*\\+2 \\(40%\\) vs 7 hari sebelumnya`));
    expect(html).toContain("Grafik kiriman");
    expect(fixture.periodTrend).toHaveBeenCalledWith(
      expect.anything(), expect.anything(),
      expect.objectContaining({ presetId: "7-hari", startDate: "2026-08-25", lastIncludedDate: "2026-08-31" }),
      {},
    );
    expect(fixture.periodSummary).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ presetId: "7-hari", timezone: "Asia/Jakarta" }),
      expect.anything(),
      {},
    );
  });

  it("compares the preceding seven dates using the same outlet scope", async () => {
    const outlet = "00000000-0000-3601-0000-000000000001";
    const html = await renderDashboard({ outlet });
    expect(fixture.periodTrend).toHaveBeenNthCalledWith(2,
      expect.anything(), expect.anything(),
      expect.objectContaining({ startDate: "2026-08-18", lastIncludedDate: "2026-08-24", timezone: "Asia/Jakarta" }),
      { outletId: outlet },
    );
    expect(html).toContain("Tanggal pembanding");
    expect(html).toContain("18 Agu");
    expect(html).toContain("24 Agu");
  });

  it("shows a recovery state when comparison data fails instead of charting zero", async () => {
    fixture.periodTrend.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("comparison unavailable"));
    const html = await renderDashboard();
    expect(html).toContain("Grafik kiriman tidak dapat dimuat");
    expect(html).not.toContain("Lihat tabel data tren");
    expect(html).toContain("Kiriman dibuat");
  });

  it("shows monthly totals without a misleading previous-month alignment", async () => {
    const html = await renderDashboard({ rentang: "kustom", dari: "2026-03-01", sampai: "2026-04-01" });
    expect(fixture.periodTrend).toHaveBeenCalledTimes(1);
    expect(html).toContain("Pilih rentang maksimal 31 hari");
    expect(html).not.toContain("Tanggal pembanding");
  });

  it("ignores the demo query outside development", async () => {
    const html = await renderDashboard({ demo: "grafik" });
    expect(fixture.periodTrend).toHaveBeenCalledTimes(2);
    expect(html).not.toContain("Data demo");
  });

  it("respects an explicit single-day selection without requesting a trend", async () => {
    const html = await renderDashboard({ rentang: "hari-ini" });
    expect(html).not.toContain("Grafik kiriman");
    expect(fixture.periodTrend).not.toHaveBeenCalled();
    expect(fixture.periodSummary).toHaveBeenCalledWith(
      expect.anything(), expect.anything(),
      expect.objectContaining({ presetId: "hari-ini" }), expect.anything(), {},
    );
  });

  it("keeps a seven-day zero trend visible instead of hiding the section", async () => {
    fixture.periodTrend.mockResolvedValueOnce([]);
    const html = await renderDashboard();
    expect(html).toContain("Grafik kiriman");
    expect(html).toContain("Lihat tabel data tren");
    expect(html).toContain("31 Agu");
  });

  it("opens role-safe supporting records with the selected KPI predicate", async () => {
    fixture.role = "OPERATOR";
    const html = await renderDashboard({
      rentang: "7-hari",
      support: "cod",
      tz: "Asia/Jakarta",
    });

    expect(html).toContain("Rincian kiriman:");
    expect(html).toContain("kiriman COD dan COD Ongkir dibuat");
    expect(html).toContain("Data mengikuti periode, zona waktu, outlet, dan jenis aktivitas");
    expect(html).toContain("Tabel rincian kiriman");
    expect(fixture.periodSupport).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ presetId: "7-hari" }),
      "cod",
      {},
    );
  });

  it("persists a multi-day outlet range and exposes the semantic trend table", async () => {
    const outletId = "00000000-0000-3601-0000-000000000001";
    const html = await renderDashboard({
      outlet: outletId,
      rentang: "7-hari",
      tz: "Asia/Jakarta",
    });

    expect(html).toContain("Grafik kiriman");
    expect(html).toContain("Lihat tabel data tren");
    expect(html).toContain("Outlet dashboard");
    expect(html).toContain("Analitik lengkap");
    expect(fixture.periodSummary).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ presetId: "7-hari" }),
      expect.anything(),
      { outletId },
    );
  });

  it("fails closed for an unavailable outlet without starting period reads", async () => {
    const html = await renderDashboard({
      outlet: "00000000-0000-3601-0000-000000000099",
    });

    expect(html).toContain("Filter outlet ditolak");
    expect(html).toContain("Reset ke filter aman");
    expect(html).toContain('href="/app"');
    expect(fixture.periodSummary).not.toHaveBeenCalled();
    expect(fixture.periodTrend).not.toHaveBeenCalled();
  });

  it("uses readiness-aware first-run guidance when the outlet can create shipments", async () => {
    fixture.totalShipments = 0;

    const html = await renderDashboard();

    expect(html).toContain("Outlet sudah siap");
    expect(html).not.toContain("Siapkan outlet, lalu buat kiriman pertama");
  });

  it("keeps Operator exceptions free of admin-only payment recovery", async () => {
    fixture.role = "OPERATOR";

    const html = await renderDashboard();

    expect(html).not.toContain("Menunggu pembayaran");
    expect(html).not.toContain("Selisih rekonsiliasi");
    expect(html).toContain("Tidak ada kiriman yang perlu ditindaklanjuti saat ini");
  });

  const recentItems = (html: string) => {
    const list = html.match(/<ul[^>]*aria-label="Daftar kiriman terbaru dan tindak lanjut"[^>]*>(?:(?!<\/ul>).)*<\/ul>/)?.[0] ?? "";
    return list.match(/<li\b(?:(?!<\/li>).)*<\/li>/g) ?? [];
  };
  type ShipmentRow = Awaited<ReturnType<typeof fixture.shipments>>[number];
  const shipment = (suffix: string, recipientName: string, status: ShipmentRow["status"], updatedAt: string, awb: string | null = null): ShipmentRow => ({
    awb, destinationAreaLabel: `Area ${recipientName}`, outletName: "Outlet dashboard", recipientName, shipmentId: `00000000-0000-3603-0000-${suffix.padStart(12, "0")}`, publicReference: `GC-${10000 + parseInt(suffix, 16)}`, status, updatedAt: new Date(updatedAt),
  });

  it("merges recent and actionable shipments into one compact card, each shipment once, actionable first", async () => {
    const payment = "00000000-0000-3603-0000-0000000000a1";
    const draft = "00000000-0000-3603-0000-0000000000b2";
    const issued = "00000000-0000-3603-0000-0000000000c3";
    const paymentRow = { awb: null, destinationAreaLabel: "Bandung", outletName: "Outlet dashboard", recipientName: "Penerima Satu", shipmentId: payment, publicReference: "GC-10161", status: "AWAITING_UPSTREAM_PAYMENT" as const, updatedAt: new Date("2026-08-31T11:00:00.000Z") };
    const draftRow = { awb: null, destinationAreaLabel: "Bogor", outletName: "Outlet dashboard", recipientName: "Penerima Dua", shipmentId: draft, publicReference: "GC-10178", status: "DRAFT" as const, updatedAt: new Date("2026-08-31T11:55:00.000Z") };
    // Newest overall, but not actionable: it must follow the actionable rows.
    const issuedRow = { awb: "AWB-DASH-3603", destinationAreaLabel: "Cirebon", outletName: "Outlet dashboard", recipientName: "Penerima Tiga", shipmentId: issued, publicReference: "GC-10195", status: "ISSUED" as const, updatedAt: new Date("2026-08-31T11:58:00.000Z") };
    fixture.shipments.mockImplementation(async (_tx, _context, input) =>
      input.mode === "actionable" ? [paymentRow, draftRow] : [issuedRow, draftRow, paymentRow]);

    const adminHtml = await renderDashboard();
    // Both reads stay: the recent set (including non-actionable outcomes) and the actionable set.
    expect(fixture.shipments).toHaveBeenCalledTimes(2);
    expect(fixture.shipments).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ limit: 8, mode: "recent" }));
    expect(fixture.shipments).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ mode: "actionable" }));
    const items = recentItems(adminHtml);
    expect(items).toHaveLength(3);
    expect(adminHtml.match(/<ul[^>]*aria-label="Daftar kiriman/g)).toHaveLength(1);
    for (const name of ["Penerima Satu", "Penerima Dua", "Penerima Tiga"]) expect(adminHtml.split(name).length - 1).toBe(1);
    // Exception, then draft, then the non-actionable recent outcome.
    expect(items.map((item) => ["Penerima Satu", "Penerima Dua", "Penerima Tiga"].find((name) => item.includes(name)))).toEqual(["Penerima Satu", "Penerima Dua", "Penerima Tiga"]);
    expect(items[0]).toContain('href="/app/pengiriman/10161#pemulihan-pembayaran"');
    expect(items[0]).toContain("Pulihkan pembayaran");
    expect(items[1]).toContain(`href="/app/pengiriman/baru?draft=${draft}"`);
    expect(items[1]).toContain("Bogor");
    expect(items[1].replace(/<[^>]+>/g, " ")).toContain("GC-10178");
    expect(items[1].replace(/<[^>]+>/g, " ")).not.toContain(draft);
    // Visible time is the short absolute WIB time; the full instant stays in dateTime.
    expect(items[1].replaceAll("<!-- -->", "")).toMatch(/<time[^>]*dateTime="2026-08-31T11:55:00.000Z"[^>]*>31 Agu, 18\.55<span class="sr-only"> WIB<\/span><\/time>/);
    // The issued outcome keeps its destination and AWB, with no next-action button.
    expect(items[2]).toContain("Cirebon");
    expect(items[2]).toContain("AWB-DASH-3603");
    expect(items[2]).toContain('dateTime="2026-08-31T11:58:00.000Z"');
    expect(items[2].match(/<a\b/g)).toHaveLength(1);
    expect(items[2]).toContain('href="/app/pengiriman/10195"');
    // AWB only where the provider issued one; the list carries no per-status guidance or relative activity phrase.
    expect(items.filter((item) => item.includes("AWB"))).toEqual([items[2]]);
    for (const status of ["AWAITING_UPSTREAM_PAYMENT", "DRAFT", "ISSUED"] as const) expect(adminHtml).not.toContain(SHIPMENT_STATUS_PRESENTATION[status].guidance);
    expect(items.join("")).not.toContain("Aktivitas terakhir");
    // A single-outlet tenant does not repeat the outlet name on each row.
    expect(items.join("")).not.toContain("Outlet dashboard");
    expect(adminHtml).toContain("Yang perlu ditindaklanjuti tampil lebih dulu.");
    expect(adminHtml).toMatch(/href="\/app\/pengiriman"[^>]*>Lihat semua kiriman</);

    fixture.role = "OPERATOR";
    const operatorHtml = await renderDashboard();
    expect(operatorHtml).toContain("Lihat panduan admin");
    expect(operatorHtml).not.toContain("#pemulihan-pembayaran");
    expect(operatorHtml).not.toContain("Pulihkan pembayaran");
  });

  // T-200: the recent card merges both reads, so emptying only the actionable read
  // left every actionable shipment on screen through the recent read, and the
  // development scenario rendered exactly what the base route renders.
  it("dashboard-action-empty screens a card with no follow-up, keeping non-actionable recent outcomes", async () => {
    const row = (status: "AWAITING_UPSTREAM_PAYMENT" | "DRAFT" | "FAILED" | "ISSUED" | "SUBMISSION_UNKNOWN", n: number) => ({ awb: null, destinationAreaLabel: `Area ${n}`, outletName: "Outlet dashboard", recipientName: `Penerima Kosong ${n}`, shipmentId: `00000000-0000-3604-0000-00000000000${n}`, publicReference: `GC-1030${n}`, status, updatedAt: new Date(`2026-08-31T10:0${n}:00.000Z`) });
    const actionable = [row("FAILED", 1), row("DRAFT", 2), row("SUBMISSION_UNKNOWN", 3)];
    const issued = row("ISSUED", 4);
    fixture.shipments.mockImplementation(async (_tx, _context, input) => input.mode === "actionable" ? actionable : [issued, ...actionable]);
    vi.stubEnv("NODE_ENV", "development");

    const base = recentItems(await renderDashboard());
    expect(base.filter((item) => item.includes('data-actionable="true"'))).toHaveLength(3);

    fixture.auditScenario = "dashboard-action-empty";
    const items = recentItems(await renderDashboard());
    expect(items).toHaveLength(1);
    expect(items[0]).toContain("Penerima Kosong 4");
    expect(items.join("")).not.toContain('data-actionable="true"');
  });

  it("names the outlet on recent rows only when the tenant has more than one outlet", async () => {
    fixture.shipments.mockImplementation(async (_tx, _context, input) =>
      input.mode === "recent" ? [shipment("d4", "Penerima Empat", "ISSUED", "2026-08-31T10:00:00.000Z", "AWB-4")] : []);
    expect(recentItems(await renderDashboard())[0]).not.toContain("Outlet dashboard");
    fixture.extraOutlet = true;
    expect(recentItems(await renderDashboard())[0]).toContain("Outlet dashboard");
  });

  it("lists an unknown submission as actionable, ahead of newer outcomes, with a detail action", async () => {
    const unknown = shipment("a9", "Penerima Belum Pasti", "SUBMISSION_UNKNOWN", "2026-08-30T01:00:00.000Z");
    const issued = shipment("c9", "Penerima Terbit", "ISSUED", "2026-08-31T11:00:00.000Z", "AWB-9");
    fixture.shipments.mockImplementation(async (_tx, _context, input) => input.mode === "actionable" ? [unknown] : [issued, unknown]);
    const items = recentItems(await renderDashboard());
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("Penerima Belum Pasti");
    expect(items[0]).toContain('data-actionable="true"');
    expect(items[0]).toMatch(new RegExp(`href="/app/pengiriman/${unknown.publicReference.slice(3)}"[^>]*>Lihat detail<`));
    expect(items[1]).not.toContain("data-actionable");
  });

  it("keeps a long provider AWB inside its row instead of widening the page", async () => {
    // Bound to the 390px overflow: an unbreakable AWB in an auto-sized track pushed
    // the document wider than the viewport. The minmax(0,1fr) track and break-all each
    // catch it on their own.
    const awb = "SANITIZED-CNOTE-0001-WITH-A-VERY-LONG-PROVIDER-SUFFIX";
    fixture.shipments.mockImplementation(async (_tx, _context, input) =>
      input.mode === "recent" ? [shipment("d9", "Penerima Panjang", "ISSUED", "2026-08-31T10:00:00.000Z", awb)] : []);
    const item = recentItems(await renderDashboard())[0] ?? "";
    expect(item.match(/^<li[^>]*>/)?.[0]).toMatch(/grid-cols-\[minmax\(0,1fr\)\]/);
    const awbSpan = item.match(/<span[^>]*>AWB <span[^>]*>[^<]*<\/span><\/span>/)?.[0] ?? "";
    expect(awbSpan).toContain(awb);
    // Wraps in full rather than truncating: the AWB must stay readable.
    expect(awbSpan).toMatch(/\bbreak-all\b/);
    expect(awbSpan).not.toMatch(/\btruncate\b/);
  });

  // T-168 (owner 2026-09-16): the "Saat ini · Pekerjaan yang perlu diperhatikan" block
  // left the dashboard. Its counts now filter the queue they link to (PR-52), so the
  // dashboard must not resurrect a second, period-free copy of them.
  it("no longer renders the snapshot attention block", async () => {
    const html = await renderDashboard();
    expect(html).not.toContain('aria-labelledby="pulse-heading"');
    expect(html).not.toContain("Pekerjaan yang perlu diperhatikan");
    expect(html).not.toContain("tidak mengikuti filter di atas");
  });

  it("caps the merged card at eight rows without dropping an actionable shipment", async () => {
    const actionable = Array.from({ length: 5 }, (_, index) => shipment(`e${index}`, `Tindak ${index}`, "FAILED", `2026-08-30T0${index}:00:00.000Z`));
    const recent = Array.from({ length: 8 }, (_, index) => shipment(`f${index}`, `Terbaru ${index}`, "ISSUED", `2026-08-31T0${index}:00:00.000Z`, `AWB-${index}`));
    fixture.shipments.mockImplementation(async (_tx, _context, input) => input.mode === "actionable" ? actionable : recent);
    const items = recentItems(await renderDashboard());
    expect(items).toHaveLength(8);
    expect(items.slice(0, 5).every((item) => item.includes('data-actionable="true"'))).toBe(true);
    for (const row of actionable) expect(items.some((item) => item.includes(row.recipientName))).toBe(true);
    // The newest recent outcomes fill the remaining rows.
    expect(items.slice(5).map((item) => item.match(/Terbaru \d/)?.[0])).toEqual(["Terbaru 7", "Terbaru 6", "Terbaru 5"]);
  });

  it("keeps the applied period, zone, and outlet visible at every width", async () => {
    const outlet = "00000000-0000-3601-0000-000000000001";
    const summary = (html: string) => html.replaceAll("<!-- -->", "").match(/<p class="([^"]*)">([^<]*) · WIB \(UTC\+07:00\) · ([^<]+)<\/p>/);
    const all = summary(await renderDashboard());
    expect(all?.[3]).toBe("Semua outlet");
    expect(all?.[1]).not.toMatch(/\b(?:hidden|sr-only)\b/);
    expect(summary(await renderDashboard({ outlet }))?.[3]).toBe("Outlet dashboard");
  });

  it("leads KPI comparisons with the absolute change and keeps the shared percentage", async () => {
    const html = await renderDashboard();
    // created 12 vs 9, COD 7 vs 5 (fixture): absolute first, percentage from the shared formula.
    expect(html).toContain("+3 (33%) vs 7 hari sebelumnya");
    expect(html).toContain("+2 (40%) vs 7 hari sebelumnya");
    expect(html).toContain("33% lebih tinggi dari periode sebelumnya.");

    fixture.periodSummary.mockResolvedValueOnce({
      current: { codCount: 5, createdCount: 5, issuedCount: 0, nonCodCount: 0 },
      generatedAt: new Date("2026-08-31T12:00:00.000Z"),
      previous: { codCount: 5, createdCount: 0, issuedCount: 4, nonCodCount: 0 },
    });
    const edgeHtml = await renderDashboard();
    expect(edgeHtml).toContain("+5 (naik dari 0) vs 7 hari sebelumnya");
    expect(edgeHtml).toContain("Tidak berubah vs 7 hari sebelumnya");
    expect(edgeHtml).toContain("−4 (100%) vs 7 hari sebelumnya");
  });

  it("keeps the counting method in one disclosure and one compact freshness line per data scope", async () => {
    const html = await renderDashboard();
    const disclosure = html.match(/<details(?:(?!<\/details>).)*Cara menghitung(?:(?!<\/details>).)*<\/details>/)?.[0];
    expect(disclosure).toContain("Dibandingkan dengan");
    expect(disclosure).toContain("COD/non-COD dihitung saat kiriman dibuat; COD mencakup COD Ongkir; resi dihitung saat diterbitkan Mengantar.");
    expect(disclosure).toContain("Data dianggap perlu diperbarui setelah 5 menit.");
    // T-168: data refreshes itself while the tab is visible, so no region carries a button.
    expect(html).not.toContain(">Muat ulang<");
    expect(html).toMatch(/Data diperbarui otomatis setelah\s*(?:<!-- -->)?\s*5\s*(?:<!-- -->)?\s*menit/);
    // Compact clock (HH.mm) in the viewer's zone; the full instant stays in dateTime.
    expect(html.match(/Diperbarui(?:<!-- -->)? <time dateTime="2026-08-31T12:00:00.000Z">19\.00<\/time>/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it("offers scoped full analytics to Tenant Admin even when no trend card renders", async () => {
    const html = await renderDashboard({ rentang: "hari-ini" });
    expect(html).not.toContain("Grafik kiriman");
    expect(html).toMatch(/href="\/app\/analitik\?[^"]*rentang=hari-ini[^"]*"[^>]*>Analitik lengkap/);

    fixture.role = "OPERATOR";
    expect(await renderDashboard({ rentang: "hari-ini" })).not.toContain("Analitik lengkap");
  });

  it("returns the filter form and reset to the visible page heading", async () => {
    const html = await renderDashboard({ rentang: "30-hari" });
    expect(html).toContain('action="/app#dashboard-page-heading"');
    expect(html).toContain('href="/app#dashboard-page-heading"');
    const target = html.match(/<[a-z0-9]+[^>]*id="dashboard-page-heading"[^>]*>/)?.[0];
    expect(target).toMatch(/^<h1\b/);
    expect(target).not.toContain("sr-only");
  });
});
