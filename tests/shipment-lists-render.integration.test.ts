import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * T-212 (UI v3): Histori kiriman, Retur, Cetak resi and the label page. URL parsing, the shared
 * cells and the key markup rules (PR-73 pull shows nothing until pressed, PR-74 one freshness
 * line and no meta sentences). No database.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/pengiriman",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

const { ListPagination, pageWindow } = await import("@/app/app/pengiriman/_list/list-pagination");
const { areaText, carrierText, paymentText } = await import("@/app/app/pengiriman/_list/shipment-cells");
const { FreshnessLine } = await import("@/app/app/pengiriman/_list/freshness-line");
const { StatusPull } = await import("@/app/app/pengiriman/_list/status-pull");
const { ListSkeleton } = await import("@/app/app/pengiriman/_list/list-states");
const { parseRtsQuery, rtsHref } = await import("@/app/app/pengiriman/rts/rts-query");
const { labelIndexHref, parseLabelQuery } = await import("@/app/app/label/label-query");
const { printEventOutcome } = await import("@/app/app/label/[shipmentId]/print-event");

const carry = { rentang: "7-hari", tz: "Asia/Jakarta" };

describe("list URL state", () => {
  it("reads the Retur status and page, and keeps the period in every link", () => {
    expect(parseRtsQuery({ page: "2", status: "RTS_QUEUED" })).toEqual({ issues: [], page: 2, status: "RTS_QUEUED" });
    const invalid = parseRtsQuery({ page: "0", status: "DELIVERED" });
    expect(invalid.status).toBe("ALL");
    expect(invalid.page).toBe(1);
    expect(invalid.issues).toHaveLength(2);
    expect(rtsHref("PROBLEM", 3, carry)).toBe("/app/pengiriman/rts?rentang=7-hari&tz=Asia%2FJakarta&status=PROBLEM&page=3");
    expect(rtsHref("ALL")).toBe("/app/pengiriman/rts");
  });

  it("accepts only an AWB suffix as the Cetak resi search, never recipient data", () => {
    expect(parseLabelQuery({ cetak: "belum", q: " 123ABC " })).toEqual({ awbSuffix: "123ABC", awbSuffixError: null, page: 1, printState: "belum" });
    expect(parseLabelQuery({ q: "Budi Santoso" }).awbSuffixError).toMatch(/3–24 huruf atau angka/);
    expect(parseLabelQuery({ cetak: "lain", page: "x" })).toMatchObject({ page: 1, printState: "semua" });
    expect(labelIndexHref({ awbSuffix: "123", page: 2, printState: "sudah" }, carry)).toBe("/app/label?rentang=7-hari&tz=Asia%2FJakarta&q=123&cetak=sudah&page=2");
    expect(labelIndexHref({})).toBe("/app/label");
  });

  it("shows at most five page numbers around the current page", () => {
    expect(pageWindow(1, 2)).toEqual([1, 2]);
    expect(pageWindow(1, 9)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(6, 9)).toEqual([4, 5, 6, 7, 8]);
    expect(pageWindow(9, 9)).toEqual([5, 6, 7, 8, 9]);
  });
});

describe("shared cells", () => {
  it("names the money a courier collects, never the goods value of a Non-COD parcel", () => {
    expect(paymentText({ declaredValueIdr: 150_000, paymentMethod: "NON_COD", providerCodAmountIdr: null })).toBe("Non-COD");
    expect(paymentText({ declaredValueIdr: 100_000, paymentMethod: "COD", providerCodAmountIdr: 119_479 })).toMatch(/^COD · Rp\s?119\.479$/);
    expect(paymentText({ declaredValueIdr: null, paymentMethod: "COD_ONGKIR", providerCodAmountIdr: 35_000 }, " ")).toMatch(/^COD Ongkir Rp\s?35\.000$/);
    expect(paymentText({ declaredValueIdr: null, paymentMethod: "COD", providerCodAmountIdr: null })).toBe("COD");
  });

  it("shows areas as Kecamatan, Kota and couriers by their display name", () => {
    expect(areaText("Panakkukang, PANAKKUKANG, KOTA MAKASSAR, SULAWESI SELATAN, 90231")).toBe("Panakkukang, Kota Makassar");
    expect(carrierText(null)).toBeNull();
    expect(carrierText(null, "JT")).toBe("J&T");
  });

  it("names the guard of a blocked print in the history", () => {
    expect(printEventOutcome({ outcome: "PRINTED", reasonCode: null })).toBe("Tercatat");
    expect(printEventOutcome({ outcome: "BLOCKED", reasonCode: "AWAITING_UPSTREAM_PAYMENT" })).toMatch(/menunggu pelunasan/);
  });
});

