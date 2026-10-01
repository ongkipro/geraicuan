import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * T-266 (critique 2026-09-29 #4, adapt): Cetak resi at 390 × 844 — the print control becomes a
 * bottom selection bar below 1024px while resi are chosen, rows are dense with the selection as a
 * 44px leading column, and "Pilih semua belum dicetak (N)" reaches past the page. The real page
 * renders here on canned repository rows (no database, no Mengantar call).
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
  requireTenantPrincipal: async () => ({ role: "OPERATOR", scope: "tenant", tenantId: "t266", tenantStatus: "ACTIVE", userId: "u266" }),
}));
vi.mock("@/db/tenant-settings-repository", () => ({ loadTenantBrand: async () => ({ defaultLabelSize: "10x15" }) }));

const issuedAt = new Date("2026-09-26T03:00:00.000Z");
const summary = vi.hoisted(() => ({ current: { "LBL-ALL": 3, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 0, "LBL-PRINTED": 1, "LBL-UNPRINTED": 2 } }));
const rows = [10178, 10177, 10175].map((number, index) => ({
  awb: `AWB266${number}`,
  courier: "JNE",
  destinationAreaLabel: "Kebon Kacang, Tanah Abang, Kota Jakarta Pusat, DKI Jakarta, 10240",
  isCod: index !== 2,
  issuedAt,
  printCount: index === 1 ? 1 : 0,
  providerCodAmountIdr: index === 2 ? null : 125_000,
  providerService: "JNE REG",
  publicReference: `GC-${number}`,
  recipientName: `Penerima ${number}`,
  shipmentId: `00000000-0000-4000-8266-0000000${number}`,
  status: "ISSUED",
}));
vi.mock("@/db/label-print-repository", () => ({
  loadLabelIndexPage: async () => ({ rows, summary: summary.current }),
}));
// T-274: the day line reads its own counts.
vi.mock("@/app/app/label/label-day-summary", () => ({ loadLabelDaySummary: async () => ({ "LBL-HANDED-OVER-TODAY": 0, "LBL-PRINTED-TODAY": 0, "LBL-READY-PENDING": 0 }) }));

const { default: LabelIndexPage } = await import("@/app/app/label/page");
const { selectionBarClassName } = await import("@/app/app/label/batch-selection");

async function render(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await (LabelIndexPage as (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>)({ searchParams: Promise.resolve(searchParams) }));
}

const classes = (value: string) => new Set(value.split(/\s+/));

describe("selection bar", () => {
  it("is pinned to the bottom below 1024px only while resi are chosen, with the safe-area inset, never printed", () => {
    const open = classes(selectionBarClassName(3));
    for (const token of ["max-lg:fixed", "max-lg:inset-x-0", "max-lg:bottom-0", "max-lg:z-40", "max-lg:pb-[max(--spacing(3),env(safe-area-inset-bottom))]", "print:hidden"]) {
      expect(open, token).toContain(token);
    }
    // Desktop keeps the in-flow toolbar: nothing is fixed from 1024px.
    expect([...open].filter((token) => /^(lg:|fixed$)/.test(token))).toEqual([]);
    const closed = classes(selectionBarClassName(0));
    expect(closed).toContain("max-lg:hidden");
    expect(closed).toContain("print:hidden");
    expect([...closed].some((token) => token.includes("fixed"))).toBe(false);
  });

  it("renders closed with nothing chosen: no bar region, no spacer, the desktop hint in the one toolbar element", async () => {
    const html = await render({ cetak: "semua" });
    const bars = [...html.matchAll(/<div[^>]*data-slot="selection-bar"[^>]*>/g)].map(([tag]) => tag);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toContain('data-state="closed"');
    expect(bars[0]).not.toContain('role="region"');
    expect(bars[0]).toContain("max-lg:hidden");
    expect(html).not.toContain('data-slot="selection-bar-spacer"');
    expect(html).toContain("Pilih resi untuk cetak massal");
    // One print trigger on the page (the bar is the toolbar element restyled, not a copy).
    expect(html.match(/Cetak terpilih/g)).toHaveLength(1);
    // The list region takes focus after "Batal pilih".
    expect(html).toMatch(/<div[^>]*id="daftar-resi"[^>]*tabindex="-1"/);
  });
});

describe("dense phone rows", () => {
  it("keeps resi, recipient + area, courier logo and print state, with the selection as the 44px leading column", async () => {
    const html = await render({ cetak: "semua" });
    const items = [...html.matchAll(/<li class="([^"]*)" data-slot="record-item">([\s\S]*?)<\/li>/g)];
    expect(items).toHaveLength(rows.length);
    for (const [index, [, className, inner]] of items.entries()) {
      const row = rows[index];
      expect(className).toContain("relative");
      expect(inner).toContain(`>${row.awb}<`);
      expect(inner).toContain(row.recipientName);
      expect(inner).toContain("Tanah Abang");
      expect(inner).toMatch(/<img [^>]*src="\/couriers\/jne\.svg"/);
      expect(inner).toMatch(row.printCount ? /1× dicetak/ : /Belum dicetak/);
      // Dense rhythm: py-2 / gap-0.5, one-line subtitle, no separate "Pilih untuk cetak" line.
      expect(inner).toMatch(/class="grid min-w-0 flex-1 grid-cols-\[minmax\(0,1fr\)\] gap-0\.5 py-2"/);
      expect(inner).toMatch(/<p class="text-sm text-foreground truncate">/);
      expect(inner).not.toContain('data-slot="record-detail"');
      // The leading column: 44px wide, above the stretched card link, whole column is the label.
      expect(inner).toMatch(/<div class="relative z-10 flex w-11 shrink-0 self-stretch" data-slot="record-leading">/);
      expect(inner).toMatch(new RegExp(`<label class="absolute inset-0 cursor-pointer" for="pilih-kartu-${row.publicReference.slice(3)}">`));
      // The whole card is still the link (T-263).
      expect(inner).toMatch(/<a [^>]*after:inset-0[^>]*data-slot="record-link"[^>]*href="\/app\/label\/\d+"/);
    }
    // Unique ids across the table + card render; every checkbox named (T-265).
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});

describe("Pilih semua belum dicetak", () => {
  it("shows the true unprinted count on Semua, once per layout, beside Pilih semua di halaman ini", async () => {
    summary.current = { "LBL-ALL": 40, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 0, "LBL-PRINTED": 3, "LBL-UNPRINTED": 37 };
    const html = await render({ cetak: "semua" });
    expect(html.match(/Pilih semua belum dicetak <span class="tabular-nums" data-metric-id="LBL-UNPRINTED">\(37\)<\/span>/g)).toHaveLength(2);
    expect(html).toContain("Pilih semua di halaman ini");
  });

  it("on Belum dicetak only when the queue is longer than the page; never on Siap diserahkan", async () => {
    summary.current = { "LBL-ALL": 3, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 0, "LBL-PRINTED": 1, "LBL-UNPRINTED": 2 };
    expect(await render()).not.toContain("Pilih semua belum dicetak");
    summary.current = { "LBL-ALL": 30, "LBL-CANCELLED": 0, "LBL-HANDED-OVER": 0, "LBL-PRINTED": 1, "LBL-UNPRINTED": 29 };
    expect(await render()).toContain("Pilih semua belum dicetak");
    expect(await render({ cetak: "sudah" })).not.toContain("Pilih semua belum dicetak");
  });
});
