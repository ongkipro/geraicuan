import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Building2, Store, Truck, UsersRound } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { DataTableFacetFilter } from "@/components/cms/data-table-facet-filter";
import { DataTablePagination, getPageNumbers } from "@/components/cms/data-table-pagination";
import { DataTableToolbar } from "@/components/cms/data-table-toolbar";
import { ContentSection, SettingsCard, SettingsLayout } from "@/components/cms/settings-layout";
import { StatCard } from "@/components/cms/stat-card";
import { DataTableShell } from "@/components/cms/data-table-shell";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

// Radix mounts popover content only while open, and static rendering cannot
// open it. Render the content inline so the option markup can be inspected;
// the trigger and cmdk list are the real components.
vi.mock("@/components/ui/popover", async () => {
  const { Fragment, createElement: h } = await import("react");
  const pass = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return { Popover: pass, PopoverContent: pass, PopoverTrigger: pass };
});

// Behaviour of the T-118 shared primitives, read from rendered markup through
// attributes a screen reader or the browser acts on — not from class names.
const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

/** Attributes of every element whose opening tag matches `tag` and contains `marker`. */
function tagsWith(html: string, tag: string, marker: string) {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "g"))].map((m) => m[0]).filter((t) => t.includes(marker));
}

describe("Table scroll semantics", () => {
  const body = createElement(TableBody, null, createElement(TableRow, null, createElement(TableCell, null, "Complete reference")));

  it("keeps the accessible name, description and focus on the actual scroll region", () => {
    const html = render(createElement(Table, {
      containerProps: { role: "region", tabIndex: 0, "aria-label": "Shipment queue", "aria-describedby": "queue-help" },
    }, body));
    const [region] = tagsWith(html, "div", 'role="region"');
    expect(region).toContain('data-slot="table-container"');
    expect(region).toContain('aria-label="Shipment queue"');
    expect(region).toContain('aria-describedby="queue-help"');
    expect(region).toContain('tabindex="0"');
    // Width is unknown during SSR, so no misleading hint or dangling description.
    expect(tagsWith(html, "p", "hidden")).toHaveLength(1);
    expect(html).toContain("Complete reference");
  });

  it("retains one measured scroll owner when a plain Table is inside DataTableShell", () => {
    const html = render(DataTableShell({ label: "Supporting rows", children: createElement(Table, null, body) }));
    expect(tagsWith(html, "div", 'role="region"')).toHaveLength(1);
    expect(tagsWith(html, "div", 'data-slot="table-scroll-shell"')).toHaveLength(1);
    expect(tagsWith(html, "table", 'data-slot="table"')).toHaveLength(1);
  });
});

