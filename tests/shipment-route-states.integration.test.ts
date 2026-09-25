import { createElement, type ReactNode } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ShipmentDetailError from "@/app/app/pengiriman/[shipmentId]/error";
import ShipmentDetailLoading from "@/app/app/pengiriman/[shipmentId]/loading";
import ShipmentDetailPage from "@/app/app/pengiriman/[shipmentId]/page";
import ShipmentQueueError from "@/app/app/pengiriman/error";
import ShipmentQueueLoading from "@/app/app/pengiriman/loading";
import ShipmentQueuePage from "@/app/app/pengiriman/page";
import { loadShipmentDetail, loadShipmentQueuePage } from "@/db/shipment-queue-repository";
import type { ShipmentStatus } from "@/lib/shipment-queue";

const fixture = vi.hoisted(() => ({
  auditHeader: null as string | null,
  awb: null as string | null,
  codFormulaRetired: false,
  role: "TENANT_ADMIN" as "TENANT_ADMIN" | "OPERATOR",
  batchStatus: null as null | "SUBMISSION_QUEUED" | "SUBMITTING" | "SUBMISSION_UNKNOWN" | "COMPLETED" | "FAILED",
  recoveryStatus: null as null | "PAYMENT_QUEUED" | "PAYING" | "PAYMENT_UNKNOWN" | "COMPLETED",
  status: "DRAFT" as ShipmentStatus,
}));

