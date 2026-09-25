import { readFileSync } from "node:fs";

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CmsShell } from "@/app/_components/cms-shell";

let mockPathname = "/app/kontak/pengirim";
let mockSearch = "";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

// Server render gives the desktop tree (useIsMobile's server snapshot is
// false), so these assertions read the markup the browser first receives.
function renderTenantShell(pathname: string, search = "") {
  mockPathname = pathname;
  mockSearch = search;
  return renderToStaticMarkup(
    createElement(
      CmsShell,
      {
        account: { initials: "DT", label: "Demo Tenant Admin", secondary: "tenant@example.test" },
        destination: "/login/tenant",
        navigationRole: "TENANT_ADMIN",
        roleLabel: "Tenant Admin",
        scope: "tenant",
        scopeDescription: "Data tenant",
        scopeTitle: "Tenant Uji",
      } as Omit<ComponentProps<typeof CmsShell>, "children"> as ComponentProps<typeof CmsShell>,
      createElement("p", null, "Konten"),
    ),
  );
}

function currentLabels(html: string) {
  return [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>([\s\S]*?)<\/a>/g)].map((match) =>
    match[1].replace(/<[^>]*>/g, "").trim(),
  );
}

describe("rendered CMS shell", () => {
  const html = renderTenantShell("/app/kontak/pengirim");

  it("renders one labelled navigation landmark with the GeraiCUAN brand anchor", () => {
    expect(html.match(/<nav aria-label="Navigasi tenant"/g)).toHaveLength(1);
    const brand = /<a[^>]*href="\/app"[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1] ?? "";
    expect(brand.replace(/<[^>]*>/g, " ")).toContain("GeraiCUAN");
  });

  it("marks only the current destination", () => {
    expect(currentLabels(html)).toEqual(["Pengirim"]);
  });

  // T-188: the rendered sidebar reads the URL's own search params, so a
  // contact opened from Penerima keeps Penerima current.
  it("marks the contact menu the detail or create form was opened from", () => {
    expect(currentLabels(renderTenantShell("/app/kontak/00000000-0000-4000-8000-000000000663", "dari=penerima"))).toEqual(["Penerima"]);
    expect(currentLabels(renderTenantShell("/app/kontak/baru", "peran=penerima"))).toEqual(["Penerima"]);
    expect(currentLabels(renderTenantShell("/app/kontak/baru"))).toEqual(["Pengirim"]);
  });

  it("exposes exactly one accessible sidebar toggle, sized for touch", () => {
    const toggles = [...html.matchAll(/<button[^>]*aria-label="Buka atau tutup navigasi"[^>]*>/g)];
    expect(toggles).toHaveLength(1);
    expect(toggles[0][0]).toMatch(/\bsize-11\b/);
    // The rail is a pointer affordance hidden from assistive technology.
    expect(html).toMatch(/<button[^>]*data-sidebar="rail"[^>]*aria-hidden="true"/);
  });

  it("mounts no tooltip layers on navigation while the sidebar is expanded, and no data-state on any nav link", () => {
    // A mounted Radix tooltip marks its trigger with data-state; each one is a
    // separate Escape layer, so none may exist on the expanded or mobile nav.
    // The group disclosure trigger carries data-state on its own <button> (and
    // its <li>), never on the item <a>, which is the shape this assertion pins.
    const nav = /<nav aria-label="Navigasi tenant"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    expect(nav).toContain('href="/app/kontak/pengirim"');
    expect(nav).toContain('href="/app/kontak/penerima"');
    expect(nav).not.toMatch(/<a[^>]*data-state=/);
  });

  it("renders the account trigger as the large menu button in the sidebar footer", () => {
    const footer = /data-slot="sidebar-footer"[\s\S]*?<\/div>\s*<\/div>/.exec(html)?.[0] ?? "";
    expect(footer).toMatch(/data-size="lg"/);
    expect(footer).toContain("Demo Tenant Admin");
  });
});

