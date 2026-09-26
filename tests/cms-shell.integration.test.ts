import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { matchHas } from "next/dist/shared/lib/router/utils/prepare-destination";

import nextConfig from "../next.config";
import {
  platformCmsNavigation,
  tenantCmsNavigation,
} from "@/lib/cms-shell-navigation";

function itemsFor(role: "TENANT_ADMIN" | "OPERATOR", pathname: string, search?: string) {
  return tenantCmsNavigation(role, pathname, search === undefined ? undefined : new URLSearchParams(search))
    .flatMap((group) => group.items);
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

    expect(operatorLabels).toEqual([
      "Dasbor", "Buat kiriman", "Histori kiriman", "Retur (RTS)", "Cetak resi", "Pengirim", "Penerima", "Cek resi", "Cek tarif",
    ]);
    expect(operatorLabels).not.toContain("Laporan pengiriman");
    expect(operatorLabels).not.toContain("Pengaturan");
    expect(operatorLabels).not.toContain("Anggota & akses");
    expect(adminLabels).toContain("Laporan pengiriman");
    expect(adminLabels).toContain("Pengaturan");
    // T-204: the masking product has no Impor CSV, Keuangan or Analitik menu.
    for (const removed of ["Impor CSV", "Keuangan", "Analitik"]) expect(adminLabels).not.toContain(removed);
    expect(adminLabels).not.toContain("Anggota & akses");
  });

  it.each([
    ["/app", "Dasbor"],
    ["/app/pengiriman", "Histori kiriman"],
    ["/app/pengiriman/baru", "Buat kiriman"],
    ["/app/pengiriman/3b4f", "Histori kiriman"],
    ["/app/pengiriman/rts", "Retur (RTS)"],
    ["/app/label", "Cetak resi"],
    ["/app/label/3b4f", "Cetak resi"],
    ["/app/laporan/pengiriman", "Laporan pengiriman"],
    ["/app/laporan/cetak-resi", "Riwayat cetak resi"],
    ["/app/kontak/pengirim", "Pengirim"],
    ["/app/kontak/penerima", "Penerima"],
    ["/app/kontak/baru", "Pengirim"],
    ["/app/kontak/3b4f", "Pengirim"],
    ["/app/pengaturan", "Pengaturan"],
    ["/app/anggota", "Pengaturan"],
    ["/app/cek-resi", "Cek resi"],
    ["/app/cek-tarif", "Cek tarif"],
  ])("marks exactly one current destination for %s", (pathname, label) => {
    const items = itemsFor("TENANT_ADMIN", pathname);
    const current = items.filter((item) => item.current);

    expect(current).toHaveLength(1);
    expect(current[0]?.label).toBe(label);
  });

  it("uses the accepted navigation groups in task order (PR-54)", () => {
    expect(
      tenantCmsNavigation("TENANT_ADMIN", "/app").map((group) => group.label),
    ).toEqual(["Utama", "Pengiriman", "Data", "Cek", "Laporan", "Pengelolaan"]);
    expect(
      tenantCmsNavigation("OPERATOR", "/app").map((group) => group.label),
    ).toEqual(["Utama", "Pengiriman", "Data", "Cek"]);
  });

  it("keeps Cetak resi in the Pengiriman group and no Impor CSV (PR-54, T-204)", () => {
    const group = tenantCmsNavigation("TENANT_ADMIN", "/app").find(({ label }) => label === "Pengiriman");
    expect(group?.items.map((item) => [item.key, item.label, item.href])).toEqual([
      ["shipment-new", "Buat kiriman", "/app/pengiriman/baru"],
      ["shipments", "Histori kiriman", "/app/pengiriman"],
      ["rts", "Retur (RTS)", "/app/pengiriman/rts"],
      ["print-label", "Cetak resi", "/app/label"],
    ]);
  });

  it("splits contacts into Pengirim and Penerima in the Data group and gathers the reports under Laporan (PR-54, PR-55, T-188)", () => {
    const groups = tenantCmsNavigation("TENANT_ADMIN", "/app");
    expect(groups.find(({ label }) => label === "Data")?.items.map((item) => [item.key, item.label, item.shortLabel, item.href])).toEqual([
      ["contacts-sender", "Pengirim", "PG", "/app/kontak/pengirim"],
      ["contacts-recipient", "Penerima", "PN", "/app/kontak/penerima"],
    ]);
    // T-165 and T-166 are Tenant Admin records, so an operator sees no Laporan
    // group at all; T-204 removed Analitik (its courier view moves into the report).
    expect(groups.find(({ label }) => label === "Laporan")?.items.map((item) => [item.key, item.label, item.href])).toEqual([
      ["shipment-report", "Laporan pengiriman", "/app/laporan/pengiriman"],
      ["print-history-report", "Riwayat cetak resi", "/app/laporan/cetak-resi"],
    ]);
    expect(
      tenantCmsNavigation("OPERATOR", "/app").map((group) => group.label),
    ).not.toContain("Laporan");

    const navigationLibSource = readFileSync("src/lib/cms-shell-navigation.ts", "utf8");
    expect(navigationLibSource).toContain("T-165");
    expect(navigationLibSource).toContain("T-166");
  });

  it("keeps the Cek group available to both roles with its lookup destinations (PR-51)", () => {
    for (const role of ["TENANT_ADMIN", "OPERATOR"] as const) {
      const group = tenantCmsNavigation(role, "/app").find(({ label }) => label === "Cek");
      expect(group?.items.map((item) => [item.key, item.label, item.href])).toEqual([
        ["tracking-lookup", "Cek resi", "/app/cek-resi"],
        ["quick-rate", "Cek tarif", "/app/cek-tarif"],
      ]);
    }
  });

  // T-188: the create form and a contact detail belong to the menu they were
  // opened from (`peran` / `dari`), defaulting to Pengirim; the query never
  // moves a role list itself.
  it.each([
    ["/app/kontak/baru", "peran=penerima", "Penerima"],
    ["/app/kontak/baru", "peran=pengirim", "Pengirim"],
    ["/app/kontak/baru", "peran=semua", "Pengirim"],
    ["/app/kontak/baru", "dari=penerima", "Pengirim"],
    ["/app/kontak/00000000-0000-4000-8000-000000000663", "dari=penerima", "Penerima"],
    ["/app/kontak/00000000-0000-4000-8000-000000000663", "dari=pengirim&alamat=x", "Pengirim"],
    ["/app/kontak/00000000-0000-4000-8000-000000000663", "", "Pengirim"],
    ["/app/kontak/00000000-0000-4000-8000-000000000663", "peran=penerima", "Pengirim"],
    ["/app/kontak/pengirim", "dari=penerima", "Pengirim"],
    ["/app/kontak/penerima", "peran=pengirim", "Penerima"],
  ])("marks the contact menu for %s?%s as %s", (pathname, search, label) => {
    const current = itemsFor("OPERATOR", pathname, search).filter((item) => item.current);
    expect(current.map((item) => item.label)).toEqual([label]);
  });

  // T-188: /app/kontak no longer has a page. Old links and bookmarks resolve
  // through next.config redirects, evaluated here with Next's own matchers in
  // declaration order (first match wins, as the router applies them).
  it.each([
    ["/app/kontak", "", "/app/kontak/pengirim"],
    ["/app/kontak", "peran=semua", "/app/kontak/pengirim"],
    ["/app/kontak", "peran=pengirim&status=archived", "/app/kontak/pengirim"],
    ["/app/kontak", "status=all&peran=penerima", "/app/kontak/penerima"],
    ["/app/kontak", "peran=penerimaX", "/app/kontak/pengirim"],
    ["/app/kontak/penerima", "", null],
    ["/app/kontak/baru", "peran=penerima", null],
  ])("redirects the legacy contact URL %s?%s to %s", async (pathname, search, destination) => {
    const query = Object.fromEntries(new URLSearchParams(search));
    const redirects = await nextConfig.redirects!();
    const match = redirects.find((rule) =>
      getPathMatch(rule.source)(pathname)
      && matchHas({ headers: {} } as never, query, rule.has, rule.missing));
    expect(match?.destination ?? null).toBe(destination);
    if (match) expect(match).toMatchObject({ permanent: true });
    // The destination is a page the menu owns.
    if (destination) expect(itemsFor("OPERATOR", destination).filter((item) => item.current)).toHaveLength(1);
  });

  it.each(["/app/laporan/pengiriman", "/app/laporan/cetak-resi", "/app/pengaturan", "/app/anggota"])(
    "does not claim a permitted destination is current on forbidden route %s",
    (pathname) => {
      expect(
        itemsFor("OPERATOR", pathname).filter((item) => item.current),
      ).toEqual([]);
    },
  );

  // `aria-current="page"` on Dasbor while the operator stands on an unmapped
  // route is a wrong answer; nothing current is the honest state.
  it("marks nothing current on a route the menu does not own", () => {
    expect(
      itemsFor("OPERATOR", "/app/belum-dikenal").filter((item) => item.current),
    ).toEqual([]);
  });
});

describe("platform CMS shell contract", () => {
  it("exposes only the accepted Super Admin workspaces without seeded tenant ids", () => {
    const groups = platformCmsNavigation("/platform");
    const items = groups.flatMap((group) => group.items);

    expect(groups.map((group) => group.label)).toEqual(["Platform"]);
    // T-182 (PR-61) adds the approval queue.
    expect(items.map((item) => item.label)).toEqual(["Ringkasan", "Gerai", "Pendaftaran", "Audit"]);
    expect(items.map((item) => item.href)).toEqual([
      "/platform",
      "/platform/tenant",
      "/platform/pendaftaran",
      "/platform/audit",
    ]);
    expect(items.map((item) => item.href).join(" ")).not.toContain("[tenantId]");
    expect(items.map((item) => item.href).join(" ")).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it.each([
    ["/platform", "Ringkasan"],
    ["/platform/tenant", "Gerai"],
    ["/platform/tenant/10000000-0000-4000-8000-000000000471", "Gerai"],
    ["/platform/pendaftaran", "Pendaftaran"],
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
