import { readFileSync } from "node:fs";
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * R6-X (critique 2026-09-30T19-21-59Z, harden + adapt): the component contracts behind the
 * Cetak resi selection, the handover result announcement, the card focus ring, the header's
 * accessible names and hit area, and the courier logos' reserved box. Rendered on the server;
 * no database, no Mengantar.
 */

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/label",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => nav.params,
}));

const { BatchSelectionProvider, SelectRowCheckbox } = await import("@/app/app/label/batch-selection");
const { HandoverNotice } = await import("@/app/app/label/handover-dialog");
const { RecordItem } = await import("@/components/app/record-list");
const { CourierLogo } = await import("@/components/app/courier-logo");
const { SiteHeader } = await import("@/components/app/site-header");
const { SidebarProvider } = await import("@/components/ui/sidebar");
const { MENGANTAR_COURIERS } = await import("@/lib/mengantar-couriers");

function rowBoxes(cetak: string | null) {
  nav.params = new URLSearchParams(cetak ? { cetak } : {});
  const children = [
    createElement(SelectRowCheckbox, { awb: "AWB10301", key: "table", number: 10301 }),
    createElement(SelectRowCheckbox, { awb: "AWB10301", key: "card", number: 10301, visibleLabel: true }),
    createElement(HandoverNotice, { key: "notice" }),
  ];
  // children go as arguments (react/no-children-prop); the props type still lists them.
  return renderToStaticMarkup(createElement(BatchSelectionProvider, { numbers: [10301] } as unknown as ComponentProps<typeof BatchSelectionProvider>, ...children));
}

describe("Cetak resi selection (R6-X #3, #8)", () => {
  it("names each row box after what choosing it does, in both layouts", () => {
    const handover = rowBoxes("sudah");
    expect(handover).toContain('aria-label="Pilih paket AWB10301 untuk diserahkan"');
    expect(handover).toMatch(/for="pilih-kartu-10301"><span class="sr-only">Pilih paket AWB10301 untuk diserahkan<\/span>/);
    expect(handover).not.toContain("Pilih untuk cetak");
    for (const cetak of [null, "semua", "belum", "diserahkan"]) {
      const print = rowBoxes(cetak);
      expect(print, String(cetak)).toContain('aria-label="Pilih untuk cetak resi AWB10301"');
      expect(print, String(cetak)).toMatch(/<span class="sr-only">Pilih untuk cetak resi AWB10301<\/span>/);
      expect(print, String(cetak)).not.toContain("untuk diserahkan");
    }
  });

  it("keeps the handover result's status region mounted and empty before a result, and the bar slot after the list", () => {
    const html = rowBoxes("sudah");
    expect(html).toContain('<div data-slot="handover-notice" role="status"></div>');
    // The pinned bar's landing place follows the rows in DOM (and so tab) order.
    expect(html.indexOf('data-slot="selection-bar-slot"')).toBeGreaterThan(html.lastIndexOf('id="pilih-kartu-10301"'));
    expect(html).toMatch(/<p aria-live="polite" class="sr-only"><\/p>/);
  });
});

describe("focus, names and targets (R6-X #8, #12)", () => {
  it("draws the card focus ring at full --ring strength (≥ 3:1), not ring/50", () => {
    const html = renderToStaticMarkup(createElement(RecordItem, { href: "/app/label/10301", title: "GC-10301" }));
    expect(html).toContain("has-[a[data-slot=record-link]:focus-visible]:ring-2 has-[a[data-slot=record-link]:focus-visible]:ring-ring ");
    expect(html).not.toContain("ring-ring/50");
  });

  it("names the header search by its visible text and gives the home link a 44/40px target", () => {
    const html = renderToStaticMarkup(createElement(SidebarProvider, null,
      createElement(SiteHeader, { roleLabel: "Operator", scope: { kind: "tenant", role: "OPERATOR" }, subtitle: "Outlet", title: "Gerai" })));
    const search = html.match(/<button[^>]*aria-keyshortcuts="Meta\+K Control\+K"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(search).not.toContain("aria-label=");
    expect(search.replace(/<[^>]+>/g, "")).toBe("Cari halaman…⌘K");
    const home = html.match(/<a[^>]*aria-label="GeraiCuan, ke beranda"[^>]*>/)?.[0] ?? "";
    expect(home).toMatch(/\bmin-h-11\b/);
    expect(home).toMatch(/\bmd:min-h-10\b/);
  });

  it("gives every courier logo an intrinsic width and height in its SVG's aspect ratio", () => {
    for (const courier of MENGANTAR_COURIERS) {
      const svg = readFileSync(`public/couriers/${courier.toLowerCase()}.svg`, "utf8");
      const [, , width, height] = /viewBox="([^"]+)"/.exec(svg)![1]!.trim().split(/\s+/).map(Number);
      const html = renderToStaticMarkup(createElement(CourierLogo, { courier }));
      expect(html, courier).toContain('height="24"');
      expect(html, courier).toContain(`width="${Math.round((24 * width!) / height!)}"`);
    }
  });
});
