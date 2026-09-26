import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T-210 (UI v3 foundation): render checks for the shared shell and display components. No
 * database; `next/navigation` is replaced so the sidebar can be rendered at any route.
 */

const route = vi.hoisted(() => ({ pathname: "/app", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: () => undefined }),
  useSearchParams: () => new URLSearchParams(route.search),
}));

const { AppSidebar } = await import("@/components/app/app-sidebar");
const { SidebarProvider } = await import("@/components/ui/sidebar");
const { TooltipProvider } = await import("@/components/ui/tooltip");
const { StatusBadge } = await import("@/components/app/status-badge");
const { Money, formatIdr } = await import("@/components/app/money");
const { RecordItem, RecordList } = await import("@/components/app/record-list");

const account = { email: "wulan@example.test", name: "Wulan Sekarsari" };

function renderSidebar(
  scope: Parameters<typeof AppSidebar>[0]["scope"],
  pathname: string,
  search = "",
  badges?: Parameters<typeof AppSidebar>[0]["badges"],
) {
  route.pathname = pathname;
  route.search = search;
  const html = renderToStaticMarkup(
    createElement(TooltipProvider, null,
      createElement(SidebarProvider, null, createElement(AppSidebar, { account, badges, scope }))),
  );
  const nav = html.slice(html.indexOf('<nav aria-label="Menu utama"'), html.indexOf("</nav>"));
  const links = [...nav.matchAll(/<a([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, body]) => ({
    current: attributes.includes('aria-current="page"'),
    hasIcon: body.includes("<svg"),
    href: attributes.match(/href="([^"]+)"/)?.[1],
    label: body.replace(/<[^>]+>/g, "").trim(),
  }));
  return { html, links, nav };
}

describe("AppSidebar", () => {
  beforeEach(() => {
    route.pathname = "/app";
    route.search = "";
  });

  it("shows an operator only the operator menu, one icon per item, with the create page current", () => {
    const { html, links, nav } = renderSidebar({ kind: "tenant", role: "OPERATOR" }, "/app/pengiriman/baru");
    expect(links.map((link) => link.label)).toEqual([
      "Info terbaru", "Dasbor", "Buat kiriman", "Histori kiriman", "Retur (RTS)", "Cetak resi",
      "Pengirim", "Penerima", "Cek resi", "Cek tarif",
    ]);
    expect(links.every((link) => link.hasIcon)).toBe(true);
    expect(links.filter((link) => link.current).map((link) => link.label)).toEqual(["Buat kiriman"]);
    // Group labels as in the reference; Info terbaru and Dasbor sit alone without their "Utama" label.
    for (const label of ["Pengiriman", "Data", "Cek"]) expect(nav).toContain(`>${label}</div>`);
    expect(nav).not.toContain(">Utama<");
    expect(nav).not.toContain(">Laporan<");
    // The account row, and no member-management entry point for an operator.
    expect(html).toContain("Wulan Sekarsari");
    expect(html).toContain("wulan@example.test");
    // v3.2 (D-18): brand and role moved to the primary top bar; the sidebar holds only the menu.
    expect(html).not.toContain(">GeraiCUAN<");
  });

  it("gives a Tenant Admin the reports and settings, and marks Pengaturan current on member management", () => {
    const { links } = renderSidebar({ kind: "tenant", role: "TENANT_ADMIN" }, "/app/anggota");
    expect(links.map((link) => link.label)).toEqual(expect.arrayContaining([
      "Laporan pengiriman", "Riwayat cetak resi", "Pengaturan",
    ]));
    expect(links.filter((link) => link.current).map((link) => link.label)).toEqual(["Pengaturan"]);
  });

  it("resolves a contact detail to the menu it was opened from", () => {
    const { links } = renderSidebar({ kind: "tenant", role: "OPERATOR" }, "/app/kontak/abc", "dari=penerima");
    expect(links.filter((link) => link.current).map((link) => link.label)).toEqual(["Penerima"]);
  });

  it("shows the Info terbaru unread count as a badge only while it is above zero (T-244)", () => {
    const withUnread = renderSidebar({ kind: "tenant", role: "OPERATOR" }, "/app", "", { announcements: 3 });
    expect(withUnread.html).toMatch(/data-testid="nav-badge-announcements"[^>]*>3</);
    expect(withUnread.links[0]).toMatchObject({ href: "/app/info", label: "Info terbaru, 3 belum dibaca" });
    expect(renderSidebar({ kind: "tenant", role: "OPERATOR" }, "/app", "", { announcements: 150 }).html)
      .toMatch(/data-testid="nav-badge-announcements"[^>]*>99\+</);
    const read = renderSidebar({ kind: "tenant", role: "OPERATOR" }, "/app", "", { announcements: 0 });
    expect(read.html).not.toContain("nav-badge-announcements");
    expect(read.links[0]?.label).toBe("Info terbaru");
  });

  it("renders the platform menu with the tenant list current on a tenant detail", () => {
    const { html, links } = renderSidebar({ kind: "platform" }, "/platform/tenant/3b4f");
    expect(links.map((link) => link.label)).toEqual(["Ringkasan", "Gerai", "Pendaftaran", "Audit", "Info terbaru"]);
    expect(links.filter((link) => link.current).map((link) => link.href)).toEqual(["/platform/tenant"]);
    expect(html).toContain('data-active="true"');
  });
});