describe("T-204 flat navigation list (supersedes the PR-54 / T-187 tree)", () => {
  const groupLabels = ["Pengiriman", "Data", "Cek", "Laporan", "Pengelolaan"];

  it("renders every destination with its own icon under an uppercase group label, all visible", () => {
    const html = renderTenantShell("/app/kontak/pengirim");
    const nav = /<nav aria-label="Navigasi tenant"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    for (const label of groupLabels) {
      const heading = new RegExp(`<div[^>]*data-sidebar="group-label"[^>]*id="cms-nav-group-${label.toLowerCase()}"[^>]*>${label}</div>`).exec(nav)?.[0] ?? "";
      expect(heading, label).toMatch(/\buppercase\b/);
      // The list under it is named by it.
      expect(nav).toMatch(new RegExp(`<ul[^>]*aria-labelledby="cms-nav-group-${label.toLowerCase()}"`));
    }
    // The brand link is the large menu button; destinations are the default size.
    const links = [...nav.matchAll(/<a(?=[^>]*data-size="default")[^>]*data-sidebar="menu-button"[^>]*>([\s\S]*?)<\/a>/g)];
    const labels = links.map((match) => match[1].replace(/<[^>]*>/g, "").trim());
    expect(labels).toEqual([
      "Dasbor", "Buat kiriman", "Histori kiriman", "Retur (RTS)", "Cetak resi", "Pengirim", "Penerima",
      "Cek resi", "Cek tarif", "Laporan pengiriman", "Riwayat cetak resi", "Pengaturan",
    ]);
    for (const [, content] of links) {
      expect(content).toMatch(/^<svg[^>]*aria-hidden="true"/);
    }
    // One icon per destination, none repeated.
    const icons = links.map(([, content]) => /class="lucide ([^" ]+)/.exec(content)?.[1]);
    expect(new Set(icons).size).toBe(icons.length);
    expect(nav).not.toContain("aria-expanded");
    expect(nav).not.toContain("data-nav-tree-item");
    expect(nav).not.toMatch(/Impor CSV|Keuangan|Analitik/);
  });

  it.each([
    ["/app/pengiriman/baru", "Buat kiriman"],
    ["/app/cek-resi", "Cek resi"],
    ["/app/laporan/pengiriman", "Laporan pengiriman"],
    ["/app/anggota", "Pengaturan"],
  ] as const)("marks %s's destination (%s) current with the soft accent", (pathname, currentLabel) => {
    const html = renderTenantShell(pathname);
    expect(currentLabels(html)).toEqual([currentLabel]);
    const current = /<a[^>]*aria-current="page"[^>]*>/.exec(html)?.[0] ?? "";
    expect(current).toContain('data-active="true"');
    expect(current).toContain("data-active:bg-sidebar-accent");
    expect(current).toMatch(/\bh-10\b/);
    expect(current).toMatch(/\bmax-md:h-11\b/);
  });
});

describe("T-204 top bar", () => {
  const html = renderTenantShell("/app");
  const header = /<header[^>]*data-slot="cms-header"[\s\S]*?<\/header>/.exec(html)?.[0] ?? "";

  it("shows the store, the role badge and the scope line, then the page search", () => {
    expect(header).toMatch(/<strong[^>]*>Tenant Uji<\/strong>/);
    expect(header).toContain("Tenant Admin");
    expect(header).toContain("Data tenant");
    expect(header).toMatch(/aria-label="Cari halaman"/);
    expect(header).toContain("⌘K");
    expect(header).toMatch(/\bh-16\b/);
  });
});

describe("mobile shell contracts that server render cannot reach", () => {
  // The Sheet only mounts in the browser below 768px; these are verified in
  // Chromium (ui-validation) and pinned here at their source.
  const sidebar = readFileSync("src/components/ui/sidebar.tsx", "utf8");
  const navigation = readFileSync("src/app/_components/cms-navigation.tsx", "utf8");
  const shell = readFileSync("src/app/_components/cms-shell.tsx", "utf8");

  it("names the Sheet in Indonesian and replaces its 28px close with a 44px one", () => {
    expect(sidebar).toContain("<SheetTitle>Navigasi GeraiCUAN</SheetTitle>");
    expect(sidebar).toMatch(/if \(isMobile\) \{[\s\S]*?showCloseButton=\{false\}/);
    expect(navigation).toMatch(/<SheetClose asChild>\s*<Button aria-label="Tutup navigasi" className="order-last size-11/);
  });

  it("opens the account menu below its trigger on mobile", () => {
    expect(shell).toContain('side={isMobile ? "bottom" : "right"}');
  });

  it("keeps the collapsed rail as the same items with tooltips, no flyout", () => {
    expect(navigation).toContain('state === "collapsed" && !isMobile ? label : undefined');
    expect(navigation).toContain("tooltip={railTooltip(item.label)}");
    expect(navigation).not.toContain("isRail");
  });
});
