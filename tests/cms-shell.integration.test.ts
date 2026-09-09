import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { completeCmsSignOut } from "@/app/_components/sign-out-control";
import {
  platformCmsNavigation,
  tenantCmsNavigation,
} from "@/lib/cms-shell-navigation";

function itemsFor(role: "TENANT_ADMIN" | "OPERATOR", pathname: string) {
  return tenantCmsNavigation(role, pathname).flatMap((group) => group.items);
}

function platformItemsFor(pathname: string) {
  return platformCmsNavigation(pathname).flatMap((group) => group.items);
}

describe("tenant CMS shell contract", () => {
  it("shows only role-permitted destinations", () => {
    const operatorLabels = itemsFor("OPERATOR", "/app").map(
      (item) => item.label,
    );
    const adminLabels = itemsFor("TENANT_ADMIN", "/app").map(
      (item) => item.label,
    );

    expect(operatorLabels).toEqual(["Ringkasan", "Kiriman", "Retur (RTS)", "Kontak"]);
    expect(operatorLabels).not.toContain("Analitik");
    expect(operatorLabels).not.toContain("Outlet & koneksi");
    expect(operatorLabels).not.toContain("Anggota & akses");
    expect(adminLabels).toContain("Analitik");
    expect(adminLabels).toContain("Outlet & koneksi");
    expect(adminLabels).toContain("Anggota & akses");
  });

  it.each([
    ["/app", "Ringkasan"],
    ["/app/impor", "Kiriman"],
    ["/app/pengiriman", "Kiriman"],
    ["/app/pengiriman/baru", "Kiriman"],
    ["/app/pengiriman/3b4f", "Kiriman"],
    ["/app/pengiriman/rts", "Retur (RTS)"],
    ["/app/label", "Kiriman"],
    ["/app/label/3b4f", "Kiriman"],
    ["/app/analitik", "Analitik"],
    ["/app/kontak", "Kontak"],
    ["/app/kontak/baru", "Kontak"],
    ["/app/kontak/3b4f", "Kontak"],
    ["/app/pengaturan", "Outlet & koneksi"],
    ["/app/anggota", "Anggota & akses"],
  ])("marks exactly one current destination for %s", (pathname, label) => {
    const items = itemsFor("TENANT_ADMIN", pathname);
    const current = items.filter((item) => item.current);

    expect(current).toHaveLength(1);
    expect(current[0]?.label).toBe(label);
  });

  it("uses the accepted navigation groups in task order", () => {
    expect(
      tenantCmsNavigation("TENANT_ADMIN", "/app").map((group) => group.label),
    ).toEqual(["Utama", "Operasional", "Wawasan", "Administrasi"]);
    expect(
      tenantCmsNavigation("OPERATOR", "/app").map((group) => group.label),
    ).toEqual(["Utama", "Operasional"]);
  });

  it.each(["/app/analitik", "/app/keuangan", "/app/pengaturan", "/app/anggota"])(
    "does not claim a permitted destination is current on forbidden route %s",
    (pathname) => {
      expect(
        itemsFor("OPERATOR", pathname).filter((item) => item.current),
      ).toEqual([]);
    },
  );

  it("falls back to one discoverable current destination for an unknown nested route", () => {
    const current = itemsFor("OPERATOR", "/app/belum-dikenal").filter(
      (item) => item.current,
    );

    expect(current).toHaveLength(1);
    expect(current[0]?.label).toBe("Ringkasan");
  });
});