const shipmentId = "00000000-0000-3902-0000-000000000001";
const generatedAt = new Date();

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: () => fixture.auditHeader })),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (href: string) => { throw new Error(`NEXT_REDIRECT:${href}`); },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({
    role: fixture.role,
    scope: "tenant" as const,
    tenantId: "00000000-0000-3900-0000-000000000001",
    userId: "t39-user",
  })),
}));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (
    _db: unknown,
    userId: string,
    tenantId: string,
    work: (tx: unknown, context: unknown) => Promise<unknown>,
  ) => work({}, { role: fixture.role, tenantId, userId })),
}));
// Route keys resolve inside the tenant: 10039 is this fixture's number; anything else is absent.
vi.mock("@/db/shipment-number-repository", () => ({
  resolveShipmentRouteKey: vi.fn(async (_tx: unknown, _context: unknown, key: { kind: string; shipmentId?: string; tenantNumber?: number }) =>
    (key.kind === "uuid" ? key.shipmentId === shipmentId : key.tenantNumber === 10039)
      ? { shipmentId, tenantNumber: 10039 }
      : null),
}));
vi.mock("@/db/cod-totals-repository", () => ({
  calculateCodAmounts: () => ({
    goodsValueIdr: 250_000,
    providerCodAmountIdr: 272_200,
    serviceFeeIdr: 7_800,
    shippingAmountIdr: 14_000,
    vatAmountIdr: 858,
  }),
  shipmentCodFormulaRetired: vi.fn(async () => fixture.codFormulaRetired),
}));
vi.mock("@/lib/sanctioned-order-fixture", () => ({
  isSanctionedOrderFixtureEnabled: () => false,
}));
vi.mock("@/lib/sanctioned-unpaid-recovery-fixture", () => ({
  isSanctionedUnpaidRecoveryFixtureEnabled: () => false,
}));
vi.mock("@/lib/sanctioned-reconciliation-fixture", () => ({
  isSanctionedReconciliationFixtureEnabled: () => false,
}));
// T-204: the queue lists the tenant's outlets for the Tenant Admin status pull.
vi.mock("@/db/tenant-repository", () => ({
  listTenantOutlets: vi.fn(async () => [{ id: "00000000-0000-4000-8000-000000020611", name: "Gerai utama" }]),
}));
// T-204 review: the queue shows when Mengantar statuses were last pulled (Tenant Admin only).
vi.mock("@/db/provider-settlement-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/provider-settlement-repository")>()),
  loadProviderDeliveryStatusBasis: vi.fn(async () => ({ lastObservedAt: null, observationVisible: true })),
}));
vi.mock("@/db/shipment-queue-repository", () => ({
  loadShipmentQueuePage: vi.fn(async () => ({
    generatedAt,
    page: 1,
    pageSize: 5,
    rows: [
      {
        awb: fixture.awb,
        createdAt: new Date("2026-09-01T01:00:00.000Z"),
        // A real Mengantar label: subdistrict, district, city, province, zip.
        declaredValueIdr: 150_000,
        destinationAreaLabel: "Cihapit, Bandung Wetan, Kota Bandung, Jawa Barat, 40114",
        outletName: "Gerai utama",
        paymentMethod: "COD" as const,
        providerCodAmountIdr: null,
        packageContent: "Paket audit",
        packageWeightGrams: 1_000,
        providerService: null,
        recipientName: "Penerima audit",
        recipientPhone: "081234567890",
        shipmentId,
        publicReference: "GC-10039",
        status: "DRAFT",
        updatedAt: new Date("2026-09-01T02:00:00.000Z"),
      },
    ],
    status: "ALL",
    // PR-52 panel counts travel with the page the panel sits on.
    summary: {
      "QUE-ALL": 25,
      "QUE-NEEDS-AWB": 9,
      "QUE-AWAITING-PICKUP": 6,
      "QUE-IN-TRANSIT": 4,
      "QUE-DELIVERED": 3,
      "QUE-ATTENTION": 3,
    },
    totalCount: 25,
    totalPages: 5,
  })),
  loadShipmentDetail: vi.fn(async () => ({
    createdAt: new Date("2026-09-01T01:00:00.000Z"),
    destinationAreaId: "fixture-bandung",
    destinationAreaLabel: "Bandung",
    estimate: fixture.status === "DRAFT" ? null : {
      isCodRequested: true,
      retrievedAt: new Date("2026-09-01T01:30:00.000Z"),
      services: [{
        codEligible: true,
        deliveryEstimate: "1-2 hari",
        estimateServiceId: "00000000-0000-3903-0000-000000000001",
        insuranceAmountIdr: null,
        providerService: "JNE REG",
        shippingAmountIdr: 14_000,
      }],
      snapshotId: "00000000-0000-3904-0000-000000000001",
    },
    generatedAt,
    isCod: true,
    outlet: { id: "00000000-0000-3901-0000-000000000001", name: "Gerai utama" },
    package: {
      content: "Paket audit",
      declaredValueIdr: 250_000,
      heightCm: 10,
      lengthCm: 20,
      quantity: 1,
      weightGrams: 1_000,
      widthCm: 15,
    },
    printCount: fixture.status === "ISSUED" ? 1 : 0,
    provider: fixture.status === "DRAFT" || fixture.status === "ESTIMATED" ? null : {
      awb: fixture.status === "ISSUED" ? "SANITIZED-AWB-T39" : null,
      batchSafeErrorCode: fixture.status === "SUBMISSION_UNKNOWN" ? "UPSTREAM_UNKNOWN" : null,
      batchId: "00000000-0000-3905-0000-000000000001",
      batchStatus: fixture.batchStatus ?? fixture.status,
      courier: "JNE",
      insuranceAmountIdr: null,
      isPaid: fixture.status === "ISSUED" ? true : null,
      orderId: "SANITIZED-ORDER-T39",
      orderStatus: fixture.status,
      providerCodAmountIdr: 272_200,
      providerService: "JNE REG",
      recoveryStatus: fixture.recoveryStatus,
      resolvedAt: generatedAt,
      safeResponseCode: null,
      shippingAmountIdr: 14_000,
    },
    recipient: { address: "Alamat penerima audit", name: "Penerima audit", phone: "080000000002" },
    sender: { address: "Alamat pengirim audit", name: "Pengirim audit", phone: "080000000001" },
    shipmentId,
    publicReference: "GC-10039",
    status: fixture.status,
    updatedAt: new Date("2026-09-01T02:00:00.000Z"),
  })),
}));