describe("list markup", () => {
  it("renders the pull control alone until it is pressed (PR-73)", () => {
    const html = renderToStaticMarkup(createElement(StatusPull, {
      action: async () => ({}),
      attemptId: "00000000-0000-4000-8000-000000000001",
      outlets: [{ id: "00000000-0000-4000-8000-0000000000aa", name: "Gudang" }],
      range: { lastIncludedDate: "2026-09-25", presetId: "30-hari", startDate: "2026-08-27", timezone: "Asia/Jakarta" },
    }));
    expect(html).toContain("Perbarui status dari Mengantar");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="status"');
    expect(html).not.toMatch(/hanya membaca|tidak membuat order/i);
    // One outlet: no select, the outlet travels as a hidden field.
    expect(html).not.toContain("<select");
    expect(html).toContain('name="outletId"');
  });

  it("renders one freshness line with nothing else (PR-74)", () => {
    const html = renderToStaticMarkup(createElement(FreshnessLine, { generatedAtIso: new Date().toISOString(), text: "Diperbarui 25 Sep 2026, 14.40 WIB" }));
    expect(html.match(/data-slot="freshness-line"/g)).toHaveLength(1);
    expect(html).not.toContain("Muat ulang");
  });

  it("paginates with plain links that keep the list state", () => {
    const html = renderToStaticMarkup(createElement(ListPagination, {
      hrefForPage: (page: number) => rtsHref("ALL", page, carry),
      label: "Halaman retur",
      noun: "retur",
      page: 2,
      pageSize: 20,
      totalCount: 45,
      totalPages: 3,
    }));
    expect(html.replace(/<[^>]+>/g, "")).toContain("Menampilkan 21–40 dari 45 retur");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("page=3");
  });

  it("keeps one filled primary in the Histori loading state", () => {
    const html = renderToStaticMarkup(createElement(ListSkeleton, {
      actions: createElement("a", { className: "bg-primary", href: "/app/pengiriman/baru" }, "Buat kiriman"),
      label: "Memuat histori kiriman",
      tiles: 6,
      title: "Histori kiriman",
    }));
    expect(html.match(/bg-primary/g)).toHaveLength(1);
    expect(html).toContain('aria-busy="true"');
  });
});

describe("list sources", () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
  const pages = ["src/app/app/pengiriman/page.tsx", "src/app/app/pengiriman/rts/page.tsx", "src/app/app/label/page.tsx"];

  it("carry no meta sentences, keep tables at seven columns or fewer, and switch to record cards below md", () => {
    for (const file of pages) {
      const source = read(file);
      expect(source, file).not.toMatch(/diperbarui otomatis|diurutkan|geser tabel|geser horizontal|hanya membaca/i);
      expect((source.match(/<TableHead\b/g) ?? []).length, file).toBeLessThanOrEqual(7);
      expect(source, file).toContain('className="hidden md:block"');
      expect(source, file).toContain('className="md:hidden"');
      expect(source, file).toContain("<RecordList");
    }
  });

  it("offers the status pull to Tenant Admins only and renders statuses through the one badge", () => {
    for (const file of pages.slice(0, 2)) {
      const source = read(file);
      expect(source, file).toMatch(/isAdmin \? \(\s*<StatusPull/);
      expect(source, file).toContain('from "@/components/app/status-badge"');
      expect(source, file).toContain("<FreshnessLine");
    }
  });

  it("keeps the label preview the print: the kept sheet inside the print panel", () => {
    const page = read("src/app/app/label/[shipmentId]/page.tsx");
    // T-229: the sheet also carries the gerai's Informasi label choice.
    expect(page).toContain("<LabelSheet fields={fields} label={label} />");
    expect(page).toContain('resolveShipmentRoute(principal, routeKey, "/app/label")');
    const panel = read("src/app/app/label/[shipmentId]/label-print-panel.tsx");
    expect(panel).toContain("recordLabelPrint");
    expect(panel).toContain("LabelPrintContext.Provider");
    expect(panel).toContain("print:[&>.label-sheet]:[zoom:1]");
  });
});
