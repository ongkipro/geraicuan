import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * T-274 (critique 2026-09-30T19-21-59Z P2 #6, P2 #9, P3 #12): the operator's phone path. Cetak resi —
 * the queue switch (one tap, URL state, aria-current), the day line, the period note instead of
 * the explainer paragraph. Buat kiriman — the sender fold, the phone example hint, the stepper
 * below 360px and the one-row action bar on short viewports. Canned rows; no database.
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
  requireTenantPrincipal: async () => ({ role: "OPERATOR", scope: "tenant", tenantId: "t274", tenantStatus: "ACTIVE", userId: "u274" }),
}));
vi.mock("@/db/tenant-settings-repository", () => ({ loadTenantBrand: async () => ({ defaultLabelSize: "10x15" }) }));
const state = vi.hoisted(() => ({
  day: { "LBL-HANDED-OVER-TODAY": 2, "LBL-PRINTED-TODAY": 3, "LBL-READY-PENDING": 1 },
  summary: { "LBL-ALL": 9, "LBL-CANCELLED": 1, "LBL-HANDED-OVER": 2, "LBL-PRINTED": 4, "LBL-READY-PENDING": 1, "LBL-READY-TODAY": 3, "LBL-UNPRINTED": 12 },
}));
vi.mock("@/db/label-print-repository", () => ({ loadLabelIndexPage: async () => ({ rows: [], summary: state.summary }) }));
vi.mock("@/app/app/label/label-day-summary", () => ({ loadLabelDaySummary: async () => state.day }));

const { default: LabelIndexPage } = await import("@/app/app/label/page");
const flow = await import("@/app/app/pengiriman/baru/flow-parts");
const { ShipmentCreateForm } = await import("@/app/app/pengiriman/baru/shipment-create-form");
const { MobileActionBar } = await import("@/app/app/pengiriman/baru/summary-rail");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();

async function render(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await (LabelIndexPage as (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>)({ searchParams: Promise.resolve(searchParams) }));
}

function queueSwitch(html: string) {
  const match = /<nav aria-label="Antrean cetak resi" class="([^"]*)" data-slot="queue-switch">([\s\S]*?)<\/nav>/.exec(html);
  expect(match, "queue switch").not.toBeNull();
  return { className: match![1], links: [...match![2].matchAll(/<a([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, inner]) => ({ attributes, text: text(inner) })) };
}

describe("Cetak resi on phones: the queue switch", () => {
  it("links the three queues with their counts, keeps the URL state and marks the current one", async () => {
    const belum = queueSwitch(await render({ q: "123", rentang: "7-hari" }));
    expect(belum.className).toContain("md:hidden");
    expect(belum.links.map((link) => link.text)).toEqual(["Belum dicetak 12", "Siap diserahkan 4", "Diserahkan 2"]);
    expect(belum.links.map((link) => /href="([^"]*)"/.exec(link.attributes)![1].replaceAll("&amp;", "&"))).toEqual([
      "/app/label?rentang=7-hari&tz=Asia%2FJakarta&q=123",
      "/app/label?rentang=7-hari&tz=Asia%2FJakarta&q=123&cetak=sudah",
      "/app/label?rentang=7-hari&tz=Asia%2FJakarta&q=123&cetak=diserahkan",
    ]);
    expect(belum.links.map((link) => link.attributes.includes('aria-current="page"'))).toEqual([true, false, false]);
    expect(belum.links.every((link) => /min-h-11/.test(link.attributes))).toBe(true);
    const sudah = queueSwitch(await render({ cetak: "sudah" }));
    expect(sudah.links.map((link) => link.attributes.includes('aria-current="page"'))).toEqual([false, true, false]);
    // A history tab (Semua resi, Dibatalkan) lives in the Filter sheet: no queue is current.
    const semua = queueSwitch(await render({ cetak: "semua" }));
    expect(semua.links.some((link) => link.attributes.includes("aria-current"))).toBe(false);
  });

  it("drops the explainer paragraph: the period note is one line beside the period, on the queue tabs only", async () => {
    for (const cetak of ["belum", "sudah", "diserahkan"]) {
      const html = await render({ cetak });
      expect(html, cetak).not.toContain("memuat semua paket");
      expect(html.match(/data-slot="queue-period-note"/g), cetak).toHaveLength(1);
      expect(html).toMatch(/<p class="flex items-center gap-1.5 text-xs text-muted-foreground" data-slot="queue-period-note"><svg[^>]*>[\s\S]*?<\/svg>Periode hanya berlaku untuk Semua resi dan Dibatalkan.<\/p>/);
    }
    for (const cetak of ["semua", "batal"]) expect(await render({ cetak }), cetak).not.toContain('data-slot="queue-period-note"');
  });

  it("the mobile summary line no longer repeats the queue the switch names", async () => {
    expect(text(/data-slot="filter-summary"[^>]*>([\s\S]*?)<\/p>/.exec(await render())![1])).toBe("Semua tanggal Tampilkan semua resi");
    expect(text(/data-slot="filter-summary"[^>]*>([\s\S]*?)<\/p>/.exec(await render({ cetak: "batal" }))![1])).toMatch(/^Dibatalkan · 30 hari terakhir/);
  });
});

