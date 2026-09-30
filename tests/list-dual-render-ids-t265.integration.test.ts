import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * T-265 (critique 2026-09-29 #3, P1 harden): Cetak resi, Histori and Retur render every row twice —
 * a desktop table and a phone card list, one hidden by CSS. An id repeated across the two made the
 * phone card's <label for> resolve to the hidden table checkbox, leaving the visible one unnamed.
 * The real pages render here on canned repository rows (no database, no Mengantar call); the
 * rendered markup must hold no duplicate id, and every checkbox must carry a name naming its resi.
 */

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
  usePathname: () => "/app/label",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: async (_db: unknown, _user: string, tenantId: string, run: (tx: unknown, context: unknown) => unknown) =>
    run({}, { role: "OPERATOR", tenantId }),
}));
vi.mock("@/app/app/pengiriman/_list/tenant-page", () => ({
  requireTenantPrincipal: async () => ({ role: "OPERATOR", scope: "tenant", tenantId: "t265", tenantStatus: "ACTIVE", userId: "u265" }),
}));
vi.mock("@/app/app/pengiriman/status-sync-actions", () => ({ pullMengantarStatus: vi.fn() }));
vi.mock("@/db/tenant-settings-repository", () => ({ loadTenantBrand: async () => ({ defaultLabelSize: "10x15" }) }));
vi.mock("@/db/tenant-repository", () => ({ listTenantOutlets: async () => [] }));
vi.mock("@/db/provider-settlement-repository", () => ({
  loadProviderDeliveryStatusBasis: async () => ({ lastObservedAt: null, observationVisible: false }),
}));

const issuedAt = new Date("2026-09-26T03:00:00.000Z");
const rows = [10178, 10177, 10175].map((number, index) => ({
  awb: `AWB265${number}`,
  courier: "JNE",
  createdAt: issuedAt,
  declaredValueIdr: 100_000,
  destinationAreaLabel: "Kebon Kacang, Tanah Abang, Kota Jakarta Pusat, DKI Jakarta, 10240",
  isCod: index !== 2,
  issuedAt,
  latestEventAt: null,
  latestEventNotes: null,
  outletName: "Gudang",
  packageContent: "Kain",
  packageWeightGrams: 1_000,
  paymentMethod: index === 2 ? "NON_COD" : "COD",
  printCount: index,
  providerCodAmountIdr: index === 2 ? null : 125_000,
  providerService: "JNE REG",
  publicReference: `GC-${number}`,
  recipientName: `Penerima ${number}`,
  recipientPhone: "081200000000",
  returnAwb: null,
  shipmentId: `00000000-0000-4000-8265-0000000${number}`,
  status: "ISSUED",
  updatedAt: issuedAt,
}));

vi.mock("@/db/label-print-repository", () => ({
  loadLabelIndexPage: async () => ({ rows, summary: { "LBL-ALL": 3, "LBL-CANCELLED": 0, "LBL-PRINTED": 2, "LBL-UNPRINTED": 1 } }),
}));
vi.mock("@/db/shipment-queue-repository", async () => {
  const { SHIPMENT_QUEUE_SUMMARY_ENTRIES } = await import("@/lib/shipment-queue");
  return {
    loadShipmentQueuePage: async () => ({
      generatedAt: issuedAt,
      page: 1,
      pageSize: 20,
      rows,
      status: "ALL",
      summary: Object.fromEntries(SHIPMENT_QUEUE_SUMMARY_ENTRIES.map((entry) => [entry.metricId, 3])),
      totalCount: 3,
      totalPages: 1,
    }),
  };
});
vi.mock("@/db/rts-repository", () => ({
  loadRtsShipmentsPage: async () => ({
    basis: { lastObservedAt: null, observationVisible: false },
    generatedAt: issuedAt,
    page: 1,
    pageSize: 20,
    rows: rows.map((row) => ({ ...row, status: "RTS_QUEUED" })),
    status: "ALL",
    summary: { inTransitCount: 0, problemCount: 0, queuedCount: 3, receivedCount: 0, totalRtsCount: 3 },
    totalCount: 3,
    totalPages: 1,
  }),
}));

const { default: LabelIndexPage } = await import("@/app/app/label/page");
const { default: ShipmentHistoryPage } = await import("@/app/app/pengiriman/page");
const { default: RtsPage } = await import("@/app/app/pengiriman/rts/page");

async function render(page: (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>, searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await page({ searchParams: Promise.resolve(searchParams) }));
}

function duplicateIds(html: string) {
  const seen = new Map<string, number>();
  for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) seen.set(id, (seen.get(id) ?? 0) + 1);
  return [...seen].filter(([, count]) => count > 1).map(([id]) => id);
}

/** Every `role="checkbox"` with the name its label or aria-label gives it. */
function checkboxNames(html: string) {
  const labels = new Map([...html.matchAll(/<label[^>]*\sfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)].map(([, id, inner]) => [
    id,
    inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
  ]));
  return [...html.matchAll(/<button[^>]*role="checkbox"[^>]*>/g)].map(([tag]) => {
    const id = /\sid="([^"]+)"/.exec(tag)?.[1] ?? "";
    return /\saria-label="([^"]+)"/.exec(tag)?.[1] ?? labels.get(id) ?? "";
  });
}

describe("dual-rendered lists (table + phone cards) carry unique ids", () => {
  it("Cetak resi: no duplicate id, and every row checkbox in both layouts names its resi", async () => {
    const html = await render(LabelIndexPage, { cetak: "semua" });
    expect(duplicateIds(html)).toEqual([]);
    const names = checkboxNames(html);
    // Two select-all boxes (table header, phone list head) + one per row in each layout.
    expect(names).toHaveLength(2 + rows.length * 2);
    expect(names.filter((name) => name === "")).toEqual([]);
    for (const row of rows) {
      expect(names).toContain(`Pilih resi ${row.awb}`);
      expect(names).toContain(`Pilih untuk cetak resi ${row.awb}`);
    }
    // The phone label points at the phone checkbox, never at the hidden table copy.
    expect(html).toContain('for="pilih-kartu-10178"');
    expect(html).toMatch(/<button(?=[^>]*role="checkbox")(?=[^>]*id="pilih-kartu-10178")/);
    expect(html).toMatch(/<button(?=[^>]*role="checkbox")(?=[^>]*id="pilih-tabel-10178")/);
  });

  it("Histori kiriman and Retur: no duplicate id", async () => {
    expect(duplicateIds(await render(ShipmentHistoryPage))).toEqual([]);
    expect(duplicateIds(await render(RtsPage))).toEqual([]);
  });
});