describe("StatCard", () => {
  it("is one link named 'title: value' when it has a destination", () => {
    const html = render(createElement(StatCard, {
      description: "bukan pendapatan",
      href: "/app/keuangan",
      icon: Truck,
      title: "COD dalam proses",
      value: "Rp 1.250.000",
    }));
    const links = tagsWith(html, "a", "href=");
    expect(links).toHaveLength(1);
    expect(links[0]).toContain('href="/app/keuangan"');
    expect(links[0]).toContain('aria-label="COD dalam proses: Rp 1.250.000"');
    // The disclosure stays reachable: the link is described by it.
    const describedBy = links[0].match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toMatch(new RegExp(`id="${describedBy}"[^>]*>bukan pendapatan<`));
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("names a linked card by its rendered title and value when the value is markup without valueLabel", () => {
    const html = render(createElement(StatCard, {
      href: "/app/pengiriman",
      title: "Kiriman dibuat",
      value: createElement("span", null, "1.204", createElement("small", null, " kiriman")),
    }));
    const [link] = tagsWith(html, "a", "href=");
    expect(link).not.toContain("aria-label=");
    const ids = link.match(/aria-labelledby="([^"]+)"/)?.[1].split(" ") ?? [];
    expect(ids).toHaveLength(2);
    const text = (id: string) => html.match(new RegExp(`id="${id}"[^>]*>(.*?)</div>`))?.[1].replace(/<[^>]+>/g, "");
    expect(text(ids[0])).toBe("Kiriman dibuat");
    expect(text(ids[1])).toBe("1.204 kiriman");
  });

  it("prefers valueLabel for a markup value and speaks a numeric value", () => {
    const labelled = tagsWith(render(createElement(StatCard, {
      href: "/app/keuangan",
      title: "COD dalam proses",
      value: createElement("span", null, "Rp 2,4 jt"),
      valueLabel: "Rp 2,4 juta",
    })), "a", "href=")[0];
    expect(labelled).toContain('aria-label="COD dalam proses: Rp 2,4 juta"');
    expect(labelled).not.toContain("aria-labelledby=");
    const numeric = tagsWith(render(createElement(StatCard, { href: "/app", title: "Retur", value: 0 })), "a", "href=")[0];
    expect(numeric).toContain('aria-label="Retur: 0"');
  });

  it("is not a link without a destination", () => {
    const html = render(createElement(StatCard, { title: "Kiriman dibuat", value: "42" }));
    expect(html).not.toContain("<a");
    expect(html).toContain("Kiriman dibuat");
    expect(html).toContain("42");
  });
});

describe("DataTablePagination", () => {
  const hrefForPage = (page: number) => {
    if (page < 1 || page > 12) throw new Error(`asked for page ${page}`);
    return `/app/pengiriman?page=${page}`;
  };

  it("marks the current page and renders first/previous as disabled non-links on page 1", () => {
    const html = render(createElement(DataTablePagination, { hrefForPage, page: 1, totalCount: 290, totalPages: 12 }));
    expect(html).toContain("Halaman 1 dari 12");

    const current = tagsWith(html, "a", 'aria-current="page"');
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/app/pengiriman?page=1"');

    for (const label of ["Halaman pertama", "Halaman sebelumnya"]) {
      expect(tagsWith(html, "a", `aria-label="${label}"`), label).toHaveLength(0);
      const button = tagsWith(html, "button", `aria-label="${label}"`);
      expect(button, label).toHaveLength(1);
      expect(button[0]).toMatch(/\sdisabled(=""|\s|>)/);
    }
    expect(tagsWith(html, "a", 'aria-label="Halaman berikutnya"')[0]).toContain("page=2");
    expect(tagsWith(html, "a", 'aria-label="Halaman terakhir"')[0]).toContain("page=12");
  });

  it("disables next/last on the final page", () => {
    const html = render(createElement(DataTablePagination, { hrefForPage, page: 12, totalCount: 290, totalPages: 12 }));
    for (const label of ["Halaman berikutnya", "Halaman terakhir"]) {
      expect(tagsWith(html, "a", `aria-label="${label}"`), label).toHaveLength(0);
      expect(tagsWith(html, "button", `aria-label="${label}"`)[0]).toMatch(/\sdisabled(=""|\s|>)/);
    }
  });

  it("elides distant pages but keeps first, last, and neighbours", () => {
    expect(getPageNumbers(1, 4)).toEqual([1, 2, 3, 4]);
    expect(getPageNumbers(6, 12)).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 12]);
    expect(getPageNumbers(1, 12)).toEqual([1, 2, 3, 4, "ellipsis", 12]);
    expect(getPageNumbers(12, 12)).toEqual([1, "ellipsis", 9, 10, 11, 12]);
  });
});