describe("Cetak resi: the day line (both roles, every tab)", () => {
  it("reads Hari ini: n dicetak · n diserahkan · n tertunda from the day summary, each number with its metric ID", async () => {
    for (const cetak of ["belum", "semua", "sudah", "batal"]) {
      const html = await render({ cetak });
      const line = /<p class="[^"]*" data-slot="day-summary">([\s\S]*?)<\/p>/.exec(html);
      expect(line, cetak).not.toBeNull();
      expect(text(line![1])).toBe("Hari ini: 3 dicetak · 2 diserahkan · 1 tertunda");
      expect(line![1]).toMatch(/data-metric-id="LBL-PRINTED-TODAY">3</);
      expect(line![1]).toMatch(/data-metric-id="LBL-HANDED-OVER-TODAY">2</);
      expect(line![1]).toMatch(/<a class="[^"]*text-warn[^"]*" href="\/app\/label\?rentang=30-hari&amp;tz=Asia%2FJakarta&amp;cetak=sudah"><b[^>]*data-metric-id="LBL-READY-PENDING">1<\/b>/);
    }
  });

  it("with nothing pending, tertunda is plain text; the closing state takes LBL-HANDED-OVER-TODAY from the same summary", async () => {
    state.day = { "LBL-HANDED-OVER-TODAY": 5, "LBL-PRINTED-TODAY": 5, "LBL-READY-PENDING": 0 };
    state.summary = { ...state.summary, "LBL-PRINTED": 0, "LBL-READY-PENDING": 0, "LBL-READY-TODAY": 0 };
    const html = await render({ cetak: "sudah" });
    const line = /data-slot="day-summary">([\s\S]*?)<\/p>/.exec(html)![1];
    expect(line).not.toContain("<a ");
    expect(text(line)).toBe("Hari ini: 5 dicetak · 5 diserahkan · 0 tertunda");
    expect(html).toContain("Semua paket hari ini sudah diserahkan");
    expect(html).toMatch(/data-metric-id="LBL-HANDED-OVER-TODAY">5<\/span> paket diserahkan hari ini/);
  });
});

const formProps = (phone: string | null) => ({
  gerai: { name: "Gerai Uji", phone },
  nowIso: "2026-09-26T03:00:00.000Z",
  outlets: [{
    id: "00000000-0000-4000-8000-000000000274",
    name: "Outlet Uji",
    pickupPoints: [{ isDefault: true, originAreaLabel: "Coblong, Kota Bandung", pickupAddressId: "P-1", pickupAddressLabel: "Gudang, Jl. Dago 1" }],
  }],
  sellerMoney: false,
  steps: [
    { detail: "a", label: "Isi data", state: "current" as const },
    { detail: "b", label: "Cek tarif", state: "pending" as const },
    { detail: "c", label: "Terbitkan resi", state: "pending" as const },
  ],
  submissionId: "00000000-0000-4000-8000-000000000275",
});

