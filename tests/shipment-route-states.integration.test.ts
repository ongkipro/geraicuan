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
vi.mock("@/db/cod-totals-repository", () => ({
  calculateCodAmounts: () => ({
    goodsValueIdr: 250_000,
    providerCodAmountIdr: 272_200,
    serviceFeeIdr: 7_800,
    shippingAmountIdr: 14_000,
    vatAmountIdr: 858,
  }),
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
vi.mock("@/db/shipment-queue-repository", () => ({
  loadShipmentQueuePage: vi.fn(async () => ({
    generatedAt,
    page: 1,
    pageSize: 5,
    rows: [
      {
        awb: fixture.awb,
        createdAt: new Date("2026-09-01T01:00:00.000Z"),
        destinationAreaLabel: "Bandung",
        isCod: true,
        outletName: "Gerai utama",
        packageContent: "Paket audit",
        packageWeightGrams: 1_000,
        providerService: null,
        recipientName: "Penerima audit",
        shipmentId,
        publicReference: "95758-260901-039",
        status: "DRAFT",
        updatedAt: new Date("2026-09-01T02:00:00.000Z"),
      },
    ],
    status: "ALL",
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
    publicReference: "95758-260901-039",
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

async function renderDetail(id = shipmentId) {
  return render(await ShipmentDetailPage({ params: Promise.resolve({ shipmentId: id }) }));
}

describe("T-39 shipment queue and lifecycle route states", () => {
  beforeEach(() => {
    fixture.auditHeader = null;
    fixture.awb = null;
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
    expect(awb).toContain("max-w-40");
    expect(awb).toContain("whitespace-normal");
    expect(awb).toMatch(new RegExp(`<span[^>]*class="[^"]*break-all[^"]*"[^>]*>${fixture.awb}</span>`));
    expect(cells.find(cell => cell.includes("Penerima audit"))).toMatch(/class="[^"]*max-w-44[^"]*whitespace-normal/);
    expect(cells.find(cell => cell.includes("Gerai utama"))).toMatch(/class="[^"]*max-w-44[^"]*whitespace-normal/);
  });

  it("renders a URL-addressable shadcn queue with grouped taxonomy, named local scroll, freshness, and pagination", async () => {
    const html = await renderQueue();

    expect(html).toContain('id="shipment-queue-heading"');
    expect(html).toContain("Tampilan antrean");
    expect(html.replace(/<[^>]+>/g, " ")).toContain("95758-260901-039");
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
      "Nomor kiriman", "Status / Pembayaran", "Penerima / Tujuan", "Paket / Outlet", "Layanan / Resi", "Aktivitas terakhir",
    ]);
    for (const value of ["Draf", "COD", "Bandung", "Paket audit", "1 kg", "Gerai utama", "—"]) {
      expect(html, value).toContain(value);
    }
    // Below md the toolbar stacks and the status filter spans the row, so it
    // cannot overlap the freshness control at 390px.
    expect(html).toMatch(/class="[^"]*max-md:flex-col[^"]*"/);
    const trigger = html.match(/<button[^>]*id="status-kiriman"[^>]*>/)?.[0] ?? "";
    expect(trigger).toMatch(/class="(?:[^"]* )?w-full [^"]*md:w-\[13\.5rem\]/);
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
    expect(queueLoading).toContain("Memuat filter dan antrean kiriman");
    expect(detailLoading).toContain("Memuat status dan konteks kiriman");
    expect(queueLoading).not.toContain("Memuat status dan konteks kiriman");
  });
});
