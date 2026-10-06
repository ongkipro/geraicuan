import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * T-267 "Tandai sudah diserahkan", rendered: Cetak resi's handover queue (tiles, the handover bar
 * instead of the print bar, the closing moment), the proof stub's "Diserahkan" row, and the
 * words the detail and the attention rule use. Canned repository rows; no database, no Mengantar.
 */

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
  usePathname: () => "/app/label",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => nav.params,
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
  summary: { "LBL-ALL": 0, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 0, "LBL-PRINTED": 0, "LBL-UNPRINTED": 0 } as Record<string, number>,
  today: 0,
}));
vi.mock("@/db/label-print-repository", () => ({
  loadLabelIndexPage: async () => ({ rows: state.rows, summary: state.summary }),
}));
// T-274: LBL-HANDED-OVER-TODAY now comes with the day line (one statement, the list's transaction).
vi.mock("@/app/app/label/label-day-summary", () => ({
  loadLabelDaySummary: async () => ({ "LBL-HANDED-OVER-TODAY": state.today, "LBL-PRINTED-TODAY": 0, "LBL-DAY-PENDING": 0 }),
}));

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
    firstPrintedAt: new Date(),
    handedOverAt: null,
    handoverType: "PICKUP",
    isCod: false,
    issuedAt,
    paymentMethod: "NON_COD",
    printCount: 1,
    printedToday: true,
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
  nav.params = new URLSearchParams(searchParams);
  return renderToStaticMarkup(await (LabelIndexPage as (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>)({ searchParams: Promise.resolve(searchParams) }));
}