describe("StatusBadge", () => {
  it.each([
    ["success", "Terkirim", "text-ok"],
    ["warning", "Antre retur", "text-warn"],
    ["danger", "Gagal", "text-danger"],
    ["neutral", "Draf", "text-muted-foreground"],
  ] as const)("renders %s as an icon plus the word", (tone, label, textClass) => {
    const html = renderToStaticMarkup(createElement(StatusBadge, { label, tone }));
    expect(html).toContain(`data-tone="${tone}"`);
    expect(html).toContain(textClass);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html.replace(/<[^>]+>/g, "")).toBe(label);
  });
});

describe("Money", () => {
  it("formats rupiah without decimals in id-ID grouping", () => {
    expect(formatIdr(1_250_000)).toBe("Rp 1.250.000");
    expect(formatIdr(0)).toBe("Rp 0");
    expect(renderToStaticMarkup(createElement(Money, { amount: 15_000 }))).toContain("Rp 15.000");
  });

  it("shows a missing amount as a dash, never as Rp 0", () => {
    const html = renderToStaticMarkup(createElement(Money, { amount: null }));
    expect(html).toContain(">—<");
    expect(html).not.toContain("Rp");
  });
});

describe("RecordList", () => {
  function list(count: number) {
    const items: ReactNode[] = Array.from({ length: count }, (_, index) =>
      createElement(RecordItem, { href: `/app/pengiriman/${index}`, key: index, title: `GC-${10000 + index}` }));
    return renderToStaticMarkup(createElement(RecordList, { label: "Kiriman" } as Parameters<typeof RecordList>[0], ...items));
  }

  it("shows ten records and puts the rest behind one disclosure", () => {
    const html = list(12);
    const [first, rest] = html.split("<details");
    expect(first.match(/data-slot="record-item"/g)).toHaveLength(10);
    expect(rest).toContain("Tampilkan 2 lainnya");
    expect(rest.match(/data-slot="record-item"/g)).toHaveLength(2);
    expect(html).toContain('href="/app/pengiriman/11"');
  });

  it("has no disclosure for ten records or fewer", () => {
    const html = list(10);
    expect(html).not.toContain("<details");
    expect(html.match(/data-slot="record-item"/g)).toHaveLength(10);
  });
});

