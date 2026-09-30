import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * T-267 "Tandai sudah diserahkan", rendered: Cetak resi's handover queue (tiles, the handover bar
 * instead of the print bar, the closing moment), the proof stub's "Diserahkan" row, and the
 * words the detail and the attention rule use. Canned repository rows; no database, no Mengantar.
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
  requireTenantPrincipal: async () => ({ role: "OPERATOR", scope: "tenant", tenantId: "t267", tenantStatus: "ACTIVE", userId: "u267" }),
}));
vi.mock("@/db/tenant-settings-repository", () => ({ loadTenantBrand: async () => ({ defaultLabelSize: "10x15" }) }));

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  summary: { "LBL-ALL": 0, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 0, "LBL-PRINTED": 0, "LBL-UNPRINTED": 0 },
  today: 0,
}));
vi.mock("@/db/label-print-repository", () => ({
  loadLabelIndexPage: async () => ({ rows: state.rows, summary: state.summary }),
}));
vi.mock("@/db/shipment-handover-repository", () => ({ countHandedOverToday: async () => state.today }));

const { default: LabelIndexPage } = await import("@/app/app/label/page");
const { LabelPrintContext } = await import("@/app/app/label/[shipmentId]/label-print-context");
const { LabelSheet } = await import("@/app/app/label/[shipmentId]/label-sheet");
const handover = await import("@/lib/shipment-handover");

const issuedAt = new Date("2026-09-29T03:00:00.000Z");
function row(number: number, extra: Record<string, unknown> = {}) {
  return {
    awb: `AWB267${number}`,
    courier: "JNE",
    destinationAreaLabel: "Kebon Kacang, Tanah Abang, Kota Jakarta Pusat, DKI Jakarta, 10240",
    handedOverAt: null,
    handoverType: "PICKUP",
    isCod: false,
    issuedAt,
    paymentMethod: "NON_COD",
    printCount: 1,
    providerCodAmountIdr: null,
    providerService: "JNE REG",
    publicReference: `GC-${number}`,
    recipientName: `Penerima ${number}`,
    shipmentId: `00000000-0000-4000-8267-0000000${number}`,
    status: "ISSUED",
    ...extra,
  };
}

async function render(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await (LabelIndexPage as (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>)({ searchParams: Promise.resolve(searchParams) }));
}

