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

// T-187: each group row is one <button> whose visible label is its accessible
// name. Attribute order in the rendered tag depends on Radix's Slot merge, so
// look the tag up by our data-nav-group-trigger attribute and read the rest of
// the button (tag plus content) order-independently.
function groupTrigger(html: string, groupLabel: string) {
  return new RegExp(`<button(?=[^>]*data-nav-group-trigger="${groupLabel}")[^>]*>[\\s\\S]*?</button>`).exec(html)?.[0] ?? null;
}

function toggleButton(html: string, groupLabel: string) {
  const trigger = groupTrigger(html, groupLabel);
  if (trigger?.includes('aria-expanded="true"')) return "open";
  if (trigger?.includes('aria-expanded="false"')) return "closed";
  return null;
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

describe("PR-54 / T-187 collapsible navigation tree", () => {
  it("opens every group on a first visit (no stored preference exists on the server render)", () => {
    const html = renderTenantShell("/app/kontak/pengirim");
    // Utama is a single unlabelled destination, never collapsible.
    expect(html).toContain("<span>Dasbor</span>");
    for (const group of ["Pengiriman", "Data", "Cek", "Laporan", "Pengelolaan"]) {
      expect(toggleButton(html, group)).toBe("open");
    }
    for (const label of ["Pengirim", "Penerima", "Buat kiriman", "Impor CSV", "Histori kiriman", "Retur (RTS)", "Cetak resi", "Cek resi", "Cek tarif", "Analitik", "Laporan pengiriman", "Riwayat cetak resi", "Keuangan", "Pengaturan"]) {
      expect(html).toContain(`<span>${label}</span>`);
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

  it("makes the whole row (icon, label, chevron) one native disclosure button named by its visible label", () => {
    const html = renderTenantShell("/app/kontak/pengirim");
    const trigger = groupTrigger(html, "Data");
    expect(trigger).not.toBeNull();
    expect(trigger).toContain('type="button"');
    expect(trigger).toContain('aria-expanded="true"');
    expect(trigger).toContain('aria-controls="cms-nav-group-data"');
    // The label text lives INSIDE the button, so clicking it toggles the group;
    // no aria-label overrides the visible name (WCAG 2.5.3).
    expect(trigger).toMatch(/<span[^>]*>Data<\/span>/);
    expect(trigger).not.toMatch(/^<button[^>]*aria-label=/);
    // Row height: 36px desktop, 44px touch.
    expect(trigger).toMatch(/\bh-9\b/);
    expect(trigger).toMatch(/\bmax-md:h-11\b/);
    // The old split shape (a separate "Buka/Tutup grup" chevron button) is gone.
    expect(html).not.toMatch(/aria-label="(Buka|Tutup) grup /);
  });

  it("draws each group's items as a tree: guide and connector pseudo-elements on every item, the last guide stopping at its connector", () => {
    const html = renderTenantShell("/app/kontak/pengirim");
    const items = [...html.matchAll(/<li[^>]*data-nav-tree-item[^>]*>/g)].map((match) => match[0]);
    expect(items).toHaveLength(14);
    for (const item of items) {
      expect(item).toMatch(/before:absolute/);
      expect(item).toMatch(/after:absolute/);
      expect(item).toMatch(/last:before:bottom-1\/2/);
    }
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
    // T-187: stored collapse is honoured, the current-route group always wins,
    // and a group absent from storage defaults to open.
    expect(navigation).toContain("groupHoldsCurrent(group) || (stored[group.label] ?? previous[group.label] ?? true)");
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
