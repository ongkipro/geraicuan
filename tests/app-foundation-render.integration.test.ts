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

function renderSidebar(scope: Parameters<typeof AppSidebar>[0]["scope"], pathname: string, search = "") {
  route.pathname = pathname;
  route.search = search;
  const html = renderToStaticMarkup(
    createElement(TooltipProvider, null,
      createElement(SidebarProvider, null, createElement(AppSidebar, { account, scope }))),
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
      "Dasbor", "Buat kiriman", "Histori kiriman", "Retur (RTS)", "Cetak resi",
      "Pengirim", "Penerima", "Cek resi", "Cek tarif",
    ]);
    expect(links.every((link) => link.hasIcon)).toBe(true);
    expect(links.filter((link) => link.current).map((link) => link.label)).toEqual(["Buat kiriman"]);
    // Group labels as in the reference; Dasbor sits alone without its "Utama" label.
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

  it("renders the platform menu with the tenant list current on a tenant detail", () => {
    const { html, links } = renderSidebar({ kind: "platform" }, "/platform/tenant/3b4f");
    expect(links.map((link) => link.label)).toEqual(["Ringkasan", "Tenant", "Pendaftaran", "Audit"]);
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
});
