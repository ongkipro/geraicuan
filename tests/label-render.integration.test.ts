import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LabelDetailError from "@/app/app/label/[shipmentId]/error";
import LabelDetailLoading from "@/app/app/label/[shipmentId]/loading";
import LabelNotFound from "@/app/app/label/[shipmentId]/not-found";
import LabelDetailPage from "@/app/app/label/[shipmentId]/page";
import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import LabelIndexError from "@/app/app/label/error";
import LabelIndexLoading from "@/app/app/label/loading";
import LabelIndexPage from "@/app/app/label/page";
import type { PrintableLabel, PrintEventRecord } from "@/db/label-print-repository";

const SHIPMENT_ID = "00000000-0000-4000-8000-000000000431";

const repositoryErrors = vi.hoisted(() => ({
  LabelUnavailableError: class LabelUnavailableError extends Error {
    constructor(readonly reason: "AWAITING_UPSTREAM_PAYMENT" | "NOT_FOUND" | "NOT_ISSUED") {
      super("Shipment label is unavailable.");
    }
  },
}));

const mocks = vi.hoisted(() => ({
  detailReason: null as null | "AWAITING_UPSTREAM_PAYMENT" | "NOT_FOUND" | "NOT_ISSUED",
  label: null as PrintableLabel | null,
  events: [] as PrintEventRecord[],
  listCalls: 0,
  rows: [] as Array<{
    awb: string | null;
    courier: string;
    destinationAreaLabel: string;
    isCod: boolean;
    issuedAt: Date | null;
    printCount: number;
    providerCodAmountIdr: number | null;
    providerService: string;
    recipientName: string;
    recipientPhone: string;
    shipmentId: string;
    publicReference: string;
    status: "AWAITING_UPSTREAM_PAYMENT" | "ISSUED";
  }>,
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/db/client", () => ({ db: {} }));

vi.mock("@/db/shipment-number-repository", () => ({
  resolveShipmentRouteKey: vi.fn(async (_tx: unknown, _context: unknown, key: { kind: string; tenantNumber?: number }) =>
    key.kind === "number" && key.tenantNumber === 10431 ? { shipmentId: SHIPMENT_ID, tenantNumber: 10431 } : null),
}));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, userId, tenantId, callback) =>
    callback({}, { role: "OPERATOR", tenantId, userId }),
  ),
}));

vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({
    role: "OPERATOR",
    scope: "tenant",
    tenantId: "00000000-0000-4000-8000-000000000401",
    userId: "label-render-operator",
  })),
}));

vi.mock("@/db/label-print-repository", () => ({
  LabelUnavailableError: repositoryErrors.LabelUnavailableError,
  listPrintEvents: vi.fn(async () => mocks.events),
  listPrintableShipments: vi.fn(async () => {
    mocks.listCalls += 1;
    return mocks.rows;
  }),
  loadLabelIndexPage: vi.fn(async () => {
    mocks.listCalls += 1;
    const printed = mocks.rows.filter((row) => row.printCount > 0).length;
    return {
      rows: mocks.rows,
      summary: {
        "LBL-ALL": mocks.rows.length,
        "LBL-PRINTED": printed,
        "LBL-UNPRINTED": mocks.rows.length - printed,
      },
    };
  }),
  loadPrintableLabel: vi.fn(async () => {
    if (mocks.detailReason) {
      throw new repositoryErrors.LabelUnavailableError(mocks.detailReason);
    }
    if (!mocks.label) throw new Error("Printable label fixture is missing.");
    return mocks.label;
  }),
}));

function printableLabel(overrides: Partial<PrintableLabel> = {}): PrintableLabel {
  return {
    awb: "JNE-LABEL-000431",
    codBreakdown: null,
    courier: "JNE",
    destinationAreaLabel: "Gambir, Jakarta Pusat",
    insuranceAmountIdr: null,
    isCod: false,
    issuedAt: new Date("2026-09-01T01:00:00.000Z"),
    lastPrintedAt: null,
    outletName: "Outlet Label Pusat",
    package: {
      content: "Pakaian",
      declaredValueIdr: 150_000,
      heightCm: 25,
      lengthCm: 40,
      quantity: 1,
      weightGrams: 2_450,
      widthCm: 30,
    },
    printCount: 0,
    providerCodAmountIdr: null,
    providerService: "REG",
    recipient: {
      address: "Jl. Penerima 1",
      name: "Penerima Label",
      phone: "081299998765",
    },
    sender: {
      address: "Jl. Pengirim 2",
      name: "Pengirim Label",
      phone: "081211110000",
    },
    shipmentId: SHIPMENT_ID,
    publicReference: "GC-10431",
    shippingAmountIdr: 8_000,
    ...overrides,
  };
}

async function renderIndex(searchParams: { q?: string | string[]; status?: string | string[] } = {}) {
  const element = await LabelIndexPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

async function renderDetail() {
  const element = await LabelDetailPage({ params: Promise.resolve({ shipmentId: "10431" }) });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  mocks.detailReason = null;
  mocks.label = printableLabel();
  mocks.events.length = 0;
  mocks.listCalls = 0;
  mocks.rows.length = 0;
});