// T-228 (spec 10 v3.2, D-18): the Mengantar look lives in the shared shell and components.
describe("Mengantar look (v3.2)", () => {
  it("paints the top bar primary, and the focused bar keeps only the brand and a close link", async () => {
    const { SiteHeader } = await import("@/components/app/site-header");
    const header = (focused: boolean) => renderToStaticMarkup(
      createElement(SidebarProvider, null,
        createElement(SiteHeader, { focused, roleLabel: "Operator", scope: { kind: "tenant", role: "OPERATOR" }, subtitle: "Data tenant", title: "Gerai" })),
    );
    const normal = header(false);
    expect(normal).toMatch(/<header class="[^"]*\bbg-primary\b[^"]*"[^>]*data-slot="site-header"/);
    expect(normal).toContain("Cari halaman");
    const focused = header(true);
    expect(focused).toContain('href="/app/pengiriman"');
    expect(focused).toContain('aria-label="Tutup, kembali ke Histori kiriman"');
    expect(focused).not.toContain("Cari halaman");
  });

  it("drops the eyebrow and sets the 32px H1", async () => {
    const { PageHeader } = await import("@/components/app/page-header");
    const html = renderToStaticMarkup(createElement(PageHeader, { eyebrow: "Pengiriman", title: "Histori kiriman" }));
    expect(html).not.toContain("Pengiriman<");
    expect(html).toMatch(/<h1 class="[^"]*text-h1/);
  });

  it("renders cards borderless with the card shadow", async () => {
    const { Card } = await import("@/components/ui/card");
    const html = renderToStaticMarkup(createElement(Card, null, "x"));
    expect(html).toContain("rounded-2xl");
    expect(html).toContain("shadow-card");
    expect(html).not.toMatch(/class="[^"]*\bborder\b/);
  });

  it("tints status tiles by meaning, from the tone or the shipment status key", async () => {
    const { StatusTiles } = await import("@/components/app/status-tiles");
    const html = renderToStaticMarkup(createElement(StatusTiles, {
      label: "Ringkasan",
      total: 6,
      tiles: [
        { count: 1, href: "/a", key: "ALL", label: "Semua", selected: true },
        { count: 2, href: "/b", key: "RTS_QUEUED", label: "Antre retur", selected: false },
        { count: 3, href: "/c", key: "QUE-ATTENTION", label: "Perlu perhatian", selected: false, tone: "danger" },
      ],
    }));
    expect([...html.matchAll(/data-tone="(\w+)"/g)].map((match) => match[1])).toEqual(["neutral", "warning", "danger"]);
    expect(html).toContain("bg-tile-warn");
    expect(html.match(/ring-2 ring-primary/g)).toHaveLength(1);
  });

  // T-246: at 1024px six columns left a 68px label ("Dalam …", "Perlu p…"), and Dibatalkan
  // wore the "Semua" stack icon. Labels wrap on shared row tracks; icons follow spec 10 §4.12.
  it("never truncates a tile label, sizes columns by tile count and uses the status icon", async () => {
    const { StatusTiles } = await import("@/components/app/status-tiles");
    const tile = (key: string, label: string) => ({ count: 1, href: `/${key}`, key, label, selected: false });
    const six = renderToStaticMarkup(createElement(StatusTiles, {
      label: "Ringkasan",
      total: 6,
      tiles: ["ALL", "ISSUED", "IN_TRANSIT", "DELIVERED", "CANCELLED", "PROBLEM"].map((key) => tile(key, key)),
    }));
    expect(six).not.toContain("truncate");
    expect(six).toContain("xl:grid-cols-6");
    expect(six).not.toMatch(/\blg:grid-cols-6\b/);
    expect(six).toContain("grid-rows-subgrid");
    expect(six).toContain("lucide-ban");
    expect(six).toContain("lucide-package-check");
    const four = renderToStaticMarkup(createElement(StatusTiles, { label: "R", tiles: ["A", "B", "C", "D"].map((key) => tile(key, key)), total: 4 }));
    expect(four).toContain("md:grid-cols-4");
  });

  // T-247 (review L9): the share is of the page's stated base (spec 19 *-SHARE), never the
  // largest count, and Cetak resi's base includes the cancelled resi Semua resi excludes.
  it("takes each tile's share of the explicit base the page passes", async () => {
    const { StatusTiles, tileShare } = await import("@/components/app/status-tiles");
    const { labelTileShareBase } = await import("@/app/app/label/label-query");
    const shares = (html: string) => [...html.matchAll(/>(\d+)%</g)].map((match) => Number(match[1]));
    const tile = (key: string, count: number) => ({ count, href: `/${key}`, key, label: key, selected: false });
    // Two of ten shipments, three of ten: 20 % and 30 %, not 67 % and 100 % of the larger tile.
    expect(shares(renderToStaticMarkup(createElement(StatusTiles, { label: "R", tiles: [tile("A", 2), tile("B", 3)], total: 10 }))))
      .toEqual([20, 30]);
    expect(tileShare(5, 0)).toBe(0);

    // Cetak resi: 1 still printable, 3 cancelled since issuance.
    const summary = { "LBL-ALL": 1, "LBL-CANCELLED": 3, "LBL-PRINTED": 0, "LBL-UNPRINTED": 1 };
    const base = labelTileShareBase(summary);
    expect(base).toBe(4);
    const label = [tile("LBL-ALL", 1), tile("LBL-UNPRINTED", 1), tile("LBL-PRINTED", 0), tile("LBL-CANCELLED", 3)];
    const rendered = shares(renderToStaticMarkup(createElement(StatusTiles, { label: "Cetak", tiles: label, total: base })));
    expect(rendered).toEqual([25, 25, 0, 75]);
    expect(Math.max(...rendered)).toBeLessThanOrEqual(100);

    // Each displayed share has its metric ID, and each page states its base.
    const { readFileSync } = await import("node:fs");
    const spec = readFileSync("docs/spec/19-METRICS-ANALYTICS-CONTRACT.md", "utf8");
    for (const id of ["QUE-SHARE", "RTS-SHARE", "LBL-SHARE"]) expect(spec).toMatch(new RegExp(`^\\| ${id} \\|`, "m"));
    expect(readFileSync("src/app/app/pengiriman/page.tsx", "utf8")).toContain('total={data.summary["QUE-ALL"]}');
    expect(readFileSync("src/app/app/pengiriman/rts/page.tsx", "utf8")).toContain("total={data.summary.totalRtsCount}");
    expect(readFileSync("src/app/app/label/page.tsx", "utf8")).toContain("total={labelTileShareBase(data.summary)}");
  });
});
