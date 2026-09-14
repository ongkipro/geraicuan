import { readFileSync } from "node:fs";

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CmsShell } from "@/app/_components/cms-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/kontak",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

// Server render gives the desktop tree (useIsMobile's server snapshot is
// false), so these assertions read the markup the browser first receives.
function renderTenantShell() {
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

describe("rendered CMS shell", () => {
  const html = renderTenantShell();

  it("renders one labelled navigation landmark with the GeraiCUAN brand anchor", () => {
    expect(html.match(/<nav aria-label="Navigasi tenant"/g)).toHaveLength(1);
    const brand = /<a[^>]*href="\/app"[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1] ?? "";
    expect(brand.replace(/<[^>]*>/g, " ")).toContain("GeraiCUAN");
  });

  it("marks only the current destination and names every destination", () => {
    const current = [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>([\s\S]*?)<\/a>/g)].map((match) =>
      match[1].replace(/<[^>]*>/g, "").trim(),
    );
    expect(current).toEqual(["Kontak"]);
    for (const label of ["Ringkasan", "Kiriman", "Retur (RTS)", "Analitik", "Keuangan", "Outlet &amp; koneksi", "Anggota &amp; akses"]) {
      expect(html).toContain(`<span>${label}</span>`);
    }
  });

  it("exposes exactly one accessible sidebar toggle, sized for touch", () => {
    const toggles = [...html.matchAll(/<button[^>]*aria-label="Buka atau tutup navigasi"[^>]*>/g)];
    expect(toggles).toHaveLength(1);
    expect(toggles[0][0]).toMatch(/\bsize-11\b/);
    // The rail is a pointer affordance hidden from assistive technology.
    expect(html).toMatch(/<button[^>]*data-sidebar="rail"[^>]*aria-hidden="true"/);
  });

  it("mounts no tooltip layers on navigation while the sidebar is expanded", () => {
    // A mounted Radix tooltip marks its trigger with data-state; each one is a
    // separate Escape layer, so none may exist on the expanded or mobile nav.
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
});