async function render(node: ReactNode) {
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return new Response(stream).text();
}

async function renderQueue(searchParams: Record<string, string | string[] | undefined> = {}) {
  return render(await ShipmentQueuePage({ searchParams: Promise.resolve(searchParams) }));
}

async function renderDetail(id = "10039") {
  return render(await ShipmentDetailPage({ params: Promise.resolve({ shipmentId: id }) }));
}

describe("PR-44 shipment detail route keys", () => {
  it("serves the canonical number, redirects legacy UUID and prefixed keys, and 404s unknown or malformed keys", async () => {
    fixture.status = "DRAFT";
    await expect(renderDetail("10039")).resolves.toContain("GC-10039");
    await expect(renderDetail(shipmentId)).rejects.toThrow("NEXT_REDIRECT:/app/pengiriman/10039");
    await expect(renderDetail("GC-10039")).rejects.toThrow("NEXT_REDIRECT:/app/pengiriman/10039");
    await expect(renderDetail("tkp-10039")).rejects.toThrow("NEXT_REDIRECT:/app/pengiriman/10039");
    await expect(renderDetail("10040")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(renderDetail("9999")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(renderDetail("GC-10039-x")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("T-39 shipment queue and lifecycle route states", () => {
  beforeEach(() => {
    fixture.auditHeader = null;
    fixture.awb = null;
    fixture.codFormulaRetired = false;
    fixture.role = "TENANT_ADMIN";
    fixture.batchStatus = null;
    fixture.recoveryStatus = null;
    fixture.status = "DRAFT";
    vi.mocked(loadShipmentDetail).mockClear();
    vi.mocked(loadShipmentQueuePage).mockClear();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("keeps a full provider-length AWB in a wrapping cell alongside bounded recipient and outlet facts", async () => {
    fixture.awb = "AWB12345".repeat(5);
    const html = await renderQueue();
    const cells = [...html.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/g)].map(([cell]) => cell);
    const awb = cells.find(cell => cell.includes(fixture.awb!));
    expect(awb).toContain("max-w-44");
    expect(awb).toContain("whitespace-normal");
    expect(awb).toMatch(new RegExp(`<span[^>]*class="[^"]*break-all[^"]*"[^>]*>${fixture.awb}</span>`));
    expect(cells.find(cell => cell.includes("Penerima audit"))).toMatch(/class="[^"]*max-w-48[^"]*whitespace-normal/);
    expect(cells.find(cell => cell.includes("Gerai utama"))).toMatch(/class="[^"]*max-w-44[^"]*whitespace-normal/);
  });

  it("offers the read-only Mengantar status pull to Tenant Admin only, without Impor CSV (T-204)", async () => {
    const html = await renderQueue();
    expect(html).toContain("Perbarui status dari Mengantar");
    expect(html).toMatch(/<form[^>]*>[\s\S]*?name="outletId"[^>]*value="00000000-0000-4000-8000-000000020611"/);
    expect(html).not.toContain("/app/impor");
    expect(html).not.toContain("Impor CSV");
    // The admin sees how fresh the statuses are, as on Retur.
    expect(html).toContain("Status dari Mengantar belum pernah diperbarui.");

    fixture.role = "OPERATOR";
    const operatorHtml = await renderQueue();
    expect(operatorHtml).not.toContain("Perbarui status dari Mengantar");
    expect(operatorHtml).not.toContain("Status dari Mengantar");
  });

  it("renders a URL-addressable shadcn queue with grouped taxonomy, named local scroll, freshness, and pagination", async () => {
    const html = await renderQueue();

    expect(html).toContain('id="shipment-queue-heading"');
    // T-203: the status control names itself in words and paints the chosen view server-side.
    expect(html).toContain("Status kiriman");
    expect(html).toMatch(/<button[^>]*id="status-kiriman"[^>]*>[\s\S]*?Status:[\s\S]*?Semua status/);
    expect(html.replace(/<[^>]+>/g, " ")).toContain("GC-10039");
    expect(html.replace(/<[^>]+>/g, " ")).not.toContain(shipmentId);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Daftar kiriman; geser horizontal untuk melihat seluruh kolom"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Diperbarui");
    expect(html).toContain("page=2");
    expect(html).toContain("Penerima audit");

    // Secondary facts are stacked into six columns so the queue fits a desktop
    // content width; every value the nine-column table printed is still in it.
    const headers = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);
    expect(headers).toEqual([
      "Nomor kiriman", "Status / Pembayaran", "Penerima", "Paket / Outlet", "Ekspedisi / Resi", "Aktivitas terakhir",
    ]);
    for (const value of ["Draf", "COD", "Paket audit", "1 kg", "Gerai utama", "—", "Belum ada resi"]) {
      expect(html, value).toContain(value);
    }
    // T-148: name, phone and district–city stack in one cell; the full address stays on detail.
    const cells = [...html.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/g)].map(([cell]) => cell);
    const recipient = cells.find(cell => cell.includes("Penerima audit")) ?? "";
    expect([...recipient.matchAll(/<span[^>]*class="[^"]*\bblock\b[^"]*"[^>]*>([^<]*)<\/span>/g)].map(match => match[1]))
      .toEqual(["Penerima audit", "081234567890", "Bandung Wetan, Kota Bandung"]);
    expect(html).not.toContain("Cihapit");
    expect(html).not.toContain("40114");
    // Date and time are two lines of one <time>, and the shipment number never wraps.
    expect(html).toMatch(/<time[^>]*dateTime="2026-09-01T02:00:00.000Z"[^>]*><span class="block">1 Sep 2026<\/span><span class="block text-xs text-muted-foreground">09.00 WIB<\/span><\/time>/);
    // T-163 review: the row link carries the queue's resolved range so the
    // detail's "Kembali ke histori kiriman" returns to the list the operator left.
    expect(html).toMatch(/<a[^>]*class="[^"]*whitespace-nowrap[^"]*"[^>]*href="\/app\/pengiriman\/10039\?[^"]*rentang=/);
    // Below md the toolbar stacks and the status filter spans the row, so it
    // cannot overlap the freshness control at 390px.
    expect(html).toMatch(/class="[^"]*max-md:flex-col[^"]*"/);
    const trigger = html.match(/<button[^>]*id="status-kiriman"[^>]*>/)?.[0] ?? "";
    expect(trigger).toMatch(/class="(?:[^"]* )?w-full [^"]*md:w-auto md:min-w-54/);
    expect(trigger).not.toContain("border-dashed");
  });

  it("renders the queue as a record list below md and the table from md (T-203)", async () => {
    const html = await renderQueue();
    const list = html.match(/<ul[^>]*aria-label="Daftar kiriman"[^>]*>[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect(list).toMatch(/^<ul[^>]*class="[^"]*\bmd:hidden\b/);
    expect(list).toMatch(/<a[^>]*class="[^"]*min-h-11[^"]*font-mono[^"]*"[^>]*href="\/app\/pengiriman\/10039\?[^"]*">GC-10039<\/a>/);
    expect(list).toContain("Draf");
    expect(list).toContain("Penerima audit");
    expect(list).toContain("Belum ada resi");
    expect(list).toContain("WIB");
    expect(html).toMatch(/<div[^>]*data-slot="table-container"[^>]*class="[^"]*max-md:hidden/);
    expect(html).toContain("page=2");
  });

  it("reports invalid filters without losing the safe queue", async () => {
    const html = await renderQueue({ page: "oops", status: "UNKNOWN_STATUS" });

    expect(html).toContain("Filter disesuaikan");
    expect(html).toContain("Status tidak dikenali");
    expect(html).toContain("Nomor halaman tidak valid");
    expect(html).toContain("Penerima audit");
  });

  it("binds development queue scenarios to empty, pagination, stale, and route-error behavior", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fixture.auditHeader = "shipment-queue-empty";
    const empty = await renderQueue();
    expect(empty).toContain("Belum ada kiriman tersimpan");
    expect(empty).not.toContain("Penerima audit");

    fixture.auditHeader = "shipment-queue-paginated";
    await renderQueue();
    expect(loadShipmentQueuePage).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ pageSize: 5 }),
    );

    fixture.auditHeader = "shipment-queue-stale";
    expect(await renderQueue()).toContain("Perlu diperbarui");

    fixture.auditHeader = "shipment-queue-error";
    await expect(renderQueue()).rejects.toThrow("development-only shipment queue failure");
  });

  it("binds development detail stale and route-error scenarios to the dynamic route", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fixture.auditHeader = "shipment-detail-stale";
    expect(await renderDetail()).toContain("Perlu diperbarui");

    fixture.auditHeader = "shipment-detail-error";
    await expect(renderDetail()).rejects.toThrow("development-only shipment detail failure");
  });

  it.each([
    ["shipment-detail-submitting", "Upaya penyedia masih tercatat berjalan"],
    ["shipment-detail-payment-paying", "Pembayaran perlu direkonsiliasi"],
  ] as const)("binds the %s safe-check scenario", async (scenario, expected) => {
    vi.stubEnv("NODE_ENV", "development");
    fixture.auditHeader = scenario;
    const html = await renderDetail();

    expect(html).toContain(expected);
    expect(html).toContain('id="periksa-upaya-tersendat"');
    expect(html).toContain("Tidak ada permintaan baru yang dikirim ke penyedia");
  });

  it("refuses a never-submitted version 1 COD row up front with a disabled confirm (T-199)", async () => {
    const retiredMessage = "Nilai COD kiriman ini dihitung dengan rumus lama, sehingga dana yang cair ke penjual akan kurang. Kiriman belum dikirim ke Mengantar dan tidak dapat dikonfirmasi: buat kiriman baru dengan data yang sama, lalu estimasi ulang.";
    const confirmButton = /<button[^>]*>Konfirmasi dan terbitkan AWB<\/button>/;
    fixture.status = "ESTIMATED";
    const current = await renderDetail();
    expect(current).not.toContain(retiredMessage);

    fixture.codFormulaRetired = true;
    const retired = await renderDetail();
    expect(retired).toContain('id="cod-formula-retired"');
    expect(retired).toContain(retiredMessage);
    expect(retired).toContain('href="/app/pengiriman/baru"');
    expect(confirmButton.exec(retired)?.[0]).toContain("disabled");
    // No service can be picked, so no current-formula breakdown can appear.
    // T-205: the service fieldset is matched by its legend, not its layout classes
    // (the choice became radio cards; the class list changed with it).
    const serviceFieldset = /<fieldset[^>]*>(?=<legend[^>]*>Layanan Mengantar yang tersimpan)/;
    expect(serviceFieldset.exec(retired)?.[0]).toContain('disabled=""');
    expect(serviceFieldset.exec(current)?.[0]).toBeDefined();
    expect(serviceFieldset.exec(current)?.[0]).not.toContain("disabled");

    // The dev-only scenario reaches the same state on any seeded shipment.
    fixture.codFormulaRetired = false;
    fixture.status = "DRAFT";
    vi.stubEnv("NODE_ENV", "development");
    fixture.auditHeader = "shipment-detail-cod-formula-retired";
    const scenario = await renderDetail();
    expect(scenario).toContain(retiredMessage);
    expect(confirmButton.exec(scenario)?.[0]).toContain("disabled");
  });

  it.each([
    ["DRAFT", "Lanjutkan draf"],
    ["ESTIMATED", "Pilih layanan dan konfirmasi"],
    ["SUBMISSION_QUEUED", "Tidak ada tindakan manual"],
    ["SUBMISSION_UNKNOWN", "Jangan kirim ulang"],
    ["ISSUED", "Buka label dan riwayat cetak"],
    ["AWAITING_UPSTREAM_PAYMENT", "Pulihkan pembayaran"],
    ["FAILED", "Buat draf baru"],
  ] as const)("renders the %s lifecycle with its truthful next job", async (status, expected) => {
    fixture.status = status;
    const html = await renderDetail();

    expect(html).toContain('id="shipment-detail-heading"');
    expect(html).toContain("Riwayat status");
    expect(html).toContain("Status saat ini");
    expect(html).toContain(expected);
    expect(html).toContain("Diperbarui");
  });

  it("keeps unpaid recovery absent for Operator", async () => {
    fixture.role = "OPERATOR";
    fixture.status = "AWAITING_UPSTREAM_PAYMENT";
    const html = await renderDetail();

    expect(html).toContain("minta Tenant Admin menjalankan pemulihan");
    expect(html).not.toContain('id="pemulihan-pembayaran"');
  });

  it("keeps a PAYING recovery check absent for Operator", async () => {
    fixture.role = "OPERATOR";
    fixture.status = "AWAITING_UPSTREAM_PAYMENT";
    fixture.recoveryStatus = "PAYING";
    const html = await renderDetail();

    expect(html).toContain("Pembayaran perlu direkonsiliasi");
    expect(html).not.toContain('id="periksa-upaya-tersendat"');
    expect(html).not.toContain('id="pemulihan-pembayaran"');
  });

  it.each(["PAYING", "PAYMENT_UNKNOWN"] as const)(
    "removes the unpaid retry form when recovery is %s",
    async (recoveryStatus) => {
      fixture.status = "AWAITING_UPSTREAM_PAYMENT";
      fixture.recoveryStatus = recoveryStatus;
      const html = await renderDetail();

      expect(html).toContain("Pembayaran perlu direkonsiliasi");
      expect(html).toContain("Jangan jalankan pemulihan ulang");
      expect(html).not.toContain('id="pemulihan-pembayaran"');
      expect(html).not.toContain("Pulihkan pembayaran");
      if (recoveryStatus === "PAYING") {
        expect(html).toContain('id="periksa-upaya-tersendat"');
        expect(html).toContain("tidak mengulang pengiriman atau pembayaran");
      }
    },
  );

  it("exposes only the safe local-state check for a refreshed submitting order", async () => {
    fixture.status = "SUBMISSION_QUEUED";
    fixture.batchStatus = "SUBMITTING";
    const html = await renderDetail();

    expect(html).toContain('id="periksa-upaya-tersendat"');
    expect(html).toContain("Tidak ada permintaan baru yang dikirim ke penyedia");
    expect(html).not.toContain("Konfirmasi dan terbitkan AWB");
  });

  it("keeps unknown reconciliation absent for Operator without exposing a retry action", async () => {
    fixture.role = "OPERATOR";
    fixture.status = "SUBMISSION_UNKNOWN";
    const html = await renderDetail();

    expect(html).toContain("minta Tenant Admin menjalankan rekonsiliasi");
    expect(html).not.toContain('id="rekonsiliasi-pengiriman"');
    expect(html).not.toContain("Konfirmasi dan terbitkan AWB");
  });

  // T-151 / PR-45 detail pattern: status, resi and label entry, and every
  // recovery action sit on the rail; data and history stay in the main column.
  it.each([
    ["ISSUED", "NONE", 'href="/app/label/10039"'],
    ["AWAITING_UPSTREAM_PAYMENT", "NONE", 'id="pemulihan-pembayaran"'],
    ["SUBMISSION_UNKNOWN", "NONE", 'id="rekonsiliasi-pengiriman"'],
    ["SUBMISSION_QUEUED", "SUBMITTING", 'id="periksa-upaya-tersendat"'],
  ] as const)("puts the %s action on the detail rail and keeps the data in the main column", async (status, batchStatus, action) => {
    fixture.status = status;
    if (batchStatus !== "NONE") fixture.batchStatus = batchStatus;
    const html = await renderDetail();
    const aside = /<aside[^>]*aria-label="Status kiriman"[\s\S]*?<\/aside>/.exec(html)?.[0] ?? "";
    const main = html.replace(aside, "");

    expect(aside).toContain(action);
    expect(main).not.toContain(action);
    expect(aside).toContain('id="status-lifecycle-heading"');
    // T-206 (owner reference detail-kiriman.html): "Resi dan label" leads the main column;
    // the label link itself stays the rail's one "Tindakan berikutnya" action (V-23).
    expect(aside).not.toContain('id="riwayat-label-heading"');
    for (const data of ['id="riwayat-label-heading"', 'id="konteks-heading"', 'id="snapshot-pihak-heading"', 'id="hasil-penyedia-heading"']) {
      expect(main).toContain(data);
      expect(aside).not.toContain(data);
    }
  });

  // T-202: V-6 provider values in Indonesian, V-5 service display name, V-23 one label
  // link, V-10 rail first below the split, V-11 no nested rail scroll.
  it("renders provider results in Indonesian with one label link and a page-scrolled rail", async () => {
    fixture.status = "ISSUED";
    fixture.batchStatus = "COMPLETED";
    const html = await renderDetail();
    const aside = /<aside[^>]*aria-label="Status kiriman"[\s\S]*?<\/aside>/.exec(html)?.[0] ?? "";
    const text = html.replace(/<[^>]+>/g, " ");

    expect(text).toContain("Resi terbit");
    expect(text).toContain("Selesai");
    expect(text).toContain("JNE Reg");
    for (const raw of [">ISSUED<", ">COMPLETED<", "ORDER_ACCEPTED", "JNE · JNE REG"]) expect(html).not.toContain(raw);
    expect(html.match(/href="\/app\/label\/10039"/g)).toHaveLength(1);
    // T-206: the resi card shows the courier logo (decorative beside the service name) and a copy action.
    const resiCard = /<div[^>]*aria-labelledby="riwayat-label-heading"[\s\S]*?id="konteks-heading"/.exec(html)?.[0] ?? "";
    expect(resiCard).toMatch(/<span aria-hidden="true"[^>]*><img[^>]*src="\/couriers\/jne.svg"/);
    expect(resiCard).toContain("Salin nomor resi");
    expect(resiCard).not.toContain('href="/app/label/');
    const asideTag = /<aside[^>]*>/.exec(aside)?.[0] ?? "";
    // V-10: the rail leads in the DOM (focus and reading order), not only visually.
    expect(html.indexOf('aria-label="Status kiriman"')).toBeLessThan(html.indexOf('id="hasil-penyedia-heading"'));
    expect(asideTag).not.toContain("order-first");
    expect(asideTag).toContain("@4xl/page:static");
    expect(asideTag).toContain("@4xl/page:overflow-visible");
    expect(asideTag).not.toContain("@4xl/page:sticky");
  });

  it("rejects malformed detail identifiers before repository data can render", async () => {
    await expect(renderDetail("not-a-uuid")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("gives queue and detail loading/error states distinct geometry and stable retry focus", () => {
    const reset = vi.fn();
    const error = new Error("sanitized");
    const queueError = renderToStaticMarkup(createElement(ShipmentQueueError, { error, reset }));
    const detailError = renderToStaticMarkup(createElement(ShipmentDetailError, { error, reset }));
    const queueLoading = renderToStaticMarkup(createElement(ShipmentQueueLoading));
    const detailLoading = renderToStaticMarkup(createElement(ShipmentDetailLoading));

    expect(queueError).toContain('id="shipment-queue-error-heading"');
    expect(detailError).toContain('id="shipment-detail-error-heading"');
    expect(queueError).toContain('aria-live="polite"');
    expect(detailError).toContain('aria-live="polite"');
    expect(queueLoading).toContain("Memuat filter dan histori kiriman"); // V-7: the page is "Histori kiriman"
    expect(detailLoading).toContain("Memuat status dan konteks kiriman");
    expect(queueLoading).not.toContain("Memuat status dan konteks kiriman");
  });
});