describe("DataTableToolbar", () => {
  const facets = (selected: boolean) => [{
    options: [
      { count: 3, href: "/app/pengiriman?status=draft", label: "Draf", selected },
      { count: 9, href: "/app/pengiriman?status=issued", label: "Resi terbit" },
    ],
    title: "Status",
  }];
  const search = { hiddenParams: { status: "draft", page: undefined }, label: "Cari kiriman", name: "q" };

  it("shows Reset only when a search or facet is active", () => {
    const resetLink = (html: string) => tagsWith(html, "a", 'href="/app/pengiriman"');

    const idle = render(createElement(DataTableToolbar, { facets: facets(false), resetHref: "/app/pengiriman", search }));
    expect(resetLink(idle)).toHaveLength(0);

    const faceted = render(createElement(DataTableToolbar, { facets: facets(true), resetHref: "/app/pengiriman", search }));
    expect(resetLink(faceted)).toHaveLength(1);
    expect(faceted).toContain("Reset");

    const searched = render(createElement(DataTableToolbar, {
      facets: facets(false), resetHref: "/app/pengiriman", search: { ...search, defaultValue: "JNE" },
    }));
    expect(resetLink(searched)).toHaveLength(1);
  });

  it("submits search as a labelled GET form that preserves the other params", () => {
    const html = render(createElement(DataTableToolbar, { search }));
    expect(tagsWith(html, "form", 'method="get"')).toHaveLength(1);
    const input = tagsWith(html, "input", 'name="q"')[0];
    const id = input.match(/id="([^"]+)"/)?.[1];
    expect(html).toContain(`<label class="sr-only" for="${id}">Cari kiriman</label>`);
    expect(tagsWith(html, "input", 'type="hidden"')).toEqual([expect.stringContaining('name="status"')]);
    expect(html).not.toContain('name="page"');
  });
});

describe("DataTableFacetFilter", () => {
  const html = render(createElement(DataTableFacetFilter, {
    clearHref: "/app/pengiriman",
    options: [
      { count: 3, href: "/app/pengiriman?status=draft", label: "Draf", selected: true },
      { count: 1200, href: "/app/pengiriman?status=issued", label: "Resi terbit" },
    ],
    title: "Status",
  }));
  const options = [...html.matchAll(/<div\b[^>]*role="option"[^>]*>([\s\S]*?)<\/div>/g)];

  it("renders each option as one interactive element with no focusable descendant", () => {
    // axe nested-interactive: a link inside role="option" is a second Tab stop.
    expect(options.length).toBe(3);
    for (const [, inner] of options) {
      expect(inner).not.toMatch(/<(?:a|button|input|select|textarea)\b|tabindex=/);
    }
    expect(html).not.toContain("<a");
  });

  it("exposes the chosen option programmatically and keeps its count", () => {
    const tag = (label: string) => options.find(([, inner]) => inner.includes(label))?.[0] ?? "";
    expect(tag("Draf")).toMatch(/aria-checked="true"/);
    expect(tag("Resi terbit")).toMatch(/aria-checked="false"/);
    expect(tag("Resi terbit")).toContain("1.200");
    expect(tag("Hapus filter")).toBeTruthy();
    // The trigger names the active selection for screen readers.
    expect(html).toMatch(/<button[^>]*aria-label="Status: Draf"/);
  });
});