describe("label route render contracts", () => {
  it("owns distinct loading, error, and not-found states with stable focus and recovery", () => {
    const reset = vi.fn();
    const indexLoading = renderToStaticMarkup(createElement(LabelIndexLoading));
    const detailLoading = renderToStaticMarkup(createElement(LabelDetailLoading));
    const indexError = renderToStaticMarkup(createElement(LabelIndexError, { reset }));
    const detailError = renderToStaticMarkup(createElement(LabelDetailError, { reset }));
    const notFound = renderToStaticMarkup(createElement(LabelNotFound));

    expect(indexLoading).toContain('aria-label="Memuat daftar label"');
    expect(detailLoading).toContain('aria-label="Memuat detail label"');
    expect(indexLoading).not.toContain("Memuat detail label");
    expect(indexError).toContain('id="label-index-heading"');
    expect(detailError).toContain('id="label-detail-heading"');
    expect(notFound).toContain('id="label-not-found-heading"');
    for (const html of [indexError, detailError, notFound]) {
      expect(html).toContain('tabindex="-1"');
    }
    expect(indexError).toContain("Coba lagi");
    expect(detailError).toContain('href="/app/label"');
    expect(notFound).toContain('href="/app/label"');
    expect(notFound).toContain('href="/app/pengiriman"');
  });

  it("keeps both status views reachable as plain links when the facet popover cannot run", async () => {
    // T-163: every link on this page now carries the canonical range as well,
    // or following one would silently reset the period back to the default.
    const carried = "rentang=30-hari&amp;tz=Asia%2FJakarta";
    for (const [query, currentHref] of [
      [{}, `/app/label?${carried}&amp;q=123ABC`],
      [{ status: "unpaid" }, `/app/label?${carried}&amp;status=unpaid&amp;q=123ABC`],
    ] as const) {
      const html = await renderIndex({ ...query, q: "123ABC" });
      const fallback = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? "";
      expect(fallback).toMatch(/<nav[^>]*aria-label="Status kiriman"/);
      expect(fallback).toContain(`href="/app/label?${carried}&amp;q=123ABC"`);
      expect(fallback).toContain(`href="/app/label?${carried}&amp;status=unpaid&amp;q=123ABC"`);
      const current = fallback.match(/<a[^>]*aria-current="true"[^>]*>/g) ?? [];
      expect(current).toHaveLength(1);
      expect(current[0]).toContain(`href="${currentHref}"`);
    }
  });

  it("links an invalid AWB suffix to a focused error without querying rows", async () => {
    const html = await renderIndex({ q: "x!" });

    expect(mocks.listCalls).toBe(0);
    expect(html).toContain('id="q-label"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="q-label-help q-label-error"');
    expect(html).toContain('id="q-label-error"');
    expect(html).toContain('href="#q-label"');
    expect(html).toMatch(/href="#q-label"[^>]*class="[^"]*min-h-11[^"]*"/);
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
  });

  it("puts accessibility on the true table scroller and retains a sticky lead and 44px action", async () => {
    mocks.rows.push({
      awb: "JNE-LABEL-000431",
      courier: "JNE",
      destinationAreaLabel: "Gambir, Jakarta Pusat",
      isCod: false,
      issuedAt: new Date("2026-09-01T01:00:00.000Z"),
      printCount: 2,
      providerCodAmountIdr: null,
      providerService: "REG",
      recipientName: "Penerima Label",
      recipientPhone: "081299998765",
      shipmentId: SHIPMENT_ID,
      publicReference: "GC-10431",
      status: "ISSUED",
    });
    const html = await renderIndex();
    const scroller = html.match(/<div data-slot="table-container"[\s\S]*?<table/)?.[0];

    expect(scroller).toContain("overflow-x-auto");
    expect(scroller).toContain('aria-label="Daftar label kiriman; geser horizontal untuk melihat seluruh kolom"');
    expect(scroller).toContain('role="region"');
    expect(scroller).toContain('tabindex="0"');
    expect(html.match(/sticky left-0/g)).toHaveLength(2);
    expect(html).toMatch(/class="[^"]*min-h-11[^"]*" href="\/app\/label\//);
    expect(html).toContain("081299998765");
    expect(html).not.toContain("••••");
    expect(html).toContain("Permintaan cetak");
    expect(html).not.toMatch(/>Cetak<\/th>/);
  });

  it("describes history as recorded print requests rather than physical print results", async () => {
    const emptyHtml = await renderDetail();
    expect(emptyHtml).toContain("Riwayat permintaan cetak");
    expect(emptyHtml).toContain("Permintaan cetak pertama akan tercatat");
    expect(emptyHtml).not.toContain("Cetakan pertama akan tercatat");

    mocks.events.push({
      actorNameMasked: "Operator L•••",
      actorRole: "OPERATOR",
      outcome: "PRINTED",
      printedAt: new Date("2026-09-01T02:00:00.000Z"),
      reasonCode: null,
      sequence: 1,
    });
    const populatedHtml = await renderDetail();
    expect(populatedHtml).toContain("Permintaan ke-");
    expect(populatedHtml).toContain("Riwayat permintaan cetak label");
    expect(populatedHtml).not.toContain("Cetak ke-");
  });

  it.each([
    ["AWAITING_UPSTREAM_PAYMENT", "Menunggu pelunasan Mengantar"],
    ["NOT_ISSUED", "Label belum tersedia"],
  ] as const)("keeps %s blocked with a shipment recovery path and no print control", async (reason, title) => {
    mocks.detailReason = reason;
    const html = await renderDetail();

    expect(html).toContain(title);
    // PR-44: the recovery path uses the canonical per-tenant number, never the UUID.
    expect(html).toContain('href="/app/pengiriman/10431"');
    expect(html).not.toContain(`/app/pengiriman/${SHIPMENT_ID}`);
    expect(html).toContain('href="/app/label"');
    expect(html).not.toContain('class="label-sheet"');
    expect(html).not.toContain('name="attemptId"');
    expect(html).not.toContain("Cetak label");
  });

  it("bounds a long unbroken recipient address in its full disclosure", async () => {
    const address = "A".repeat(500);
    mocks.label = printableLabel({
      recipient: { address, name: "Penerima Label", phone: "081299998765" },
    });
    const html = await renderDetail();
    const disclosure = html.match(new RegExp(`<p class="([^"]+)">${address}</p>`));

    expect(html).toContain("Alamat melebihi kapasitas label");
    expect(disclosure?.[1]).toContain("min-w-0");
    expect(disclosure?.[1]).toMatch(/wrap-anywhere|break-all/);
  });
});

describe("physical LabelSheet contract", () => {
  it("retains one physical sheet with the package label, cut line and sender stub by default", () => {
    const html = renderToStaticMarkup(createElement(LabelSheet, { label: printableLabel() }));

    expect(html.match(/<article/g)).toHaveLength(1);
    expect(html).toMatch(/<article aria-label="Label 10 × 15 cm: label paket dan bukti pengirim" class="label-sheet" data-label-size="10x15">/);
    expect(html.match(/class="label-head"/g)).toHaveLength(1);
    expect(html.match(/class="label-party(?: |")/g)).toHaveLength(2);
    expect(html.match(/class="label-payment"/g)).toHaveLength(1);
    expect(html.match(/class="label-footer"/g)).toHaveLength(1);
    expect(html.match(/class="label-stub"/g)).toHaveLength(1);
    expect(html).toContain("JNE-LABEL-000431");
    expect(html.replace(/<[^>]+>/g, " ")).toContain("GC-10431");
    expect(html.replace(/<[^>]+>/g, " ")).not.toContain(SHIPMENT_ID);
    expect(html).toContain("Penerima Label");
    expect(html).toContain("Pengirim Label");
    expect(html).not.toContain("label-hide");
  });

  it("offers the size choice before printing, defaulting to 10 × 15 cm, and previews that size", async () => {
    const html = await renderDetail();
    const radios = html.match(/<input[^>]*name="label-size"[^>]*>/g) ?? [];

    expect(radios).toHaveLength(2);
    expect(radios.filter((radio) => radio.includes('checked=""'))).toEqual([expect.stringContaining('value="10x15"')]);
    expect(html).toContain("<legend");
    expect(html).toContain("Ukuran label termal");
    expect(html).toMatch(/Cetak label 10 × 15 cm/);
    expect(html).toContain('aria-label="Pratinjau label 10 × 15 cm, sama dengan hasil cetak"');
    // The choice sits before the preview and the print control, and the preview is the sheet itself.
    expect(html.indexOf('name="label-size"')).toBeLessThan(html.indexOf('name="attemptId"'));
    expect(html.indexOf('name="attemptId"')).toBeLessThan(html.indexOf('id="pratinjau-label"'));
    expect(html).toMatch(/id="pratinjau-label"[^>]*>\s*<article[^>]*data-label-size="10x15"/);
    expect(html).not.toContain("Barcode resi tidak dicetak");
  });

  it("warns before printing when the AWB is too long for a barcode", async () => {
    mocks.label = printableLabel({ awb: "A".repeat(30) });
    const html = await renderDetail();

    expect(html).toContain("Barcode resi tidak dicetak");
    expect(html).not.toContain("label-barcode");
  });

  it("describes a recorded print attempt without claiming physical print success", () => {
    const source = readFileSync(
      "src/app/app/label/[shipmentId]/label-print-panel.tsx",
      "utf8",
    );

    expect(source).not.toContain("Dialog cetak browser terbuka");
    expect(source).not.toMatch(/berhasil dicetak/i);
    expect(source).toMatch(/permintaan.*dialog cetak|mencoba membuka dialog cetak/i);
    expect(source).toContain("Permintaan cetak tidak dapat dicatat");
    expect(source).not.toMatch(/<AlertTitle>Cetak tidak dapat dicatat<\/AlertTitle>/);
    expect(source).toContain("Ctrl+P");
  });
});