describe("Cetak resi: Siap diserahkan is the handover queue", () => {
  it("adds the Diserahkan tile (LBL-HANDED-OVER) between Siap diserahkan and Dibatalkan", async () => {
    state.rows = [];
    state.summary = { "LBL-ALL": 6, "LBL-CANCELLED": 1, "LBL-HANDED-OVER": 2, "LBL-PRINTED": 3, "LBL-UNPRINTED": 1 };
    const html = await render({ cetak: "semua" });
    const strip = html.slice(html.indexOf('aria-label="Ringkasan status cetak resi"'), html.indexOf("</nav>", html.indexOf('aria-label="Ringkasan status cetak resi"')));
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
    // R6-X (critique 2026-09-30T19-21-59Z #8): here a checkbox chooses a parcel to hand over, in both layouts.
    expect(html).toContain('aria-label="Pilih paket AWB26710301 untuk diserahkan"');
    expect(html).toMatch(/for="pilih-kartu-10301"><span class="sr-only">Pilih paket AWB26710301 untuk diserahkan<\/span>/);
    expect(html).not.toContain("Pilih untuk cetak resi");
    // R6-X: the handover result's status container is mounted, empty, before any result.
    expect(html).toContain('<div data-slot="handover-notice" role="status"></div>');
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
    expect(html).toContain('aria-label="Pilih untuk cetak resi AWB26710501"');
    expect(html).not.toContain("untuk diserahkan");
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
    // T-270: the queue has no period, so an empty queue with handovers today is closed whatever
    // period the URL carries — "hari ini" is then true — and never without one today.
    const past = await render({ cetak: "sudah", dari: "2026-09-01", rentang: "kustom", sampai: "2026-09-05" });
    expect(past).toContain("Semua paket hari ini sudah diserahkan");
    state.today = 0;
    const pastNone = await render({ cetak: "sudah", dari: "2026-09-01", rentang: "kustom", sampai: "2026-09-05" });
    expect(pastNone).not.toContain("Semua paket hari ini sudah diserahkan");
    expect(pastNone).toContain("Belum ada paket yang siap diserahkan.");
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

describe("T-270: Siap diserahkan is a state queue, grouped, with scan to select", () => {
  const summary = (extra: Record<string, number> = {}) => ({
    "LBL-ALL": 3, "LBL-CANCELLED": 1, "LBL-HANDED-OVER": 0, "LBL-PRINTED": 3, "LBL-READY-PENDING": 1, "LBL-READY-TODAY": 2, "LBL-UNPRINTED": 0, ...extra,
  });
  const threeDaysAgo = () => new Date(Date.now() - 3 * 24 * 3_600_000);

  it("groups the rows into Hari ini, then Tertunda (warn tone), each header with its LBL-READY-* count", async () => {
    state.rows = [row(10701), row(10702), row(10703, { firstPrintedAt: threeDaysAgo(), printedToday: false })];
    state.summary = summary();
    const html = await render({ cetak: "sudah" });
    const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
    const order = [...table.matchAll(/(Hari ini|Tertunda)|pilih-tabel-(\d+)/g)].map((match) => match[1] ?? match[2]);
    expect(order).toEqual(["Hari ini", "10701", "10702", "Tertunda", "10703"]);
    expect(table).toMatch(/<th[^>]*colSpan="7"|<th[^>]*colspan="7"/);
    expect(table).toMatch(/text-warn[^"]*"><svg[^>]*lucide-clock[\s\S]*?Tertunda<span[^>]*data-metric-id="LBL-READY-PENDING">\(1\)/);
    expect(table).toMatch(/data-metric-id="LBL-READY-TODAY">\(2\)/);
    // Phones: the same two groups, headed, in the same order.
    const cards = html.slice(html.lastIndexOf('<div class="md:hidden">'));
    expect([...cards.matchAll(/<section aria-label="(Hari ini|Tertunda)"/g)].map((match) => match[1])).toEqual(["Hari ini", "Tertunda"]);
  });

  it("shows each parcel's waiting age, in the warn tone once it was printed before today", async () => {
    state.rows = [row(10711, { firstPrintedAt: new Date(Date.now() - 2 * 3_600_000) }), row(10712, { firstPrintedAt: threeDaysAgo(), printedToday: false })];
    state.summary = summary({ "LBL-PRINTED": 2, "LBL-READY-PENDING": 1, "LBL-READY-TODAY": 1 });
    const html = await render({ cetak: "sudah" });
    expect(html).toMatch(/<span class="tabular-nums" data-slot="waiting-age">dicetak <time[^>]*>2 jam lalu<\/time>/);
    expect(html).toMatch(/<span class="tabular-nums font-medium text-warn" data-slot="waiting-age">dicetak <time[^>]*>3 hari lalu<\/time>/);
    // Other tabs keep the issue time, no waiting age.
    state.rows = [row(10713, { printCount: 0 })];
    expect(await render()).not.toContain('data-slot="waiting-age"');
  });

  it("demotes reprint on the handover queue to a quiet named icon action; other tabs keep the labelled button", async () => {
    state.rows = [row(10721)];
    state.summary = summary({ "LBL-PRINTED": 1, "LBL-READY-PENDING": 0, "LBL-READY-TODAY": 1 });
    const queue = await render({ cetak: "sudah" });
    expect(queue).toMatch(/<a[^>]*aria-label="Cetak ulang label AWB26710721"[^>]*>/);
    expect(queue).toMatch(/data-variant="ghost" data-size="icon"[^>]*title="Cetak ulang label AWB26710721"|title="Cetak ulang label AWB26710721"/);
    expect(queue).not.toMatch(/<\/svg>Cetak ulang</);
    const semua = await render({ cetak: "semua" });
    expect(semua).toMatch(/<\/svg>Cetak ulang</);
  });

  it("renders the Scan resi field (visible label, scanner-friendly input) on Siap diserahkan only", async () => {
    state.rows = [row(10731)];
    state.summary = summary({ "LBL-PRINTED": 1, "LBL-READY-PENDING": 0, "LBL-READY-TODAY": 1, "LBL-UNPRINTED": 1 });
    const html = await render({ cetak: "sudah" });
    expect(html.match(/id="scan-resi"/g)).toHaveLength(1);
    expect(html).toMatch(/<label class="text-sm font-semibold" for="scan-resi">Scan resi<\/label>/);
    const input = html.match(/<input[^>]*id="scan-resi"[^>]*>/)![0];
    for (const attribute of ['autoComplete="off"', 'spellCheck="false"', 'maxLength="64"', 'enterKeyHint="done"', 'aria-describedby="scan-resi-bantuan scan-resi-hasil"']) {
      expect(input.toLowerCase()).toContain(attribute.toLowerCase());
    }
    expect(input).not.toMatch(/autofocus/i);
    expect(html).toMatch(/aria-live="polite"[^>]*id="scan-resi-hasil" role="status"/);
    for (const cetak of ["semua", "belum", "diserahkan", "batal"]) {
      expect(await render({ cetak }), cetak).not.toContain('id="scan-resi"');
    }
    // A suffix the list cannot search hides it with the list.
    expect(await render({ cetak: "sudah", q: "!!" })).not.toContain('id="scan-resi"');
  });

  it("says the period governs only Semua resi and Dibatalkan; Dibatalkan shows no share of the queue base", async () => {
    state.rows = [];
    state.summary = summary({ "LBL-CANCELLED": 2, "LBL-PRINTED": 3, "LBL-UNPRINTED": 1 });
    for (const cetak of ["belum", "sudah", "diserahkan"]) {
      expect(await render({ cetak }), cetak).toContain("Periode hanya berlaku untuk Semua resi dan Dibatalkan.");
    }
    const semua = await render({ cetak: "semua" });
    expect(semua).not.toContain('data-slot="queue-period-note"');
    const strip = semua.slice(semua.indexOf('aria-label="Ringkasan status cetak resi"'), semua.indexOf("</nav>", semua.indexOf('aria-label="Ringkasan status cetak resi"')));
    // Base = 1 + 3 + 0 = 4: Belum 25 %, Siap 75 %, Diserahkan 0 %; Dibatalkan none.
    expect([...strip.matchAll(/>(\d+)%</g)].map((match) => Number(match[1]))).toEqual([25, 75, 0]);
    expect(strip).not.toContain('data-segment="LBL-CANCELLED"');
    expect(strip).toContain(", Tidak dapat dicetak, terbit pada periode ini");
  });

  it("empty queues: Belum dicetak without a period sentence, Diserahkan with the Handshake icon", async () => {
    state.rows = [];
    state.summary = summary({ "LBL-PRINTED": 0, "LBL-READY-PENDING": 0, "LBL-READY-TODAY": 0 });
    const belum = await render();
    expect(belum).toContain("Semua resi sudah dicetak.");
    expect(belum).not.toContain("pada periode ini sudah dicetak");
    const diserahkan = await render({ cetak: "diserahkan" });
    const empty = diserahkan.slice(diserahkan.indexOf("Tidak ada paket yang menunggu scan kurir.") - 1200, diserahkan.indexOf("Tidak ada paket yang menunggu scan kurir."));
    expect(empty).toContain("lucide-handshake");
    expect(empty).not.toContain("lucide-printer");
  });

  it("the handover dialog's list names every chosen parcel by resi", async () => {
    const { ChosenResiList } = await import("@/app/app/label/handover-dialog");
    const html = renderToStaticMarkup(createElement(ChosenResiList, { awbs: { 10801: "JNE801", 10802: "JNE802" }, numbers: [10802, 10801, 10803] }));
    expect([...html.matchAll(/<li[^>]*>([^<]+)<\/li>/g)].map((match) => match[1])).toEqual(["JNE802", "JNE801", "Nomor kiriman 10803"]);
    expect(html).toContain('aria-label="Resi terpilih"');
  });
});

describe("proof stub: the Diserahkan row returns only with a recorded handover", () => {
  const label = {
    awb: "JX1234567890",
    chargedShippingIdr: null,
    codBreakdown: null,
    collectBreakdown: null,
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