describe("SettingsLayout", () => {
  const items = [
    { description: "Nama toko dan format.", href: "/app/pengaturan", icon: Store, label: "Profil toko" },
    { description: "Kesiapan outlet.", href: "/app/pengaturan/outlet", icon: Building2, label: "Outlet" },
    { description: "Peran akses anggota.", href: "/app/anggota", icon: UsersRound, label: "Anggota & akses" },
  ];

  function renderLayout(currentHref: string) {
    return render(createElement(SettingsLayout, {
      currentHref,
      indexHref: "/app/pengaturan",
      items,
      title: "Pengaturan",
    }, createElement(ContentSection, { id: "outlet", title: "Outlet" }, "Form")));
  }

  it("lists the menu in order with one line of description and a chevron per row", () => {
    const html = renderLayout("/app/pengaturan");
    const menu = html.match(/<nav aria-label="Menu pengaturan"[\s\S]*?<\/nav>/)?.[0] ?? "";

    expect(menu).toBeTruthy();
    const order = [...menu.matchAll(/href="([^"]+)"/g)].map(([, href]) => href);
    expect(order).toEqual(items.map(({ href }) => href));
    for (const { description, label } of items) {
      expect(menu).toContain(label.replace(/&/g, "&amp;"));
      expect(menu).toContain(description);
    }
    // One chevron per row: the mobile index rows are tappable destinations.
    expect(menu.split("lucide-chevron-right").length - 1).toBe(items.length);
  });

  it("marks only the current navigation item", () => {
    const html = renderLayout("/app/pengaturan");

    // "true", not "page": the shell sidebar owns the page-level current item.
    expect(html).not.toContain('aria-current="page"');
    const current = tagsWith(html, "a", 'aria-current="true"');
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/app/pengaturan"');
    expect(tagsWith(html, "a", 'href="/app/anggota"')[0]).not.toContain("aria-current");
    expect(html).toContain('<nav aria-label="Menu pengaturan"');
    expect(html).toMatch(/<h1[^>]*>Pengaturan<\/h1>/);
    expect(html).toMatch(/<section aria-labelledby="outlet"[^>]*>.*<h3[^>]*id="outlet"[^>]*>Outlet<\/h3>/);
  });

  it("marks a subpage item current and carries a back link to the settings index", () => {
    const html = renderLayout("/app/pengaturan/outlet");

    const current = tagsWith(html, "a", 'aria-current="true"');
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/app/pengaturan/outlet"');
    // The back link lives outside the menu nav, so it is not a second menu row.
    const menu = html.match(/<nav aria-label="Menu pengaturan"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const backLinks = tagsWith(html, "a", 'aria-label="Kembali ke Pengaturan"');
    expect(backLinks.every((tag) => tag.includes('href="/app/pengaturan"'))).toBe(true);
    expect(backLinks.some((tag) => menu.includes(tag))).toBe(false);
    expect(backLinks).toHaveLength(1);
    expect(backLinks[0]).toContain("lg:hidden");
  });

  it("shows the whole menu, and no back link, on the settings index", () => {
    const html = renderLayout("/app/pengaturan");
    const menu = html.match(/<nav aria-label="Menu pengaturan"[\s\S]*?<\/nav>/)?.[0] ?? "";

    expect(tagsWith(html, "a", 'aria-label="Kembali ke Pengaturan"')).toHaveLength(0);
    expect(menu).toContain('href="/app/pengaturan"');
    // Below lg the index IS the menu; a subpage hides it behind the back link.
    expect(html.match(/<aside[^>]*>/)?.[0]).not.toContain("max-lg:hidden");
    expect(renderLayout("/app/pengaturan/outlet").match(/<aside[^>]*>/)?.[0])
      .toContain("max-lg:hidden");
  });
});

describe("SettingsCard", () => {
  it("renders title, description, badge, body, and footer actions", () => {
    const html = render(createElement(SettingsCard, {
      badge: "Terkunci",
      description: "Satu baris penjelasan.",
      footer: createElement("button", { type: "button" }, "Simpan"),
      id: "card-title",
      title: "Judul kartu",
    }, "Isi kartu"));

    expect(html).toMatch(/<h2[^>]*id="card-title"[^>]*>Judul kartu<\/h2>/);
    expect(html).toContain("Satu baris penjelasan.");
    expect(html).toContain("Isi kartu");
    expect(html).toContain("Terkunci");
    const footer = html.match(/<div[^>]*data-slot="card-footer"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(footer).toContain("Simpan");
    expect(footer).toContain("justify-end");
  });

  it("omits the footer divider when a card has no actions", () => {
    const html = render(createElement(SettingsCard, { title: "Tanpa aksi" }, "Isi"));
    expect(html).not.toContain('data-slot="card-footer"');
  });
});
