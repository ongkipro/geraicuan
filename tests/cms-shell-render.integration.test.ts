import { readFileSync } from "node:fs";

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CmsShell } from "@/app/_components/cms-shell";

let mockPathname = "/app/kontak";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

// Server render gives the desktop tree (useIsMobile's server snapshot is
// false), so these assertions read the markup the browser first receives.
function renderTenantShell(pathname: string) {
  mockPathname = pathname;
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

// Attribute order in the rendered tag depends on Radix's Slot merge, not on
// JSX source order, so these look up the tag by its (unique, ours) aria-label
// and then check aria-expanded within that tag — order-independent.
function toggleButtonTag(html: string, groupLabel: string, state: "open" | "closed") {
  const label = state === "open" ? `Tutup grup ${groupLabel}` : `Buka grup ${groupLabel}`;
  return new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(html)?.[0] ?? null;
}

function toggleButton(html: string, groupLabel: string) {
  const openTag = toggleButtonTag(html, groupLabel, "open");
  if (openTag && openTag.includes('aria-expanded="true"')) return "open";
  const closedTag = toggleButtonTag(html, groupLabel, "closed");
  if (closedTag && closedTag.includes('aria-expanded="false"')) return "closed";
  return null;
}

describe("rendered CMS shell", () => {
  const html = renderTenantShell("/app/kontak");

  it("renders one labelled navigation landmark with the GeraiCUAN brand anchor", () => {
    expect(html.match(/<nav aria-label="Navigasi tenant"/g)).toHaveLength(1);
    const brand = /<a[^>]*href="\/app"[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1] ?? "";
    expect(brand.replace(/<[^>]*>/g, " ")).toContain("GeraiCUAN");
  });

  it("marks only the current destination", () => {
    expect(currentLabels(html)).toEqual(["Kontak"]);
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
    // The group disclosure trigger carries data-state on its own <button>,
    // never on the item <a>, which is the shape this assertion pins.
    const nav = /<nav aria-label="Navigasi tenant"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    expect(nav).toContain('href="/app/kontak"');
    expect(nav).not.toMatch(/<a[^>]*data-state=/);
  });

  it("renders the account trigger as the large menu button in the sidebar footer", () => {
    const footer = /data-slot="sidebar-footer"[\s\S]*?<\/div>\s*<\/div>/.exec(html)?.[0] ?? "";
    expect(footer).toMatch(/data-size="lg"/);
    expect(footer).toContain("Demo Tenant Admin");
  });
});

describe("PR-54 collapsible navigation groups", () => {
  it("opens only the group holding the current route, forced open regardless of the (absent, client-only) stored preference", () => {
    const html = renderTenantShell("/app/kontak");
    // Utama is a single unlabelled destination, never collapsible.
    expect(html).toContain("<span>Dasbor</span>");
    // Data holds the current route (Kontak), so it is open and its item renders.
    expect(toggleButton(html, "Data")).toBe("open");
    expect(html).toContain("<span>Kontak</span>");
    // Every other group starts closed, so their items are not in the markup at all.
    for (const group of ["Pengiriman", "Cek", "Laporan", "Pengelolaan"]) {
      expect(toggleButton(html, group)).toBe("closed");
    }
    for (const hiddenLabel of ["Buat kiriman", "Impor CSV", "Histori kiriman", "Retur (RTS)", "Cetak resi", "Cek resi", "Cek tarif", "Analitik", "Keuangan", "Pengaturan"]) {
      expect(html).not.toContain(`<span>${hiddenLabel}</span>`);
    }
  });

  it.each([
    ["/app/pengiriman/baru", "Pengiriman", "Buat kiriman", ["Impor CSV", "Histori kiriman", "Retur (RTS)", "Cetak resi"]],
    ["/app/cek-resi", "Cek", "Cek resi", ["Cek tarif"]],
    ["/app/analitik", "Laporan", "Analitik", []],
    ["/app/keuangan", "Pengelolaan", "Keuangan", ["Pengaturan"]],
  ] as const)("opens %s's group (%s) and renders every sibling destination", (pathname, group, currentLabel, siblings) => {
    const html = renderTenantShell(pathname);
    expect(toggleButton(html, group)).toBe("open");
    expect(currentLabels(html)).toEqual([currentLabel]);
    expect(html).toContain(`<span>${currentLabel}</span>`);
    for (const sibling of siblings) {
      expect(html).toContain(`<span>${sibling}</span>`);
    }
  });

  it("keeps the disclosure row split: a plain heading label plus a separate chevron button carrying aria-expanded", () => {
    const html = renderTenantShell("/app/kontak");
    // The chevron button is its own element with its own accessible name;
    // it never wraps (and never is) the group's own text label.
    const tag = toggleButtonTag(html, "Data", "open");
    expect(tag).toContain('aria-expanded="true"');
    expect(tag).toContain('aria-controls="cms-nav-group-data"');
    expect(html).toContain('<span class="flex-1 truncate">Data</span>');
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

  it("persists group open state in localStorage, read only in an effect (never during the SSR-equivalent render)", () => {
    expect(navigation).toContain('window.localStorage.getItem(GROUP_STATE_STORAGE_KEY)');
    expect(navigation).toContain('window.localStorage.setItem(GROUP_STATE_STORAGE_KEY');
    expect(navigation).toMatch(/useEffect\(\(\) => \{[\s\S]*?applyStoredGroupState\(\);/);
    // The initial useState is a pure function of the route-derived groups, so
    // the first client render matches the server render exactly.
    expect(navigation).toContain("useState<Record<string, boolean>>(() => defaultOpenGroups(groups))");
  });

  it("opens a DropdownMenu flyout for each group at the icon-rail width, because SidebarMenuSub is hidden there", () => {
    expect(sidebar).toContain("group-data-[collapsible=icon]:hidden");
    expect(navigation).toContain("const isRail = state === \"collapsed\" && !isMobile;");
    expect(navigation).toMatch(/if \(isRail\) \{[\s\S]*?<DropdownMenu>/);
  });
});