describe("Cetak resi: Siap diserahkan is the handover queue", () => {
  it("adds the Diserahkan tile (LBL-HANDED-OVER) between Siap diserahkan and Dibatalkan", async () => {
    state.rows = [];
    state.summary = { "LBL-ALL": 6, "LBL-CANCELLED": 1, "LBL-HANDED-OVER": 2, "LBL-PRINTED": 3, "LBL-UNPRINTED": 1 };
    const html = await render({ cetak: "semua" });
    const strip = html.slice(html.indexOf('aria-label="Ringkasan status cetak resi"'), html.indexOf("</nav>"));
    const tiles = [...strip.matchAll(/<\/svg>([^<]+)<\/span><span class="flex items-baseline[^"]*"><span[^>]*>(\d+)</g)].map(([, label, count]) => `${label} ${count}`);
    expect(tiles).toEqual(["Semua resi 6", "Belum dicetak 1", "Siap diserahkan 3", "Diserahkan 2", "Dibatalkan 1"]);
    expect(strip).toContain(", Sudah dicetak, belum diserahkan");
    expect(strip).toContain(", Menunggu scan kurir");
    expect(strip).toMatch(/data-tone="info" href="\/app\/label\?[^"]*cetak=diserahkan"/);
    expect(strip).toContain("lucide-handshake");
  });

  it("on Siap diserahkan the one bar action records the handover; printing stays on the rows", async () => {
    state.rows = [row(10301), row(10302, { handoverType: "DROP_OFF" })];
    state.summary = { "LBL-ALL": 2, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 0, "LBL-PRINTED": 2, "LBL-UNPRINTED": 0 };
    const html = await render({ cetak: "sudah" });
    expect(html.match(/data-slot="selection-bar"/g)).toHaveLength(1);
    expect(html).toMatch(/Tandai <span class="max-lg:hidden">sudah <\/span>diserahkan/);
    expect(html).not.toContain("Cetak terpilih");
    expect(html).toContain("Pilih paket yang sudah diterima kurir");
    // The queue fits on the page: no "Pilih semua siap diserahkan"; per-row reprint remains.
    expect(html).not.toContain("Pilih semua siap diserahkan");
    expect(html).toContain("Cetak ulang label AWB26710301");
    expect(html).toContain('id="pilih-kartu-10301"');
  });

  it("offers 'Pilih semua siap diserahkan (N)' once the queue is longer than the page", async () => {
    state.rows = Array.from({ length: 20 }, (_, index) => row(10400 + index));
    state.summary = { "LBL-ALL": 27, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 0, "LBL-PRINTED": 27, "LBL-UNPRINTED": 0 };
    const html = await render({ cetak: "sudah" });
    expect(html.match(/Pilih semua siap diserahkan <span class="tabular-nums" data-metric-id="LBL-PRINTED">\(27\)<\/span>/g)).toHaveLength(2);
  });

  it("other tabs keep the print bar", async () => {
    state.rows = [row(10501, { printCount: 0 })];
    state.summary = { "LBL-ALL": 1, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 0, "LBL-PRINTED": 0, "LBL-UNPRINTED": 1 };
    const html = await render();
    expect(html.match(/Cetak terpilih/g)).toHaveLength(1);
    expect(html).not.toContain("Tandai");
  });

  it("closes the day when Siap diserahkan is empty and parcels were handed over today", async () => {
    state.rows = [];
    state.summary = { "LBL-ALL": 3, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 3, "LBL-PRINTED": 0, "LBL-UNPRINTED": 0 };
    state.today = 3;
    const html = await render({ cetak: "sudah" });
    expect(html).toContain("Semua paket hari ini sudah diserahkan");
    expect(html).toMatch(/<span class="tabular-nums" data-metric-id="LBL-HANDED-OVER-TODAY">3<\/span> paket diserahkan hari ini/);
    expect(html).toMatch(/href="\/app\/label\?[^"]*cetak=diserahkan">Lihat yang diserahkan/);
  });

  it("never celebrates an empty day, nor a filtered empty list", async () => {
    state.rows = [];
    state.summary = { "LBL-ALL": 0, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 0, "LBL-PRINTED": 0, "LBL-UNPRINTED": 0 };
    state.today = 0;
    const empty = await render({ cetak: "sudah" });
    expect(empty).not.toContain("Semua paket hari ini sudah diserahkan");
    expect(empty).toContain("Belum ada paket yang siap diserahkan.");
    state.today = 4;
    const filtered = await render({ cetak: "sudah", q: "ABC123" });
    expect(filtered).not.toContain("Semua paket hari ini sudah diserahkan");
    // A period that ends before today never says "hari ini", even with handovers today.
    const past = await render({ cetak: "sudah", dari: "2026-09-01", rentang: "kustom", sampai: "2026-09-05" });
    expect(past).not.toContain("Semua paket hari ini sudah diserahkan");
    expect(past).toContain("Belum ada paket yang siap diserahkan.");
  });

  it("lists Diserahkan rows with the sub-state and the recorded WIB time, linking to the detail", async () => {
    state.rows = [row(10601, { handedOverAt: new Date("2026-09-30T07:05:00.000Z") })];
    state.summary = { "LBL-ALL": 1, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 1, "LBL-PRINTED": 0, "LBL-UNPRINTED": 0 };
    const html = await render({ cetak: "diserahkan" });
    expect(html).toContain(">Diserahkan</span>");
    expect(html).toContain("30 Sep, 14.05 WIB</time> · menunggu scan kurir");
    expect(html).toContain("diserahkan <time");
    expect(html).toContain('aria-label="Detail kiriman GC-10601"');
    expect(html).toMatch(/data-slot="record-link"[^>]*href="\/app\/pengiriman\/10601"/);
  });
});

describe("proof stub: the Diserahkan row returns only with a recorded handover", () => {
  const label = {
    awb: "JX1234567890",
    chargedShippingIdr: null,
    codBreakdown: null,
    courier: "JNE",
    destinationAreaLabel: "Kebon Kacang, Tanah Abang, Jakarta Pusat, DKI Jakarta, 10240",
    insuranceAmountIdr: null,
    isCod: false,
    issuedAt,
    lastPrintedAt: null,
    outletName: "Outlet Tanah Abang",
    package: { content: "Kain", declaredValueIdr: 100_000, heightCm: null, lengthCm: null, quantity: 1, weightGrams: 1_000, widthCm: null },
    paymentMethod: "NON_COD" as const,
    printCount: 1,
    providerCodAmountIdr: null,
    providerService: "JNE REG",
    publicReference: "GC-10024",
    recipient: { address: "Jl. Kenari 1", landmark: null, name: "Sulastri", phone: "081377772222" },
    sender: { address: "Ruko B7", name: "Toko Jaya", phone: "081255553333" },
    shipmentId: "00000000-0000-4000-8000-000000000267",
    shippingAmountIdr: 9_000,
  };
  const stub = (handedOverAt: Date | null | undefined) => {
    const html = renderToStaticMarkup(createElement(LabelPrintContext.Provider, { value: { size: "10x15" } }, createElement(LabelSheet, { label: { ...label, handedOverAt } })));
    const start = html.indexOf('aria-label="Bukti serah terima pengirim 10 × 5 cm"');
    return html.slice(start, html.indexOf("</section>", start));
  };

  it("prints 'Diserahkan' with the recorded WIB time as the third fact", () => {
    const html = stub(new Date("2026-09-30T07:05:00.000Z"));
    expect([...html.matchAll(/<dt>([^<]*)<\/dt>/g)].map((match) => match[1])).toEqual(["No. kiriman", "Tujuan", "Diserahkan"]);
    expect(html).toContain('<time dateTime="2026-09-30T07:05:00.000Z">30 Sep 2026, 14.05 WIB</time>');
  });

  it("claims no handover time when none is recorded (or it was undone)", () => {
    for (const value of [null, undefined]) {
      const html = stub(value);
      expect([...html.matchAll(/<dt>([^<]*)<\/dt>/g)].map((match) => match[1])).toEqual(["No. kiriman", "Tujuan"]);
      expect(html).not.toContain("Diserahkan");
    }
  });
});

describe("Histori composition: an overdue handover is drawn once", () => {
  it("draws Resi terbit without the overdue parcels, which Perlu perhatian carries, so Lainnya stays exact", async () => {
    const { compositionSegments } = await import("@/components/app/status-tiles");
    const tile = (key: string, count: number, compositionCount?: number) => ({ compositionCount, count, href: "#", key, label: key, selected: false });
    // QUE-ALL 10: Resi terbit 4 (1 of them overdue), Perlu perhatian 3 (2 statuses + the overdue one).
    const segments = compositionSegments([tile("QUE-ALL", 10), tile("QUE-AWAITING-PICKUP", 4, 3), tile("QUE-ATTENTION", 3)], 10);
    expect(segments.map((segment) => `${segment.key}:${segment.count}`)).toEqual(["QUE-AWAITING-PICKUP:3", "QUE-ATTENTION:3", "OTHER:4"]);
    expect(segments.reduce((sum, segment) => sum + segment.count, 0)).toBe(10);
  });
});

describe("handover words and rules", () => {
  it("words the detail line as recorded: WIB time, actor, method", () => {
    const at = new Date("2026-09-30T07:05:00.000Z");
    expect(handover.handoverRecordText({ actorName: "Rina Operator", handedOverAt: at, method: "PICKUP" }))
      .toBe("Diserahkan 30 Sep, 14.05 WIB oleh Rina Operator · dijemput kurir");
    expect(handover.handoverRecordText({ actorName: null, handedOverAt: at, method: "DROP_OFF" }))
      .toBe("Diserahkan 30 Sep, 14.05 WIB oleh anggota gerai · diantar ke outlet");
  });

  it("flags 'Diserahkan, belum discan kurir' at 24 hours with a fixed clock, only while ISSUED", () => {
    const at = new Date("2026-09-29T07:00:00.000Z");
    const now = (iso: string) => new Date(iso);
    expect(handover.handoverOverdue({ handedOverAt: at, status: "ISSUED" }, now("2026-09-30T06:59:59.999Z"))).toBe(false);
    expect(handover.handoverOverdue({ handedOverAt: at, status: "ISSUED" }, now("2026-09-30T07:00:00.000Z"))).toBe(true);
    expect(handover.handoverOverdue({ handedOverAt: at, status: "IN_TRANSIT" }, now("2026-10-02T07:00:00.000Z"))).toBe(false);
    expect(handover.handoverOverdue({ handedOverAt: null, status: "ISSUED" }, now("2026-10-02T07:00:00.000Z"))).toBe(false);
    expect(handover.HANDOVER_ATTENTION_LABEL).toBe("Diserahkan, belum discan kurir");
  });

  it("allows undo only while the shipment is still ISSUED and handed over", () => {
    const at = new Date();
    expect(handover.handoverUndoAllowed({ handedOverAt: at, status: "ISSUED" })).toBe(true);
    for (const status of ["IN_TRANSIT", "DELIVERED", "CANCELLED", "RTS_QUEUED"]) {
      expect(handover.handoverUndoAllowed({ handedOverAt: at, status }), status).toBe(false);
    }
    expect(handover.handoverUndoAllowed({ handedOverAt: null, status: "ISSUED" })).toBe(false);
  });

  it("normalizes the note and refuses more than 160 characters", () => {
    expect(handover.normalizeHandoverNote("  Kurir\tBudi \n JNE ")).toEqual({ note: "Kurir Budi JNE", ok: true });
    expect(handover.normalizeHandoverNote("   ")).toEqual({ note: null, ok: true });
    expect(handover.normalizeHandoverNote(undefined)).toEqual({ note: null, ok: true });
    expect(handover.normalizeHandoverNote("x".repeat(160))).toEqual({ note: "x".repeat(160), ok: true });
    expect(handover.normalizeHandoverNote("x".repeat(161))).toEqual({ ok: false });
    expect(handover.normalizeHandoverNote(42)).toEqual({ ok: false });
  });
});