describe("Buat kiriman on phones", () => {
  it("folds the pre-filled gerai sender to one line with Ubah; the block is hidden below 768px only", () => {
    const html = renderToStaticMarkup(createElement(ShipmentCreateForm, formProps("081234567890")));
    const fold = /<div class="([^"]*)" data-slot="sender-fold">([\s\S]*?)<\/div>/.exec(html);
    expect(fold).not.toBeNull();
    expect(fold![1]).toContain("md:hidden");
    expect(text(fold![2])).toBe("Pengirim di label Gerai Uji · 081234567890 Ubah data pengirim");
    expect(fold![2]).toMatch(/<button[^>]*aria-controls="sender-block-body" aria-expanded="false"/);
    expect(/<div class="([^"]*)" id="sender-block-body">/.exec(html)![1]).toContain("max-md:hidden");
    // The recipient name field comes right after the fold and the recipient heading.
    expect(html.indexOf('data-slot="sender-fold"')).toBeLessThan(html.indexOf('id="recipientName"'));
  });

  it("does not fold a sender with a gap (no gerai WhatsApp): the block and its warning stay", () => {
    const html = renderToStaticMarkup(createElement(ShipmentCreateForm, formProps(null)));
    expect(html).not.toContain('data-slot="sender-fold"');
    expect(/<div class="([^"]*)" id="sender-block-body">/.exec(html)![1]).not.toContain("max-md:hidden");
    expect(html).toContain("Lengkapi WhatsApp gerai di Pengaturan");
  });

  it("the phone field looks empty: no placeholder, an example hint in muted text it is described by", () => {
    const html = renderToStaticMarkup(createElement(ShipmentCreateForm, formProps("081234567890")));
    const input = /<input[^>]*id="recipientPhone"[^>]*>/.exec(html)![0];
    expect(input).not.toMatch(/ placeholder="/);
    expect(input).toContain('aria-describedby="recipientPhone-hint"');
    expect(html).toContain('<p class="text-xs text-muted-foreground" id="recipientPhone-hint">Contoh: 0812-3456-7890</p>');
    expect(html).not.toContain('placeholder="08123456789"');
  });

  it("the stepper speaks the current step's label below 360px instead of overlapping the numbers", () => {
    const html = renderToStaticMarkup(createElement(flow.FlowStepper, { steps: formProps(null).steps }));
    const labels = [...html.matchAll(/<span class="(flex min-w-0 flex-col[^"]*)">/g)].map((match) => match[1]);
    expect(labels).toEqual([
      "flex min-w-0 flex-col max-[360px]:sr-only",
      "flex min-w-0 flex-col max-md:sr-only",
      "flex min-w-0 flex-col max-md:sr-only",
    ]);
    expect(html).toMatch(/aria-current="step"/);
  });

  it("a folded section drops its Lengkap badge on phones (the marker and the heading carry it)", () => {
    const card = (collapsed: boolean) => renderToStaticMarkup(createElement(
      flow.SectionCard,
      {
        aside: createElement(flow.SectionStatus, { missing: 0, state: "complete" }),
        collapse: { collapsed, onToggle: () => undefined, summary: "Ringkas" },
        id: "section-handover",
        number: 1,
        state: "complete",
        title: "Penyerahan paket & asal",
      } as Parameters<typeof flow.SectionCard>[0],
      createElement("input", { id: "first" }),
    ));
    expect(card(true)).toMatch(/<div class="flex max-md:hidden"><span[^>]*>.*Lengkap<\/span><\/div>/);
    expect(card(false)).toMatch(/<div class="flex"><span[^>]*>.*Lengkap<\/span><\/div>/);
    expect(card(true)).toMatch(/<span class="sr-only"> \(lengkap\)<\/span>/);
  });

  it("the action bar becomes one row at ≤ 500px tall: caption hidden, icon-only Rincian (named), primary kept", () => {
    const html = renderToStaticMarkup(createElement(MobileActionBar, {
      actions: createElement("button", { type: "submit" }, "Simpan & cek tarif"),
      caption: "Non-COD · tujuan belum dipilih",
      progress: "1/4 bagian lengkap",
      summary: { destination: null, moneyRows: [], origin: null, rows: [], source: "Estimasi", total: { amountIdr: null, label: "Ongkir", note: "Tarif muncul setelah data disimpan" } },
      total: null,
    }));
    const bar = /<div class="([^"]*)" data-slot="mobile-action-bar">/.exec(html)![1];
    for (const token of ["[@media(max-height:500px)]:flex-row", "[@media(max-height:500px)]:pt-2"]) expect(bar).toContain(token);
    expect(html).toMatch(/<span class="\[@media\(max-height:500px\)\]:hidden"> · Non-COD · tujuan belum dipilih<\/span>/);
    expect(html).toMatch(/<svg[^>]*>[\s\S]*?<\/svg><span class="\[@media\(max-height:500px\)\]:sr-only">Rincian<\/span>/);
    expect(html).toContain("Simpan &amp; cek tarif");
  });
});