describe("platform CMS shell contract", () => {
  it("exposes only the accepted Super Admin workspaces without seeded tenant ids", () => {
    const groups = platformCmsNavigation("/platform");
    const items = groups.flatMap((group) => group.items);

    expect(groups.map((group) => group.label)).toEqual(["Platform"]);
    expect(items.map((item) => item.label)).toEqual(["Ringkasan", "Tenant", "Audit"]);
    expect(items.map((item) => item.href)).toEqual([
      "/platform",
      "/platform/tenant",
      "/platform/audit",
    ]);
    expect(items.map((item) => item.href).join(" ")).not.toContain("[tenantId]");
    expect(items.map((item) => item.href).join(" ")).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it.each([
    ["/platform", "Ringkasan"],
    ["/platform/tenant", "Tenant"],
    ["/platform/tenant/10000000-0000-4000-8000-000000000471", "Tenant"],
    ["/platform/audit", "Audit"],
  ])("marks exactly one platform current destination for %s", (pathname, label) => {
    const current = platformItemsFor(pathname).filter((item) => item.current);

    expect(current).toHaveLength(1);
    expect(current[0]?.label).toBe(label);
  });

  it("falls back to Ringkasan for an unknown platform route without exposing tenant navigation", () => {
    const items = platformItemsFor("/platform/belum-dikenal");
    const current = items.filter((item) => item.current);

    expect(current).toHaveLength(1);
    expect(current[0]?.label).toBe("Ringkasan");
    expect(items.map((item) => item.label)).not.toContain("Kiriman");
    expect(items.map((item) => item.label)).not.toContain("Anggota & akses");
  });
});

describe("CMS sign-out boundary", () => {
  it("ends the session before returning to the correct login entry", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    const navigate = vi.fn();

    await completeCmsSignOut(request, navigate, "/login/tenant");

    expect(request).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({
        credentials: "same-origin",
        method: "POST",
      }),
    );
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/login/tenant");
  });

  it("keeps the operator in place when sign-out is rejected", async () => {
    const request = vi.fn().mockResolvedValue({ ok: false });
    const navigate = vi.fn();

    await expect(
      completeCmsSignOut(request, navigate, "/login/super-admin"),
    ).rejects.toThrow("CMS sign-out request failed");
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("responsive CMS navigation presentation", () => {
  const shellSource = readFileSync(
    "src/app/_components/cms-shell.tsx",
    "utf8",
  );
  const navigationSource = readFileSync(
    "src/app/_components/cms-navigation.tsx",
    "utf8",
  );
  const signOutSource = readFileSync(
    "src/app/_components/sign-out-control.tsx",
    "utf8",
  );

  it("uses a labelled mobile Sheet trigger, tablet rail, and full desktop sidebar", () => {
    expect(shellSource).toContain('className="h-11 gap-2 px-3 md:hidden"');
    expect(shellSource).toContain("<span>Menu</span>");
    expect(shellSource).toContain(
      'className="hidden md:flex lg:hidden">{navigation("rail")}',
    );
    expect(shellSource).toContain(
      'className="hidden lg:flex">{navigation("sidebar")}',
    );
  });

  it("keeps rail destinations named, current, tooltip-assisted, and at least 44px", () => {
    expect(navigationSource).toContain('props.presentation === "rail"');
    expect(navigationSource).toContain(
      'className="flex min-h-11 w-full items-center justify-center',
    );
    expect(navigationSource).toContain("data-active={item.current}");
    expect(navigationSource).toContain(
      'aria-current={item.current ? "page" : undefined}',
    );
    expect(navigationSource).toContain(
      '<span className="sr-only">{item.label}</span>',
    );
    expect(navigationSource).toContain("<TooltipContent side=\"right\">");
  });

  it("keeps account and sign-out controls at least 44px tall", () => {
    expect(shellSource).toContain('className="min-h-11 gap-2 px-2"');
    expect(signOutSource).toContain(
      'className="cms-signout-button min-h-11"',
    );
  });

  it("replaces protected history after sign-out so Back cannot restore it", () => {
    expect(shellSource).toContain(
      "window.location.replace(destination)",
    );
    expect(shellSource).not.toContain(
      "window.location.assign(destination)",
    );
    expect(shellSource).toContain("onCloseAutoFocus={(event) => {");
    expect(shellSource).toContain("signOutDestinationRef.current = destination;");
    expect(shellSource).toContain("setAccountOpen(false);");
    expect(signOutSource).toContain("onSignedOut");
    expect(shellSource).toContain(
      'window.addEventListener("pageshow", revalidateRestoredSession)',
    );
    expect(shellSource).toContain("if (!event.persisted) return;");
    expect(shellSource).toContain(
      'document.documentElement.style.visibility = "hidden"',
    );
    expect(shellSource).toContain("window.location.reload();");
  });

  it("keeps the account menu controlled for pointer and keyboard activation", () => {
    expect(shellSource).toContain(
      "<DropdownMenu onOpenChange={setAccountOpen} open={accountOpen}>",
    );
    expect(shellSource).toContain("onPointerDown={(event) => {");
    expect(shellSource).toContain("setAccountOpen((open) => !open);");
  });
});
